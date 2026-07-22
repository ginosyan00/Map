import type {
  ExpressionSpecification,
  FilterSpecification,
  Map as MapLibreMap,
  MapGeoJSONFeature,
} from "maplibre-gl";
import type {
  BuildingGeometry,
  BuildingIdentity,
  CustomBuildingModel,
  SelectedBuilding,
} from "@/types/building";
import type { BuildingLayerInfo } from "@/types/map";
import { identitiesEqual } from "./building-identification";
import { listAllBuildingExtrusionLayers } from "./building-layer";
import { devLog } from "./constants";
import { syncReplacementGeoLayers } from "./replaced-cover";

export type HideTarget = {
  identity: BuildingIdentity;
  featureId?: string | number;
  source: string;
  sourceLayer?: string;
  geometry: BuildingGeometry;
  filterPropertyKey?: string;
  filterPropertyValue?: string | number;
};

const FALLBACK_HEIGHT: ExpressionSpecification = [
  "coalesce",
  ["get", "render_height"],
  ["get", "height"],
  ["get", "building:levels"],
  10,
];

const FALLBACK_BASE: ExpressionSpecification = [
  "coalesce",
  ["get", "render_min_height"],
  ["get", "min_height"],
  0,
];

/** ~30 m pad so a large GLB does not leave neighboring wedges visible. */
const FOOTPRINT_PAD_DEG = 0.00028;

export function mergeExclusionFilter(
  original: FilterSpecification | null,
  exclusion: FilterSpecification,
): FilterSpecification {
  if (!original) return exclusion;
  return ["all", original, exclusion] as FilterSpecification;
}

export function ensureLiteralExtrusionOpacity(
  map: MapLibreMap,
  layerInfo: BuildingLayerInfo,
  fallback = 0.9,
): void {
  if (!map.getLayer(layerInfo.layerId)) return;
  const current = map.getPaintProperty(layerInfo.layerId, "fill-extrusion-opacity");
  if (typeof current === "number") return;
  map.setPaintProperty(layerInfo.layerId, "fill-extrusion-opacity", fallback);
}

function coerceFeatureId(raw: string | number): string | number {
  if (typeof raw === "number") return raw;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}

function geometryBbox(geometry: BuildingGeometry): [number, number, number, number] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  const visit = (coords: number[][]): void => {
    for (const c of coords) {
      const lng = c[0] ?? 0;
      const lat = c[1] ?? 0;
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    }
  };

  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates) visit(ring);
  } else {
    for (const poly of geometry.coordinates) {
      for (const ring of poly) visit(ring);
    }
  }

  if (!Number.isFinite(minLng)) return [0, 0, 0, 0];
  return [minLng, minLat, maxLng, maxLat];
}

function padBbox(
  bbox: [number, number, number, number],
  pad: number,
): [number, number, number, number] {
  return [bbox[0] - pad, bbox[1] - pad, bbox[2] + pad, bbox[3] + pad];
}

