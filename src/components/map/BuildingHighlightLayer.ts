import type { GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import type { SelectedBuilding } from "@/types/building";
import {
  HIGHLIGHT_EXTRUSION_LAYER_ID,
  HIGHLIGHT_FILL_LAYER_ID,
  HIGHLIGHT_LINE_LAYER_ID,
  HIGHLIGHT_SOURCE_ID,
} from "@/lib/map/constants";

/**
 * Temporary GeoJSON highlight for the currently selected footprint only.
 * Uses fill + outline only (no extrusion) so a single house reads clearly.
 */
export function ensureHighlightLayers(map: MapLibreMap): void {
  if (!map.isStyleLoaded()) return;

  if (!map.getSource(HIGHLIGHT_SOURCE_ID)) {
    map.addSource(HIGHLIGHT_SOURCE_ID, {
      type: "geojson",
      data: emptyCollection(),
    });
  }

  // Remove legacy extrusion highlight if an older session created it.
  if (map.getLayer(HIGHLIGHT_EXTRUSION_LAYER_ID)) {
    map.removeLayer(HIGHLIGHT_EXTRUSION_LAYER_ID);
  }

  if (!map.getLayer(HIGHLIGHT_FILL_LAYER_ID)) {
    map.addLayer({
      id: HIGHLIGHT_FILL_LAYER_ID,
      type: "fill",
      source: HIGHLIGHT_SOURCE_ID,
      paint: {
        "fill-color": "#22d3ee",
        "fill-opacity": 0.35,
      },
    });
  }

  if (!map.getLayer(HIGHLIGHT_LINE_LAYER_ID)) {
    map.addLayer({
      id: HIGHLIGHT_LINE_LAYER_ID,
      type: "line",
      source: HIGHLIGHT_SOURCE_ID,
      paint: {
        "line-color": "#67e8f9",
        "line-width": 3,
      },
    });
  }
}

export function setHighlightedBuilding(
  map: MapLibreMap,
  building: SelectedBuilding | null,
): void {
  if (!map.isStyleLoaded()) return;

  ensureHighlightLayers(map);
  const source = map.getSource(HIGHLIGHT_SOURCE_ID) as GeoJSONSource | undefined;
  if (!source) return;

  if (!building) {
    source.setData(emptyCollection());
    return;
  }

  // Exactly one Polygon feature — never a MultiPolygon FeatureCollection.
  source.setData({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          height: building.height ?? 12,
          min_height: building.minHeight ?? 0,
        },
        geometry: building.geometry,
      },
    ],
  });
}

export function removeHighlightLayers(map: MapLibreMap): void {
  if (!map.isStyleLoaded()) return;

  for (const id of [
    HIGHLIGHT_EXTRUSION_LAYER_ID,
    HIGHLIGHT_LINE_LAYER_ID,
    HIGHLIGHT_FILL_LAYER_ID,
  ]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(HIGHLIGHT_SOURCE_ID)) map.removeSource(HIGHLIGHT_SOURCE_ID);
}

function emptyCollection(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}
