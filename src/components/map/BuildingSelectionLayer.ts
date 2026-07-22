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
import { getAllBuildingQueryLayers } from "@/lib/map/building-layer";
import type { BuildingLayerInfo } from "@/types/map";
import {
  HIGHLIGHT_EXTRUSION_LAYER_ID,
  HIGHLIGHT_FILL_LAYER_ID,
  HIGHLIGHT_LINE_LAYER_ID,
  HIGHLIGHT_SOURCE_ID,
  PRESERVED_PARTS_LAYER_ID,
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
    layerId === HIGHLIGHT_SOURCE_ID ||
    layerId === PRESERVED_PARTS_LAYER_ID
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

/**
 * Selection allows normal city buildings. Hide-safety (courtyard/block wipe)
 * is enforced later in building-filter — not here.
 * ~250 m × 250 m; MultiPolygon uses largest single outer ring.
 */
const MAX_SELECT_AREA = 0.00005;

function selectionArea(geometry: BuildingGeometry): number {
  if (geometry.type === "Polygon") return footprintArea(geometry);
  let max = 0;
  for (const polygon of geometry.coordinates) {
    const ring = polygon[0] ?? [];
    let area = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x0, y0] = ring[j] as [number, number];
      const [x1, y1] = ring[i] as [number, number];
      area += x0 * y1 - x1 * y0;
    }
    max = Math.max(max, Math.abs(area / 2));
  }
  return max;
}

/**
 * Pick exactly one building under the cursor.
 * Prefers smallest footprint that contains the click; always allows a hit.
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
    if (selectionArea(feature.geometry) > MAX_SELECT_AREA) continue;
    candidates.push(feature);
  }

  // Soft fallback: still allow a pick if everything looked "large"
  // (hide layer will refuse unsafe collapse).
  if (candidates.length === 0) {
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
    if (selectionArea(feature.geometry) < selectionArea(prev.geometry)) {
      deduped.set(key, feature);
    }
  }

  const unique = [...deduped.values()];

  const containing = unique.filter(
    (feature) =>
      isBuildingGeometry(feature.geometry) &&
      pointInBuilding(clickLng, clickLat, feature.geometry),
  );

  // Pitched façade clicks often miss footprint containment — still pick nearest small building.
  const pool = containing.length > 0 ? containing : unique;

  pool.sort((a, b) => {
    const ga = a.geometry;
    const gb = b.geometry;
    if (!isBuildingGeometry(ga) || !isBuildingGeometry(gb)) return 0;
    const typeScore = (g: BuildingGeometry) => (g.type === "Polygon" ? 0 : 1);
    const typeDiff = typeScore(ga) - typeScore(gb);
    if (typeDiff !== 0) return typeDiff;
    return selectionArea(ga) - selectionArea(gb);
  });

  return pool[0] ?? null;
}

export function attachBuildingSelection(
  map: MapLibreMap,
  layerInfo: BuildingLayerInfo,
  handlers: BuildingSelectionHandlers,
): () => void {
  const queryBuildings = (point: { x: number; y: number }): MapGeoJSONFeature[] => {
    const layers = getAllBuildingQueryLayers(map, layerInfo);
    if (layers.length === 0) return [];
    // Screen pad: pitched 3D clicks need a little forgiveness.
    const pad = 8;
    try {
      return map.queryRenderedFeatures(
        [
          [point.x - pad, point.y - pad],
          [point.x + pad, point.y + pad],
        ],
        { layers },
      );
    } catch (error) {
      console.warn("[omt-glb-poc] building pick query failed", error);
      return [];
    }
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