function bboxesOverlap(
  a: [number, number, number, number],
  b: [number, number, number, number],
): boolean {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

function isBuildingGeometry(
  geometry: GeoJSON.Geometry | null | undefined,
): geometry is BuildingGeometry {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

/**
 * Find every rendered building that overlaps a replacement footprint (+ pad).
 * The selected feature-id alone often misses adjacent wedges under a large GLB.
 */
export function expandHideTargetsFromMap(
  map: MapLibreMap,
  layerInfos: BuildingLayerInfo[],
  targets: HideTarget[],
): HideTarget[] {
  if (targets.length === 0) return targets;

  const layerIds = layerInfos
    .map((l) => l.layerId)
    .filter((id) => Boolean(map.getLayer(id)));
  if (layerIds.length === 0) return targets;

  const expanded: HideTarget[] = [...targets];
  const seen = new Set<string>();
  for (const t of targets) {
    if (t.featureId !== undefined && t.featureId !== null) {
      seen.add(String(coerceFeatureId(t.featureId)));
    }
  }

  for (const target of targets) {
    if (!target.geometry) continue;
    const padded = padBbox(geometryBbox(target.geometry), FOOTPRINT_PAD_DEG);
    const sw = map.project([padded[0], padded[1]]);
    const ne = map.project([padded[2], padded[3]]);
    const minX = Math.min(sw.x, ne.x);
    const maxX = Math.max(sw.x, ne.x);
    const minY = Math.min(sw.y, ne.y);
    const maxY = Math.max(sw.y, ne.y);

    let features: MapGeoJSONFeature[] = [];
    try {
      features = map.queryRenderedFeatures(
        [
          [minX, minY],
          [maxX, maxY],
        ],
        { layers: layerIds },
      );
    } catch (error) {
      console.warn("[omt-glb-poc] queryRenderedFeatures for hide failed", error);
      continue;
    }

    const footprintBox = padded;
    for (const feature of features) {
      if (feature.id === undefined || feature.id === null) continue;
      if (!isBuildingGeometry(feature.geometry)) continue;
      if (!bboxesOverlap(geometryBbox(feature.geometry), footprintBox)) continue;

      const id = coerceFeatureId(feature.id);
      const key = String(id);
      if (seen.has(key)) continue;
      seen.add(key);

      expanded.push({
        identity: target.identity,
        featureId: id,
        source: feature.source,
        sourceLayer: feature.sourceLayer,
        geometry: feature.geometry,
      });
    }
  }

  devLog("Expanded hide targets", {
    from: targets.length,
    to: expanded.length,
    ids: expanded.map((t) => t.featureId),
  });
  return expanded;
}

function collectFeatureIds(targets: HideTarget[]): Array<string | number> {
  const ids: Array<string | number> = [];
  const seen = new Set<string>();
  for (const target of targets) {
    if (target.featureId === undefined || target.featureId === null) continue;
    const id = coerceFeatureId(target.featureId);
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    ids.push(id);
  }
  return ids;
}

/** Both number + string forms — MapLibre id typing is inconsistent across tiles. */
function idsForExpressions(ids: Array<string | number>): Array<string | number> {
  const out: Array<string | number> = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const variants: Array<string | number> =
      typeof id === "number" ? [id, String(id)] : [id, Number(id)];
    for (const v of variants) {
      if (typeof v === "number" && !Number.isFinite(v)) continue;
      const key = `${typeof v}:${String(v)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(v);
    }
  }
  return out;
}

function buildIdExclusionFilter(ids: Array<string | number>): FilterSpecification | null {
  const literalIds = idsForExpressions(ids);
  if (literalIds.length === 0) return null;
  return ["!", ["in", ["id"], ["literal", literalIds]]] as FilterSpecification;
}

function cacheOriginalPaint(map: MapLibreMap, layerInfo: BuildingLayerInfo): void {
  // Originals are captured once in building-layer.ts — do not re-read modified paint.
  if (layerInfo.originalHeight === undefined) {
    layerInfo.originalHeight = FALLBACK_HEIGHT;
  }
  if (layerInfo.originalBase === undefined) {
    layerInfo.originalBase = FALLBACK_BASE;
  }
  if (layerInfo.originalFilter === undefined) {
    layerInfo.originalFilter =
      (map.getFilter(layerInfo.layerId) as FilterSpecification | null) ?? null;
  }
}

function applyHideToLayer(
  map: MapLibreMap,
  layerInfo: BuildingLayerInfo,
  ids: Array<string | number>,
  previousIds: Array<string | number>,
): boolean {
  if (!map.getLayer(layerInfo.layerId)) return false;

  cacheOriginalPaint(map, layerInfo);
  ensureLiteralExtrusionOpacity(map, layerInfo);

  const source = layerInfo.source;
  const sourceLayer = layerInfo.sourceLayer;

  for (const id of previousIds) {
    try {
      map.removeFeatureState(
        sourceLayer ? { source, sourceLayer, id } : { source, id },
        "hidden",
      );
    } catch {
      /* ignore */
    }
  }

  for (const id of ids) {
    try {
      map.setFeatureState(
        sourceLayer ? { source, sourceLayer, id } : { source, id },
        { hidden: true },
      );
    } catch {
      /* ignore */
    }
  }

  const originalHeight = layerInfo.originalHeight ?? FALLBACK_HEIGHT;
  const originalBase = layerInfo.originalBase ?? FALLBACK_BASE;
  const literalIds = idsForExpressions(ids);

  const hidePredicate: ExpressionSpecification =
    literalIds.length > 0
      ? ([
          "any",
          ["boolean", ["feature-state", "hidden"], false],
          ["in", ["id"], ["literal", literalIds]],
        ] as ExpressionSpecification)
      : (["boolean", ["feature-state", "hidden"], false] as ExpressionSpecification);

  try {
    map.setPaintProperty(layerInfo.layerId, "fill-extrusion-height", [
      "case",
      hidePredicate,
      0,
      originalHeight,
    ] as ExpressionSpecification);
    map.setPaintProperty(layerInfo.layerId, "fill-extrusion-base", [
      "case",
      hidePredicate,
      0,
      originalBase,
    ] as ExpressionSpecification);
  } catch (error) {
    console.warn("[omt-glb-poc] height-hide paint failed", layerInfo.layerId, error);
  }

  const exclusion = buildIdExclusionFilter(ids);
  if (exclusion) {
    try {
      map.setFilter(
        layerInfo.layerId,
        mergeExclusionFilter(layerInfo.originalFilter ?? null, exclusion),
      );
      return true;
    } catch (error) {
      console.warn("[omt-glb-poc] id filter failed", layerInfo.layerId, error);
      map.setFilter(layerInfo.layerId, layerInfo.originalFilter ?? null);
    }
  }

  return ids.length > 0;
}

function restoreLayer(map: MapLibreMap, layerInfo: BuildingLayerInfo, ids: Array<string | number>): void {
  if (!map.getLayer(layerInfo.layerId)) return;
  const source = layerInfo.source;
  const sourceLayer = layerInfo.sourceLayer;
  for (const id of ids) {
    try {
      map.removeFeatureState(
        sourceLayer ? { source, sourceLayer, id } : { source, id },
        "hidden",
      );
    } catch {
      /* ignore */
    }
  }
  if (layerInfo.originalHeight !== undefined) {
    map.setPaintProperty(layerInfo.layerId, "fill-extrusion-height", layerInfo.originalHeight);
  }
  if (layerInfo.originalBase !== undefined) {
    map.setPaintProperty(layerInfo.layerId, "fill-extrusion-base", layerInfo.originalBase);
  }
  map.setFilter(layerInfo.layerId, layerInfo.originalFilter ?? null);
}

export function hideTargetsFromReplacements(
  replacements: CustomBuildingModel[],
): HideTarget[] {
  const targets: HideTarget[] = [];
  for (const r of replacements) {
    if (r.visible === false) continue;
    if (!r.footprintGeometry) continue;
    targets.push({
      identity: r.buildingIdentity,
      featureId: r.vectorFeatureId,
      source: r.buildingIdentity.source,
      sourceLayer: r.buildingIdentity.sourceLayer ?? r.vectorSourceLayer,
      geometry: r.footprintGeometry,
      filterPropertyKey: r.filterPropertyKey,
      filterPropertyValue: r.filterPropertyValue,
    });
  }
  return targets;
}

export function hideTargetsFromSelection(
  buildings: SelectedBuilding[],
  identities: BuildingIdentity[],
): HideTarget[] {
  return buildings
    .filter((b) => identities.some((id) => identitiesEqual(id, b.identity)))
    .map((b) => ({
      identity: b.identity,
      featureId: b.featureId,
      source: b.source,
      sourceLayer: b.sourceLayer,
      geometry: b.geometry,
      filterPropertyKey: b.filterPropertyKey,
      filterPropertyValue: b.filterPropertyValue,
    }));
}

export type ApplyHiddenOptions = {
  /** Do not queryRenderedFeatures to expand hide set (prevents flicker while panning). */
  skipExpand?: boolean;
  /** If hide id set unchanged, only refresh feature-state — skip filter/paint rewrite. */
  skipIfUnchanged?: boolean;
};

/**
 * Hide original extrusions under replacements across every building fill-extrusion layer.
 */
export function applyHiddenBuildings(
  map: MapLibreMap,
  layerInfo: BuildingLayerInfo,
  targets: HideTarget[],
  replacements: CustomBuildingModel[] = [],
  previousHiddenIds: Array<string | number> = [],
  options: ApplyHiddenOptions = {},
): { applied: boolean; warning: string | null; hiddenIds: Array<string | number> } {
  if (!map.isStyleLoaded()) {
    return { applied: false, warning: "Map style is not ready yet.", hiddenIds: [] };
  }

  syncReplacementGeoLayers(map, replacements);

  const layers = listAllBuildingExtrusionLayers(map);
  const layerList = layers.length > 0 ? layers : [layerInfo];

  if (targets.length === 0 && replacements.length === 0) {
    for (const layer of layerList) {
      restoreLayer(map, layer, previousHiddenIds);
    }
    return { applied: true, warning: null, hiddenIds: [] };
  }

  const expanded = options.skipExpand
    ? targets
    : expandHideTargetsFromMap(map, layerList, targets);
  const ids = collectFeatureIds(expanded);

  const sameIds =
    ids.length === previousHiddenIds.length &&
    ids.every((id) => previousHiddenIds.some((p) => String(p) === String(id)));

  if (options.skipIfUnchanged && sameIds && ids.length > 0) {
    // Tile reload: refresh feature-state only — do not rewrite paint/filter (flicker).
    for (const layer of layerList) {
      refreshFeatureStateOnly(map, layer, ids);
    }
    return { applied: true, warning: null, hiddenIds: ids };
  }

  let anyApplied = false;
  for (const layer of layerList) {
    if (applyHideToLayer(map, layer, ids, previousHiddenIds)) {
      anyApplied = true;
    }
  }

  if (layerInfo.originalHeight === undefined && layerList[0]) {
    layerInfo.originalHeight = layerList[0].originalHeight;
    layerInfo.originalBase = layerList[0].originalBase;
    layerInfo.originalFilter = layerList[0].originalFilter ?? layerInfo.originalFilter;
  }

  return {
    applied: true,
    hiddenIds: ids,
    warning: anyApplied
      ? null
      : "Could not hide original extrusion (missing feature ids). Your GLB still loads.",
  };
}

function refreshFeatureStateOnly(
  map: MapLibreMap,
  layerInfo: BuildingLayerInfo,
  ids: Array<string | number>,
): void {
  const source = layerInfo.source;
  const sourceLayer = layerInfo.sourceLayer;
  for (const id of ids) {
    try {
      map.setFeatureState(
        sourceLayer ? { source, sourceLayer, id } : { source, id },
        { hidden: true },
      );
    } catch {
      /* ignore */
    }
  }
}

export function restoreOriginalBuildingFilter(
  map: MapLibreMap,
  layerInfo: BuildingLayerInfo,
  previousHiddenIds: Array<string | number> = [],
): void {
  if (!map.isStyleLoaded()) return;
  const layers = listAllBuildingExtrusionLayers(map);
  const layerList = layers.length > 0 ? layers : [layerInfo];
  for (const layer of layerList) {
    restoreLayer(map, layer, previousHiddenIds);
  }
  syncReplacementGeoLayers(map, []);
}

/** @deprecated */
export function applyHiddenBuildingsFilter(
  map: MapLibreMap,
  layerInfo: BuildingLayerInfo,
  buildings: SelectedBuilding[],
  identityList: BuildingIdentity[],
): { applied: boolean; warning?: string } {
  const targets = hideTargetsFromSelection(buildings, identityList);
  const result = applyHiddenBuildings(map, layerInfo, targets, []);
  return { applied: result.applied, warning: result.warning ?? undefined };
}
