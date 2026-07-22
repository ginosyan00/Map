import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { CustomBuildingModel } from "@/types/building";
import {
  CUSTOM_LAYER_ID,
  PRESERVED_PARTS_LAYER_ID,
  PRESERVED_PARTS_SOURCE_ID,
  REPLACED_COVER_LAYER_ID,
  REPLACED_COVER_SOURCE_ID,
  REPLACED_MODEL_LAYER_ID,
  REPLACED_MODEL_SOURCE_ID,
  devLog,
} from "@/lib/map/constants";

/**
 * Placeholder GeoJSON extrusions are intentionally not drawn for the replaced part.
 * Sibling MultiPolygon parts are re-drawn so hiding a shared parent does not wipe
 * the rest of the block.
 */
export function ensureReplacementGeoLayers(map: MapLibreMap): void {
  removeReplacementGeoLayers(map);
}

export function syncReplacementGeoLayers(
  map: MapLibreMap,
  replacements: CustomBuildingModel[],
): void {
  if (!map.isStyleLoaded()) return;

  // Drop old placeholder cover/model layers; keep sibling restoration.
  for (const id of [REPLACED_MODEL_LAYER_ID, REPLACED_COVER_LAYER_ID]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of [REPLACED_MODEL_SOURCE_ID, REPLACED_COVER_SOURCE_ID]) {
    if (map.getSource(id)) map.removeSource(id);
  }

  syncPreservedSiblingParts(map, replacements);

  if (map.getLayer(CUSTOM_LAYER_ID)) {
    try {
      map.moveLayer(CUSTOM_LAYER_ID);
    } catch {
      /* ignore */
    }
  }

  devLog("Replacement geo sync", {
    replacements: replacements.length,
    preserved: replacements.reduce((n, r) => n + (r.preservedSiblings?.length ?? 0), 0),
  });
}

function syncPreservedSiblingParts(
  map: MapLibreMap,
  replacements: CustomBuildingModel[],
): void {
  const features: GeoJSON.Feature[] = [];
  for (const r of replacements) {
    if (r.visible === false) continue;
    const siblings = r.preservedSiblings ?? [];
    const height = r.buildingHeight ?? 12;
    const base = r.buildingMinHeight ?? 0;
    for (const polygon of siblings) {
      features.push({
        type: "Feature",
        properties: {
          height,
          min_height: base,
          replacement_id: r.id,
        },
        geometry: polygon,
      });
    }
  }

  const collection: GeoJSON.FeatureCollection = {
    type: "FeatureCollection",
    features,
  };

  const existing = map.getSource(PRESERVED_PARTS_SOURCE_ID) as GeoJSONSource | undefined;
  if (existing) {
    existing.setData(collection);
  } else {
    map.addSource(PRESERVED_PARTS_SOURCE_ID, {
      type: "geojson",
      data: collection,
    });
  }

  if (!map.getLayer(PRESERVED_PARTS_LAYER_ID)) {
    map.addLayer({
      id: PRESERVED_PARTS_LAYER_ID,
      type: "fill-extrusion",
      source: PRESERVED_PARTS_SOURCE_ID,
      minzoom: 13,
      paint: {
        "fill-extrusion-color": "#f3f2ef",
        "fill-extrusion-height": ["coalesce", ["get", "height"], 12],
        "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
        "fill-extrusion-opacity": 1,
        "fill-extrusion-vertical-gradient": true,
      },
    });
  }

  // Keep siblings under the Three.js GLB layer.
  if (map.getLayer(CUSTOM_LAYER_ID) && map.getLayer(PRESERVED_PARTS_LAYER_ID)) {
    try {
      map.moveLayer(PRESERVED_PARTS_LAYER_ID, CUSTOM_LAYER_ID);
    } catch {
      /* ignore */
    }
  }
}

export function removeReplacementGeoLayers(map: MapLibreMap): void {
  if (!map.isStyleLoaded()) return;
  for (const id of [
    REPLACED_MODEL_LAYER_ID,
    REPLACED_COVER_LAYER_ID,
    PRESERVED_PARTS_LAYER_ID,
  ]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const id of [
    REPLACED_MODEL_SOURCE_ID,
    REPLACED_COVER_SOURCE_ID,
    PRESERVED_PARTS_SOURCE_ID,
  ]) {
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
