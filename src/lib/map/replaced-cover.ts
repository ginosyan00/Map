import type { Map as MapLibreMap } from "maplibre-gl";
import type { CustomBuildingModel } from "@/types/building";
import {
  CUSTOM_LAYER_ID,
  REPLACED_COVER_LAYER_ID,
  REPLACED_COVER_SOURCE_ID,
  REPLACED_MODEL_LAYER_ID,
  REPLACED_MODEL_SOURCE_ID,
  devLog,
} from "@/lib/map/constants";

/**
 * Placeholder GeoJSON extrusions are intentionally not drawn.
 * Replacements are shown only as Three.js GLB models; originals are
 * collapsed via height-hide / filters in building-filter.ts.
 */
export function ensureReplacementGeoLayers(map: MapLibreMap): void {
  removeReplacementGeoLayers(map);
}

export function syncReplacementGeoLayers(
  map: MapLibreMap,
  _replacements: CustomBuildingModel[],
): void {
  if (!map.isStyleLoaded()) return;
  removeReplacementGeoLayers(map);

  if (map.getLayer(CUSTOM_LAYER_ID)) {
    try {
      map.moveLayer(CUSTOM_LAYER_ID);
    } catch {
      /* ignore */
    }
  }

  devLog("Placeholder GeoJSON layers cleared; GLB-only replacement mode");
}

export function removeReplacementGeoLayers(map: MapLibreMap): void {
  if (!map.isStyleLoaded()) return;
  for (const id of [REPLACED_MODEL_LAYER_ID, REPLACED_COVER_LAYER_ID]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of [REPLACED_MODEL_SOURCE_ID, REPLACED_COVER_SOURCE_ID]) {
    if (map.getSource(id)) map.removeSource(id);
  }
}

/** @deprecated use syncReplacementGeoLayers */
export function syncReplacedCover(
  map: MapLibreMap,
  replacements: CustomBuildingModel[],
): void {
  syncReplacementGeoLayers(map, replacements);
}

/** @deprecated */
export function ensureReplacedCoverLayers(map: MapLibreMap): void {
  ensureReplacementGeoLayers(map);
}

/** @deprecated */
export function removeReplacedCoverLayers(map: MapLibreMap): void {
  removeReplacementGeoLayers(map);
}
