import maplibregl, {
  type CustomLayerInterface,
  type CustomRenderMethodInput,
  type Map as MapLibreMap,
} from "maplibre-gl";
import {
  AmbientLight,
  Box3,
  Camera,
  DirectionalLight,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Scene,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from "three";
import type { CustomBuildingModel } from "@/types/building";
import { CUSTOM_LAYER_ID, degToRad, isDev } from "@/lib/map/constants";
import { disposeThreeObject } from "@/lib/three/dispose-three-object";
import { createProceduralBuilding, loadGlbModel } from "@/lib/three/load-glb-model";
import { MercatorCoordinate } from "maplibre-gl";

type ManagedModel = {
  config: CustomBuildingModel;
  /** Root group kept at identity; transform is baked into camera.projectionMatrix. */
  object: Object3D | null;
  loading: boolean;
  error: string | null;
};

export type CustomLayerStatus = {
  ready: boolean;
  modelCount: number;
  loadingIds: string[];
  errors: Record<string, string>;
};

type StatusListener = (status: CustomLayerStatus) => void;

type RenderArgs = CustomRenderMethodInput & {
  getMatrixForModel?: (
    location: [number, number] | { lng: number; lat: number },
    altitude?: number,
  ) => Float32Array | number[];
};

/**
 * Official MapLibre + three.js placement:
 * camera.projectionMatrix = mainMatrix * modelTransform
 * @see https://maplibre.org/maplibre-gl-js/docs/examples/add-a-3d-model-using-threejs/
 */
export class CustomBuildingLayer implements CustomLayerInterface {
  id = CUSTOM_LAYER_ID;
  type = "custom" as const;
  renderingMode = "3d" as const;

  private map: MapLibreMap | null = null;
  private renderer: WebGLRenderer | null = null;
  private scene = new Scene();
  private camera = new Camera();
  private models = new Map<string, ManagedModel>();
  private statusListeners = new Set<StatusListener>();
  private contextLost = false;

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    this.camera = new Camera();
    this.scene = new Scene();

    const light1 = new DirectionalLight(0xffffff, 1.1);
    light1.position.set(0, -70, 100).normalize();
    const light2 = new DirectionalLight(0xffffff, 0.9);
    light2.position.set(0, 70, 100).normalize();
    this.scene.add(light1, light2, new AmbientLight(0xffffff, 0.45));

    this.renderer = new WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl as WebGLRenderingContext,
      antialias: true,
    });
    this.renderer.autoClear = false;

    const canvas = map.getCanvas();
    canvas.addEventListener("webglcontextlost", this.onContextLost);
    canvas.addEventListener("webglcontextrestored", this.onContextRestored);

    if (isDev()) console.log("[omt-glb-poc] CustomBuildingLayer added");
    this.emitStatus();
  }

  onRemove(): void {
    const canvas = this.map?.getCanvas();
    canvas?.removeEventListener("webglcontextlost", this.onContextLost);
    canvas?.removeEventListener("webglcontextrestored", this.onContextRestored);

    for (const managed of this.models.values()) {
      this.disposeManaged(managed);
    }
    this.models.clear();
    this.scene.clear();
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
    this.emitStatus();
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    if (!this.renderer || !this.map || this.contextLost) return;

    const zoom = this.map.getZoom();
    const visible: ManagedModel[] = [];
    for (const managed of this.models.values()) {
      if (!managed.object) continue;
      const show = managed.config.visible && zoom >= managed.config.minZoom;
      managed.object.visible = show;
      if (show) visible.push(managed);
    }
    if (visible.length === 0) return;

    for (const managed of visible) {
      if (!managed.object) continue;

      // Only this model in the scene graph for this pass.
      for (const other of visible) {
        if (other.object) other.object.visible = other === managed;
      }

      const projection = this.computeProjectionMatrix(managed.config, options as RenderArgs);
      this.camera.projectionMatrix.copy(projection);

      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
    }

    for (const managed of visible) {
      if (managed.object) managed.object.visible = true;
    }
  }

  setModels(configs: CustomBuildingModel[]): void {
    const nextIds = new Set(configs.map((c) => c.id));

    for (const [id, managed] of this.models) {
      if (!nextIds.has(id)) {
        this.disposeManaged(managed);
        this.models.delete(id);
      }
    }

    for (const config of configs) {
      const existing = this.models.get(config.id);
      if (!existing) {
        this.models.set(config.id, {
          config: { ...config },
          object: null,
          loading: false,
          error: null,
        });
        void this.ensureLoaded(config.id);
        continue;
      }

      const urlChanged = existing.config.modelUrl !== config.modelUrl;
      existing.config = { ...config };
      if (urlChanged) {
        this.disposeManaged(existing);
        existing.object = null;
        existing.error = null;
        void this.ensureLoaded(config.id);
      }
    }

    this.map?.triggerRepaint();
    this.emitStatus();
  }

  getStatus(): CustomLayerStatus {
    const loadingIds: string[] = [];
    const errors: Record<string, string> = {};
    for (const [id, managed] of this.models) {
      if (managed.loading) loadingIds.push(id);
      if (managed.error) errors[id] = managed.error;
    }
    return {
      ready: this.renderer !== null && !this.contextLost,
      modelCount: this.models.size,
      loadingIds,
      errors,
    };
  }

  subscribe(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatus());
    return () => this.statusListeners.delete(listener);
  }

  private computeProjectionMatrix(config: CustomBuildingModel, args: RenderArgs): Matrix4 {
    const mercator = MercatorCoordinate.fromLngLat(
      [config.longitude, config.latitude],
      config.altitude,
    );
    const scale = mercator.meterInMercatorCoordinateUnits() * config.scale;

    const rotationX = new Matrix4().makeRotationAxis(
      new Vector3(1, 0, 0),
      degToRad(config.rotationX),
    );
    const rotationY = new Matrix4().makeRotationAxis(
      new Vector3(0, 1, 0),
      degToRad(config.rotationY),
    );
    const rotationZ = new Matrix4().makeRotationAxis(
      new Vector3(0, 0, 1),
      degToRad(config.rotationZ),
    );

    // Exact composition from MapLibre three.js example.
    const modelTransform = new Matrix4()
      .makeTranslation(mercator.x, mercator.y, mercator.z ?? 0)
      .scale(new Vector3(scale, -scale, scale))
      .multiply(rotationX)
      .multiply(rotationY)
      .multiply(rotationZ);

    const main = new Matrix4().fromArray(args.defaultProjectionData.mainMatrix);
    return main.multiply(modelTransform);
  }

  private async ensureLoaded(id: string): Promise<void> {
    const managed = this.models.get(id);
    if (!managed || managed.object || managed.loading) return;

    managed.loading = true;
    managed.error = null;
    this.emitStatus();

    try {
      const { root, fromProcedural } = await loadGlbModel(managed.config.modelUrl);
      if (!this.models.has(id)) {
        disposeThreeObject(root);
        return;
      }

      // Ensure materials are lit and visible on the shared MapLibre framebuffer.
      root.traverse((node) => {
        const mesh = node as Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (material instanceof MeshStandardMaterial) {
            material.metalness = Math.min(material.metalness, 0.2);
            material.roughness = Math.max(material.roughness, 0.4);
            material.needsUpdate = true;
          }
        }
      });

      prepareModelForMap(root, managed.config.buildingHeight ?? undefined);

      this.scene.add(root);
      managed.object = root;
      managed.loading = false;

      if (isDev()) {
        console.log("[omt-glb-poc] GLB ready at", {
          id,
          fromProcedural,
          lng: managed.config.longitude,
          lat: managed.config.latitude,
          alt: managed.config.altitude,
          scale: managed.config.scale,
          rotX: managed.config.rotationX,
        });
      }
      this.map?.triggerRepaint();
    } catch (error) {
      // Absolute last resort — never leave the replacement empty.
      managed.loading = false;
      try {
        const fallback = createProceduralBuilding();
        this.scene.add(fallback);
        managed.object = fallback;
        managed.error = null;
      } catch {
        managed.error = error instanceof Error ? error.message : "Model load failed";
      }
      console.warn("[omt-glb-poc] ensureLoaded recovered with procedural model", error);
    }
    this.emitStatus();
  }

  private disposeManaged(managed: ManagedModel): void {
    if (managed.object) {
      this.scene.remove(managed.object);
      disposeThreeObject(managed.object);
      managed.object = null;
    }
  }

  private emitStatus(): void {
    const status = this.getStatus();
    for (const listener of this.statusListeners) listener(status);
  }

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    this.emitStatus();
  };

  private onContextRestored = (): void => {
    this.contextLost = false;
    this.emitStatus();
    this.map?.triggerRepaint();
  };
}

