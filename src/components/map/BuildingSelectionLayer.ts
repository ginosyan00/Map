import type { Map as MapLibreMap, MapGeoJSONFeature, MapMouseEvent } from "maplibre-gl";
import type { BuildingGeometry, SelectedBuilding } from "@/types/building";
import {
  buildSelectedBuilding,
  footprintArea,
  formatBuildingDebug,
  identityKey,
  pointInBuilding,
  resolveBuildingIdentity,
} from "@/lib/map/building-identification";
import { getBuildingQueryLayers } from "@/lib/map/building-layer";
import type { BuildingLayerInfo } from "@/types/map";
import {
  HIGHLIGHT_EXTRUSION_LAYER_ID,
  HIGHLIGHT_FILL_LAYER_ID,
  HIGHLIGHT_LINE_LAYER_ID,
  HIGHLIGHT_SOURCE_ID,
  devLog,
} from "@/lib/map/constants";

export type BuildingSelectionHandlers = {
  onSelect: (building: SelectedBuilding) => void;
  onEmptyClick: () => void;
  onHoverChange: (hovering: boolean) => void;
};

function isBuildingGeometry(
  geometry: GeoJSON.Geometry | null | undefined,
): geometry is BuildingGeometry {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

function isHighlightLayer(layerId: string | undefined): boolean {
  return (
    layerId === HIGHLIGHT_FILL_LAYER_ID ||
    layerId === HIGHLIGHT_LINE_LAYER_ID ||
    layerId === HIGHLIGHT_EXTRUSION_LAYER_ID ||
    layerId === HIGHLIGHT_SOURCE_ID
  );
}

function featureIdentityKey(feature: MapGeoJSONFeature): string {
  if (!isBuildingGeometry(feature.geometry)) return `raw:${String(feature.id)}`;
  const identity = resolveBuildingIdentity({
    featureId: feature.id,
    source: feature.source,
    sourceLayer: feature.sourceLayer,
    properties: (feature.properties ?? {}) as Record<string, unknown>,
    geometry: feature.geometry,
  });
  return identityKey(identity);
}

/** Rough max footprint for a single house (~200m × 200m in deg² near mid-latitudes). */
const MAX_SINGLE_BUILDING_AREA = 0.00004;

/**
 * Pick exactly one building under the cursor.
 */
export function pickSingleBuildingFeature(
  features: MapGeoJSONFeature[],
  clickLng: number,
  clickLat: number,
): MapGeoJSONFeature | null {
  const candidates: MapGeoJSONFeature[] = [];

  for (const feature of features) {
    if (!isBuildingGeometry(feature.geometry)) continue;
    if (isHighlightLayer(feature.layer?.id)) continue;
    // Skip absurdly large polygons (parks / blocks mistaken as buildings).
    if (footprintArea(feature.geometry) > MAX_SINGLE_BUILDING_AREA) continue;
    candidates.push(feature);
  }

  if (candidates.length === 0) {
    // Fallback without area filter if everything was filtered out.
    for (const feature of features) {
      if (!isBuildingGeometry(feature.geometry)) continue;
      if (isHighlightLayer(feature.layer?.id)) continue;
      candidates.push(feature);
    }
  }

  if (candidates.length === 0) return null;

  const deduped = new Map<string, MapGeoJSONFeature>();
  for (const feature of candidates) {
    if (!isBuildingGeometry(feature.geometry)) continue;
    const key = featureIdentityKey(feature);
    const prev = deduped.get(key);
    if (!prev || !isBuildingGeometry(prev.geometry)) {
      deduped.set(key, feature);
      continue;
    }
    if (footprintArea(feature.geometry) < footprintArea(prev.geometry)) {
      deduped.set(key, feature);
    }
  }

  const unique = [...deduped.values()];

  // Strong preference: footprint must contain the click (top/roof click).
  const containing = unique.filter(
    (feature) =>
      isBuildingGeometry(feature.geometry) &&
      pointInBuilding(clickLng, clickLat, feature.geometry),
  );

  const pool = containing.length > 0 ? containing : unique;

  pool.sort((a, b) => {
    const ga = a.geometry;
    const gb = b.geometry;
    if (!isBuildingGeometry(ga) || !isBuildingGeometry(gb)) return 0;
    // Prefer true Polygon over MultiPolygon, then smallest area.
    const typeScore = (g: BuildingGeometry) => (g.type === "Polygon" ? 0 : 1);
    const typeDiff = typeScore(ga) - typeScore(gb);
    if (typeDiff !== 0) return typeDiff;
    return footprintArea(ga) - footprintArea(gb);
  });

  return pool[0] ?? null;
}

export function attachBuildingSelection(
  map: MapLibreMap,
  layerInfo: BuildingLayerInfo,
  handlers: BuildingSelectionHandlers,
): () => void {
  const layers = getBuildingQueryLayers(layerInfo).filter((id) => Boolean(map.getLayer(id)));

  const queryBuildings = (point: { x: number; y: number }): MapGeoJSONFeature[] => {
    if (layers.length === 0) return [];
    return map.queryRenderedFeatures([point.x, point.y], { layers });
  };

  const onClick = (event: MapMouseEvent): void => {
    const target = event.originalEvent.target;
    if (target instanceof Element && target.closest(".map-chrome, .maplibregl-ctrl")) {
      return;
    }

    const features = queryBuildings(event.point);
    const feature = pickSingleBuildingFeature(
      features,
      event.lngLat.lng,
      event.lngLat.lat,
    );

    if (!feature || !isBuildingGeometry(feature.geometry)) {
      handlers.onEmptyClick();
      return;
    }

    const building = buildSelectedBuilding({
      featureId: feature.id,
      source: feature.source,
      sourceLayer: feature.sourceLayer,
      properties: feature.properties,
      geometry: feature.geometry,
      clickLng: event.lngLat.lng,
      clickLat: event.lngLat.lat,
    });

    devLog(formatBuildingDebug(building));
    handlers.onSelect(building);
  };

  const onMove = (event: MapMouseEvent): void => {
    const features = queryBuildings(event.point);
    const hit = pickSingleBuildingFeature(
      features,
      event.lngLat.lng,
      event.lngLat.lat,
    );
    handlers.onHoverChange(hit !== null);
  };

  map.on("click", onClick);
  map.on("mousemove", onMove);

  return () => {
    map.off("click", onClick);
    map.off("mousemove", onMove);
  };
}
