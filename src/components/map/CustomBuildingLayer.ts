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
import { loadGlbModel } from "@/lib/three/load-glb-model";
import { prepareModelForMap } from "@/lib/three/prepare-model-for-map";

type ManagedModel = {
  config: CustomBuildingModel;
  /** Root group kept at identity; transform is baked into camera.projectionMatrix. */
  object: Object3D | null;
  loading: boolean;
  error: string | null;
  /** Bumped to ignore stale async load completions. */
  loadGeneration: number;
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
          loadGeneration: 0,
        });
        void this.ensureLoaded(config.id);
        continue;
      }

      const urlChanged = existing.config.modelUrl !== config.modelUrl;
      existing.config = { ...config };

      // Retry only on URL change, or when stuck with no object/error (interrupted load).
      // Do not auto-retry while a prior error remains — that would loop on every setModels.
      const stuckWithoutError =
        !existing.object && !existing.loading && existing.error === null;
      const needsReload = urlChanged || stuckWithoutError;
      if (needsReload) {
        this.disposeManaged(existing);
        existing.object = null;
        existing.error = null;
        existing.loading = false;
        existing.loadGeneration += 1;
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

    const generation = managed.loadGeneration;
    const modelUrl = managed.config.modelUrl;
    managed.loading = true;
    managed.error = null;
    this.emitStatus();

    try {
      const { root, fromProcedural, warning } = await loadGlbModel(modelUrl);
      const current = this.models.get(id);
      if (!current || current.loadGeneration !== generation) {
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

      prepareModelForMap(root, current.config.buildingHeight ?? undefined);

      this.scene.add(root);
      current.object = root;
      current.loading = false;
      current.error = warning ?? null;

      if (isDev()) {
        console.log("[omt-glb-poc] GLB ready at", {
          id,
          fromProcedural,
          lng: current.config.longitude,
          lat: current.config.latitude,
          alt: current.config.altitude,
          scale: current.config.scale,
          rotX: current.config.rotationX,
        });
      }
      this.map?.triggerRepaint();
    } catch (error) {
      const current = this.models.get(id);
      if (!current || current.loadGeneration !== generation) return;
      current.loading = false;
      current.object = null;
      current.error = error instanceof Error ? error.message : "Model load failed";
      console.warn("[omt-glb-poc] ensureLoaded failed for", id, error);
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
    const map = this.map;
    if (!map) {
      this.emitStatus();
      return;
    }

    this.renderer?.dispose();
    const gl = map.getCanvas().getContext("webgl2") ?? map.getCanvas().getContext("webgl");
    if (gl) {
      this.renderer = new WebGLRenderer({
        canvas: map.getCanvas(),
        context: gl as WebGLRenderingContext,
        antialias: true,
      });
      this.renderer.autoClear = false;
    } else {
      this.renderer = null;
    }

    for (const [id, managed] of this.models) {
      this.disposeManaged(managed);
      managed.object = null;
      managed.error = null;
      managed.loading = false;
      managed.loadGeneration += 1;
      void this.ensureLoaded(id);
    }

    this.emitStatus();
    map.triggerRepaint();
  };
}
