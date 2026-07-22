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
import type { Vehicle } from "@/lib/map/vehicle-sim";
import { VEHICLE_3D_LAYER_ID } from "@/lib/map/constants";
import { cloneCarModel, preloadCarTemplates } from "@/lib/three/load-car-models";

type CarMesh = {
  root: Group;
  modelIndex: number;
};

/**
 * Every vehicle keeps a permanent mesh for its lifetime.
 * Meshes are never unbound/deleted during pan/zoom — only poses update.
 */
export class Vehicle3DLayer implements CustomLayerInterface {
  id = VEHICLE_3D_LAYER_ID;
  type = "custom" as const;
  renderingMode = "3d" as const;

  private map: MapLibreMap | null = null;
  private renderer: WebGLRenderer | null = null;
  private scene = new Scene();
  private camera = new Camera();
  private fleet: Vehicle[] = [];
  /** Stable id → mesh; never removed except on full clear / layer remove. */
  private meshes = new Map<string, CarMesh>();
  private enabled = true;
  private contextLost = false;
  private templatesReady = false;
  private pendingVehicles: Vehicle[] | null = null;

  private readonly tmpMain = new Matrix4();
  private readonly tmpModel = new Matrix4();
  private sceneOrigin: { lng: number; lat: number } = { lng: 0, lat: 0 };

