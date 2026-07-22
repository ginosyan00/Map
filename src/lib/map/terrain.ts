import type { Map as MapLibreMap, RasterDEMSourceSpecification } from "maplibre-gl";

export const TERRAIN_SOURCE_ID = "terrain-dem";

/**
 * Mapterhorn Terrarium DEM (used in MapLibre sky/fog/terrain example).
 * Override with NEXT_PUBLIC_TERRAIN_TILEJSON_URL if needed.
 */
export const DEFAULT_TERRAIN_TILEJSON =
  process.env.NEXT_PUBLIC_TERRAIN_TILEJSON_URL?.trim() ||
  "https://tiles.mapterhorn.com/tilejson.json";

/**
 * Optional terrain elevation helper.
 * Returns 0 when terrain is not configured.
 */
export function queryTerrainAltitude(
  map: MapLibreMap,
  longitude: number,
  latitude: number,
): number {
  try {
    const elevation = map.queryTerrainElevation({ lng: longitude, lat: latitude });
    if (typeof elevation === "number" && Number.isFinite(elevation)) {
      return elevation;
    }
  } catch {
    // Terrain not available — expected without DEM.
  }
  return 0;
}

export function ensureTerrainSource(map: MapLibreMap): void {
  if (!map.isStyleLoaded()) return;
  if (map.getSource(TERRAIN_SOURCE_ID)) return;

  const source: RasterDEMSourceSpecification = {
    type: "raster-dem",
    url: DEFAULT_TERRAIN_TILEJSON,
  };
  map.addSource(TERRAIN_SOURCE_ID, source);
}

/**
 * Enable/disable terrain. exaggeration 0 disables.
 */
export function applyTerrain(map: MapLibreMap, enabled: boolean, exaggeration = 1): void {
  if (!map.isStyleLoaded()) return;

  if (!enabled || exaggeration <= 0) {
    try {
      map.setTerrain(null);
    } catch {
      /* ignore */
    }
    return;
  }

  ensureTerrainSource(map);
  try {
    map.setTerrain({
      source: TERRAIN_SOURCE_ID,
      exaggeration: Math.min(Math.max(exaggeration, 0.2), 2.5),
    });
  } catch (error) {
    console.warn("[omt-glb-poc] terrain enable failed", error);
  }
  map.triggerRepaint();
}