export function ensureCustomBuildingLayer(map: MapLibreMap): CustomBuildingLayer {
  const existing = map.getLayer(CUSTOM_LAYER_ID);
  if (existing) {
    const attached = (map as MapLibreMap & { __customBuildingLayer?: CustomBuildingLayer })
      .__customBuildingLayer;
    if (attached) return attached;
    map.removeLayer(CUSTOM_LAYER_ID);
  }

  const layer = new CustomBuildingLayer();
  map.addLayer(layer);
  (map as MapLibreMap & { __customBuildingLayer?: CustomBuildingLayer }).__customBuildingLayer =
    layer;
  return layer;
}

export function removeCustomBuildingLayer(map: MapLibreMap): void {
  if (map.getLayer(CUSTOM_LAYER_ID)) {
    map.removeLayer(CUSTOM_LAYER_ID);
  }
  delete (map as MapLibreMap & { __customBuildingLayer?: CustomBuildingLayer })
    .__customBuildingLayer;
}

/**
 * Place model origin at ground center; keep units in meters.
 * Only auto-rescales when the asset is absurdly tiny/huge.
 */
function prepareModelForMap(root: Object3D, buildingHeight?: number): void {
  root.position.set(0, 0, 0);
  root.rotation.set(0, 0, 0);
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);

  const box = new Box3().setFromObject(root);
  if (box.isEmpty()) return;

  const size = new Vector3();
  const center = new Vector3();
  box.getSize(size);
  box.getCenter(center);

  root.position.x -= center.x;
  root.position.z -= center.z;
  root.position.y -= box.min.y;
  root.updateMatrixWorld(true);

  const maxDim = Math.max(size.x, size.y, size.z);
  const targetHeight = Math.max(Number(buildingHeight ?? 0), 12);
  if (maxDim > 0 && (maxDim < 0.5 || maxDim > 250)) {
    const factor = targetHeight / Math.max(size.y, 0.001);
    root.scale.multiplyScalar(factor);
    root.updateMatrixWorld(true);
    const grounded = new Box3().setFromObject(root);
    root.position.y -= grounded.min.y;
  }
}

export { maplibregl };
