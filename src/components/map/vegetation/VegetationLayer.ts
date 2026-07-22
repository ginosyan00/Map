import {
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type Map as MapLibreMap,
  MercatorCoordinate,
} from "maplibre-gl";
import {
  AmbientLight,
  Camera,
  DirectionalLight,
  Group,
  Matrix4,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import type { TreeInstanceSpec, VegetationDebugSnapshot, VegetationQualityId } from "@/types/vegetation";
import { VEGETATION_LAYER_ID } from "@/lib/vegetation/vegetation-config";
import { createDebugTreeGroup } from "@/lib/vegetation/create-debug-tree";
import {
  createVegetationInstancing,
  type VegetationInstancing,
} from "@/lib/vegetation/tree-instancing";
import {
  getTreeTemplates,
  preloadTreeTemplates,
} from "@/lib/vegetation/tree-model-loader";
import { createTreeWindController } from "@/lib/vegetation/tree-wind-animation";
import { queryTerrainAltitude } from "@/lib/map/terrain";
import { isDev } from "@/lib/map/constants";

type RuntimeDiag = {
  onAddCalls: number;
  renderCalls: number;
  lastRenderReason: string;
};

type RenderArgs = CustomRenderMethodInput & {
  getMatrixForModel?: (
    location: [number, number] | { lng: number; lat: number },
    altitude?: number,
  ) => Float32Array | number[];
};

/**
 * Debug tree uses the proven CustomBuildingLayer mercator bake.
 * InstancedMesh fleet uses local-meters around map center (vehicle pattern).
 */
export class VegetationLayer implements CustomLayerInterface {
  id = VEGETATION_LAYER_ID;
  type = "custom" as const;
  renderingMode = "3d" as const;

  private map: MapLibreMap | null = null;
  private renderer: WebGLRenderer | null = null;
  private scene = new Scene();
  private camera = new Camera();
  private enabled = true;
  private contextLost = false;
  private templatesReady = false;
  private pending: TreeInstanceSpec[] | null = null;
  private instancing: VegetationInstancing | null = null;
  private debugTree: Group | null = null;
  private debugLngLat: { lng: number; lat: number } | null = null;
  private groundOffset = 0.05;
  private wind = createTreeWindController(false);
  private quality: VegetationQualityId = "medium";
  private lodLabel = "hidden";
  private modelLoading = "idle";
  private lastBuildMeta: Partial<VegetationDebugSnapshot> = {};
  private diag: RuntimeDiag = { onAddCalls: 0, renderCalls: 0, lastRenderReason: "init" };

  private readonly tmpMain = new Matrix4();
  private readonly tmpModel = new Matrix4();

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.diag.onAddCalls += 1;
    this.map = map;
    this.camera = new Camera();
    this.scene = new Scene();

    const key = new DirectionalLight(0xffffff, 1.35);
    key.position.set(40, 80, 30);
    const fill = new DirectionalLight(0xffffff, 0.65);
    fill.position.set(-30, 40, -20);
    this.scene.add(key, fill, new AmbientLight(0xffffff, 0.75));

    this.debugTree = createDebugTreeGroup();
    this.debugTree.visible = this.enabled;
    // Identity — transform is baked into projectionMatrix (building-layer pattern).
    this.debugTree.position.set(0, 0, 0);
    this.debugTree.rotation.set(0, 0, 0);
    this.debugTree.scale.set(1, 1, 1);
    this.scene.add(this.debugTree);

    this.renderer = new WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl as WebGLRenderingContext,
      antialias: true,
    });
    this.renderer.autoClear = false;

    map.getCanvas().addEventListener("webglcontextlost", this.onContextLost);
    map.getCanvas().addEventListener("webglcontextrestored", this.onContextRestored);

    if (isDev()) {
      console.info("[vegetation] onAdd", {
        layerId: this.id,
        onAddCalls: this.diag.onAddCalls,
        hasDebugTree: Boolean(this.debugTree),
      });
    }

    this.modelLoading = "loading";
    void preloadTreeTemplates()
      .then(() => {
        this.templatesReady = true;
        this.modelLoading = "ready";
        if (this.pending) {
          this.applyInstances(this.pending);
          this.pending = null;
        }
        this.map?.triggerRepaint();
      })
      .catch((error) => {
        this.modelLoading = "error";
        console.warn("[vegetation] Tree templates failed (debug tree still active)", error);
      });

    this.map.triggerRepaint();
  }

  onRemove(): void {
    this.map?.getCanvas().removeEventListener("webglcontextlost", this.onContextLost);
    this.map?.getCanvas().removeEventListener("webglcontextrestored", this.onContextRestored);
    this.instancing?.dispose();
    this.instancing = null;
    this.debugTree = null;
    this.wind.dispose();
    this.scene.clear();
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (this.debugTree) this.debugTree.visible = enabled;
    for (const mesh of this.instancing?.meshes ?? []) {
      mesh.visible = enabled;
    }
    this.map?.triggerRepaint();
  }

  setGroundOffset(meters: number): void {
    this.groundOffset = meters;
  }

  setQualityMeta(quality: VegetationQualityId, lodLabel: string): void {
    this.quality = quality;
    this.lodLabel = lodLabel;
  }

  setBuildMeta(meta: Partial<VegetationDebugSnapshot>): void {
    this.lastBuildMeta = meta;
  }

  setDebugTreePosition(lng: number, lat: number): void {
    const prev = this.debugLngLat;
    if (prev && Math.abs(prev.lng - lng) < 1e-8 && Math.abs(prev.lat - lat) < 1e-8) {
      return;
    }
    this.debugLngLat = { lng, lat };
    this.map?.triggerRepaint();
  }

  setInstances(instances: TreeInstanceSpec[]): void {
    if (!this.templatesReady) {
      this.pending = instances;
      return;
    }
    this.applyInstances(instances);
    this.map?.triggerRepaint();
  }

  getDiag(): RuntimeDiag & { hasLayer: boolean; hasDebugTree: boolean; instanceMeshes: number } {
    return {
      ...this.diag,
      hasLayer: Boolean(this.map),
      hasDebugTree: Boolean(this.debugTree),
      instanceMeshes: this.instancing?.meshes.length ?? 0,
    };
  }

  getDebugSnapshot(zoom: number): VegetationDebugSnapshot {
    const speciesCounts = this.lastBuildMeta.speciesCounts ?? {
      deciduous: 0,
      compact: 0,
      conifer: 0,
    };
    return {
      parkLayer: this.lastBuildMeta.parkLayer ?? "park",
      parkFeatureId: this.lastBuildMeta.parkFeatureId ?? null,
      parkCount: this.lastBuildMeta.parkCount ?? 0,
      polygonAreaM2: this.lastBuildMeta.polygonAreaM2 ?? 0,
      requestedDensity: this.lastBuildMeta.requestedDensity ?? 0,
      generatedTreeCount:
        (this.lastBuildMeta.generatedTreeCount ?? 0) + (this.debugTree ? 1 : 0),
      rejectedPointCount: this.lastBuildMeta.rejectedPointCount ?? 0,
      speciesCounts,
      currentLod: this.lodLabel,
      currentZoom: zoom,
      drawCalls: (this.instancing?.drawCalls ?? 0) + (this.debugTree ? 2 : 0),
      triangleEstimate: this.instancing?.triangleEstimate ?? 0,
      modelLoading: this.modelLoading,
      windEnabled: this.wind.enabled,
      shadowsEnabled: false,
      quality: this.quality,
      enabled: this.enabled,
    };
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    this.diag.renderCalls += 1;
    if (!this.renderer || !this.map || this.contextLost || !this.enabled) {
      this.diag.lastRenderReason = !this.enabled ? "disabled" : "no-renderer-or-context";
      return;
    }

    const center = this.map.getCenter();
    const originElev = queryTerrainAltitude(this.map, center.lng, center.lat);
    const hasFleet = Boolean(this.instancing && this.instancing.meshes.length > 0);

    // Grove path (preferred): many InstancedMesh trees in local meters — same as vehicles.
    if (hasFleet && this.instancing) {
      if (this.debugTree) this.debugTree.visible = false;
      for (const mesh of this.instancing.meshes) mesh.visible = true;

      this.instancing.updatePoses(center.lng, center.lat, this.groundOffset, (lng, lat) => {
        return queryTerrainAltitude(this.map!, lng, lat) - originElev + this.groundOffset;
      });

      const transform = this.map.transform as {
        getMatrixForModel?: (loc: [number, number], alt?: number) => Float32Array | number[];
      };
      if (typeof transform.getMatrixForModel === "function") {
        const modelMatrix = transform.getMatrixForModel([center.lng, center.lat], originElev);
        this.tmpMain.fromArray(args.defaultProjectionData.mainMatrix);
        this.tmpModel.fromArray(modelMatrix as ArrayLike<number>);
        this.camera.projectionMatrix.copy(this.tmpMain.multiply(this.tmpModel));
      } else {
        // Fallback: mercator bake without Rx — getMatrixForModel frame is Y-up ENU.
        const mercator = MercatorCoordinate.fromLngLat(
          [center.lng, center.lat],
          originElev,
        );
        const s = mercator.meterInMercatorCoordinateUnits();
        this.tmpModel
          .makeTranslation(mercator.x, mercator.y, mercator.z ?? 0)
          .scale(new Vector3(s, -s, s));
        this.tmpMain.fromArray(args.defaultProjectionData.mainMatrix);
        this.camera.projectionMatrix.copy(this.tmpMain.multiply(this.tmpModel));
      }

      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.diag.lastRenderReason = "instanced-grove-ok";
      return;
    }

    // Fallback: single debug tree (mercator + Rx) until sampling produces instances.
    if (this.debugTree) {
      this.debugTree.visible = true;
      this.debugTree.position.set(0, this.groundOffset, 0);
      this.debugTree.updateMatrixWorld(true);
      const target = this.debugLngLat ?? { lng: center.lng, lat: center.lat };
      const elev = queryTerrainAltitude(this.map, target.lng, target.lat) || originElev;
      this.camera.projectionMatrix.copy(
        this.computeMercatorProjection(target.lng, target.lat, elev, args as RenderArgs),
      );
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.diag.lastRenderReason = "debug-tree-ok";
    }
  }

  /** Same composition as CustomBuildingLayer / MapLibre three.js example.
   * Three.js Y-up primitives need +90° X so "up" becomes mercator Z after scale(s,-s,s).
   */
  private computeMercatorProjection(
    lng: number,
    lat: number,
    altitude: number,
    args: RenderArgs,
  ): Matrix4 {
    const mercator = MercatorCoordinate.fromLngLat([lng, lat], altitude);
    const scale = mercator.meterInMercatorCoordinateUnits();
    const rotationX = new Matrix4().makeRotationAxis(new Vector3(1, 0, 0), Math.PI / 2);
    const modelTransform = new Matrix4()
      .makeTranslation(mercator.x, mercator.y, mercator.z ?? 0)
      .scale(new Vector3(scale, -scale, scale))
      .multiply(rotationX);
    const main = new Matrix4().fromArray(args.defaultProjectionData.mainMatrix);
    return main.multiply(modelTransform);
  }

  private applyInstances(instances: TreeInstanceSpec[]): void {
    this.instancing?.dispose();
    this.instancing = null;
    if (instances.length === 0) return;
    const templates = getTreeTemplates();
    if (!templates) return;
    this.instancing = createVegetationInstancing(this.scene, templates, instances);
    if (this.map) {
      const c = this.map.getCenter();
      const originElev = queryTerrainAltitude(this.map, c.lng, c.lat);
      this.instancing.updatePoses(c.lng, c.lat, this.groundOffset, (lng, lat) => {
        return queryTerrainAltitude(this.map!, lng, lat) - originElev + this.groundOffset;
      });
    }
  }

  private onContextLost = (): void => {
    this.contextLost = true;
  };

  private onContextRestored = (): void => {
    this.contextLost = false;
    this.map?.triggerRepaint();
  };
}

export function ensureVegetationLayer(map: MapLibreMap): VegetationLayer {
  const existing = map.getLayer(VEGETATION_LAYER_ID) as VegetationLayer | undefined;
  if (existing && existing instanceof VegetationLayer) {
    try {
      map.moveLayer(VEGETATION_LAYER_ID);
    } catch {
      /* ignore */
    }
    return existing;
  }

  if (map.getLayer(VEGETATION_LAYER_ID)) {
    map.removeLayer(VEGETATION_LAYER_ID);
  }

  const layer = new VegetationLayer();
  map.addLayer(layer);
  try {
    map.moveLayer(VEGETATION_LAYER_ID);
  } catch {
    /* ignore */
  }

  if (isDev()) {
    console.info("[vegetation] layer added", {
      id: VEGETATION_LAYER_ID,
      present: Boolean(map.getLayer(VEGETATION_LAYER_ID)),
    });
  }

  return layer;
}