  onAdd(map: MapLibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map;
    this.camera = new Camera();
    this.scene = new Scene();

    const key = new DirectionalLight(0xffffff, 1.4);
    key.position.set(40, 80, 30);
    const fill = new DirectionalLight(0xffffff, 0.6);
    fill.position.set(-30, 40, -20);
    this.scene.add(key, fill, new AmbientLight(0xffffff, 0.7));

    this.renderer = new WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl as WebGLRenderingContext,
      antialias: true,
    });
    this.renderer.autoClear = false;

    map.getCanvas().addEventListener("webglcontextlost", this.onContextLost);
    map.getCanvas().addEventListener("webglcontextrestored", this.onContextRestored);

    void preloadCarTemplates()
      .then(() => {
        this.templatesReady = true;
        if (this.pendingVehicles) {
          this.applyFleet(this.pendingVehicles);
          this.pendingVehicles = null;
        }
        this.map?.triggerRepaint();
      })
      .catch((error) => {
        console.warn("[omt-glb-poc] Failed to load car GLBs", error);
      });
  }

  onRemove(): void {
    this.map?.getCanvas().removeEventListener("webglcontextlost", this.onContextLost);
    this.map?.getCanvas().removeEventListener("webglcontextrestored", this.onContextRestored);
    this.clearAllMeshes();
    this.scene.clear();
    this.renderer?.dispose();
    this.renderer = null;
    this.map = null;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    for (const mesh of this.meshes.values()) {
      mesh.root.visible = enabled;
    }
    this.map?.triggerRepaint();
  }

  /**
   * Add meshes for any new vehicle ids. Existing meshes are kept forever
   * (same id → same GLB). Empty array clears only when traffic is disabled.
   */
  setVehicles(vehicles: Vehicle[]): void {
    if (!this.templatesReady) {
      this.pendingVehicles = vehicles;
      return;
    }
    this.applyFleet(vehicles);
    this.map?.triggerRepaint();
  }

  /** Pose-only update — never create/destroy meshes. */
  syncVisiblePoses(): void {
    this.syncAllPoses();
  }

  /** @deprecated kept for traffic layer API compat — same as syncVisiblePoses. */
  rebindNearest(): void {
    this.syncAllPoses();
  }

  private applyFleet(vehicles: Vehicle[]): void {
    this.fleet = vehicles;

    if (vehicles.length === 0) {
      this.clearAllMeshes();
      return;
    }

    for (const vehicle of vehicles) {
      let mesh = this.meshes.get(vehicle.id);
      if (!mesh) {
        const root = cloneCarModel(vehicle.modelIndex);
        if (!root) continue;
        root.matrixAutoUpdate = true;
        root.visible = this.enabled;
        this.scene.add(root);
        mesh = { root, modelIndex: vehicle.modelIndex };
        this.meshes.set(vehicle.id, mesh);
      }
      // Never swap modelIndex for an existing id.
    }

    // Do NOT delete meshes for ids missing from this frame — fleet is authoritative
    // and always contains the full set after spawn. If an id is absent, keep mesh
    // hidden only when disabled; otherwise leave as-is until explicit clear.
    this.syncAllPoses();
  }

  private syncAllPoses(): void {
    if (!this.map) return;
    const center = this.map.getCenter();
    this.sceneOrigin = { lng: center.lng, lat: center.lat };

    const byId = new Map(this.fleet.map((v) => [v.id, v]));
    for (const [id, mesh] of this.meshes) {
      const vehicle = byId.get(id);
      if (!vehicle) {
        // Keep mesh alive but park it (should be rare with full fleet).
        mesh.root.visible = false;
        continue;
      }
      this.placeInSceneMeters(mesh.root, vehicle);
      mesh.root.visible = this.enabled;
    }
  }

  private clearAllMeshes(): void {
    for (const mesh of this.meshes.values()) {
      this.scene.remove(mesh.root);
    }
    this.meshes.clear();
    this.fleet = [];
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput): void {
    if (!this.renderer || !this.map || this.contextLost || !this.enabled) return;
    if (this.meshes.size === 0) return;

    this.syncAllPoses();

    const transform = this.map.transform as {
      getMatrixForModel?: (loc: [number, number], alt?: number) => Float32Array | number[];
    };

    if (typeof transform.getMatrixForModel === "function") {
      const modelMatrix = transform.getMatrixForModel(
        [this.sceneOrigin.lng, this.sceneOrigin.lat],
        0,
      );
      this.tmpMain.fromArray(args.defaultProjectionData.mainMatrix);
      this.tmpModel.fromArray(modelMatrix as ArrayLike<number>);
      this.camera.projectionMatrix.copy(this.tmpMain.multiply(this.tmpModel));
    } else {
      const mercator = MercatorCoordinate.fromLngLat(
        [this.sceneOrigin.lng, this.sceneOrigin.lat],
        0,
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
  }

  private placeInSceneMeters(root: Group, vehicle: Vehicle): void {
    const { east, north } = lngLatToLocalMeters(
      this.sceneOrigin.lng,
      this.sceneOrigin.lat,
      vehicle.lng,
      vehicle.lat,
    );
    root.position.set(east, 0.05, -north);
    const bearingRad = (vehicle.bearing * Math.PI) / 180;
    root.rotation.set(0, -bearingRad + Math.PI, 0);
  }

  private onContextLost = (): void => {
    this.contextLost = true;
  };

  private onContextRestored = (): void => {
    this.contextLost = false;
    this.map?.triggerRepaint();
  };
}

function lngLatToLocalMeters(
  originLng: number,
  originLat: number,
  lng: number,
  lat: number,
): { east: number; north: number } {
  const cosLat = Math.cos((originLat * Math.PI) / 180);
  return {
    east: (lng - originLng) * 111_320 * cosLat,
    north: (lat - originLat) * 110_540,
  };
}

export function ensureVehicle3DLayer(map: MapLibreMap): Vehicle3DLayer {
  const existing = map.getLayer(VEHICLE_3D_LAYER_ID) as Vehicle3DLayer | undefined;
  if (existing && existing instanceof Vehicle3DLayer) return existing;

  if (map.getLayer(VEHICLE_3D_LAYER_ID)) {
    map.removeLayer(VEHICLE_3D_LAYER_ID);
  }

  const layer = new Vehicle3DLayer();
  map.addLayer(layer);
  try {
    map.moveLayer(VEHICLE_3D_LAYER_ID);
  } catch {
    /* ignore */
  }
  return layer;
}

export function removeVehicle3DLayer(map: MapLibreMap): void {
  if (map.getLayer(VEHICLE_3D_LAYER_ID)) {
    map.removeLayer(VEHICLE_3D_LAYER_ID);
  }
}
