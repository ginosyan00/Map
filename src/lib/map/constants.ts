/** Default X rotation: Blender Z-up → Three.js Y-up (MapLibre custom layer). */
export const DEFAULT_MODEL_ROTATION_X_DEG = 90;
export const DEFAULT_MODEL_ROTATION_X_RAD = Math.PI / 2;

export const DEFAULT_MODEL_ROTATION_Y_DEG = 0;
export const DEFAULT_MODEL_ROTATION_Z_DEG = 0;
export const DEFAULT_MODEL_SCALE = 1;
export const DEFAULT_MODEL_ALTITUDE = 0;
export const DEFAULT_MODEL_MIN_ZOOM = 13;

export const SAMPLE_MODEL_URL = "/models/sample-building.glb";
export const SAMPLE_MODEL_API_URL = "/api/sample-building";
export const PROCEDURAL_MODEL_URL = "procedural://sample-building";

/** Prefer static public GLB; API route is a fallback if Turbopack 404s. */
export const DEFAULT_APPLY_MODEL_URL = SAMPLE_MODEL_URL;

export const CUSTOM_LAYER_ID = "custom-buildings-three";
export const HIGHLIGHT_SOURCE_ID = "selected-building-source";
export const HIGHLIGHT_FILL_LAYER_ID = "selected-building-fill";
export const HIGHLIGHT_LINE_LAYER_ID = "selected-building-line";
export const HIGHLIGHT_EXTRUSION_LAYER_ID = "selected-building-extrusion";

export const REPLACED_COVER_SOURCE_ID = "replaced-building-cover-source";
export const REPLACED_COVER_LAYER_ID = "replaced-building-cover";
export const REPLACED_MODEL_SOURCE_ID = "replaced-building-model-source";
export const REPLACED_MODEL_LAYER_ID = "replaced-building-model";
/** Sibling MultiPolygon parts kept after hiding a shared parent feature. */
export const PRESERVED_PARTS_SOURCE_ID = "preserved-building-parts-source";
export const PRESERVED_PARTS_LAYER_ID = "preserved-building-parts";

export const APP_BUILDING_EXTRUSION_LAYER_ID = "app-building-3d";

export const VEHICLE_SOURCE_ID = "traffic-vehicles-source";
export const VEHICLE_LAYER_ID = "traffic-vehicles";
export const VEHICLE_SHADOW_LAYER_ID = "traffic-vehicles-shadow";
export const VEHICLE_3D_LAYER_ID = "traffic-vehicles-three";
/** 3D cars render at every zoom; mesh scale follows mercator meters. */
export const VEHICLE_MIN_ZOOM = 0;

export const STORAGE_KEY = "omt-glb-poc:custom-buildings:v1";

export const MAX_GLB_BYTES = Number(
  process.env.NEXT_PUBLIC_MAX_GLB_BYTES ?? 25 * 1024 * 1024,
);

export const ALLOWED_MODEL_EXTENSIONS = [".glb", ".gltf"] as const;

export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function radToDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function isDev(): boolean {
  return process.env.NODE_ENV === "development";
}

export function devLog(...args: unknown[]): void {
  if (isDev()) {
    console.log("[omt-glb-poc]", ...args);
  }
}
