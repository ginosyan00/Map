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
import {
  extractSiblingPolygons,
  footprintArea,
  identitiesEqual,
  pointInBuilding,
} from "./building-identification";
import { listAllBuildingExtrusionLayers, listAllBuildingHideLayers } from "./building-layer";
import { collapseExtrusionWhenHidden } from "./building-paint";
import { devLog } from "./constants";
import { syncReplacementGeoLayers } from "./replaced-cover";

export type HideTarget = {
  identity: BuildingIdentity;
  featureId?: string | number;
  source: string;
  sourceLayer?: string;
  geometry: BuildingGeometry;
  sourceGeometry?: BuildingGeometry;
  filterPropertyKey?: string;
  filterPropertyValue?: string | number;
  /** Map placement used to re-resolve the live vector feature. */
  lng?: number;
  lat?: number;
};

const FALLBACK_HEIGHT: ExpressionSpecification = [
  "coalesce",
  ["get", "render_height"],
  ["get", "height"],
  ["*", ["coalesce", ["get", "building:levels"], 3], 3],
  10,
];

const FALLBACK_BASE: ExpressionSpecification = [
  "coalesce",
  ["get", "render_min_height"],
  ["get", "min_height"],
  0,
];

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
  fallback = 1,
): void {
  if (!map.getLayer(layerInfo.layerId)) return;
  try {
    map.setPaintProperty(layerInfo.layerId, "fill-extrusion-opacity", fallback);
  } catch {
    /* ignore */
  }
}

function coerceFeatureId(raw: string | number): string | number {
  if (typeof raw === "number") return raw;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  return raw;
}

function isBuildingGeometry(
  geometry: GeoJSON.Geometry | null | undefined,
): geometry is BuildingGeometry {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

function cacheOriginalPaint(map: MapLibreMap, layerInfo: BuildingLayerInfo): void {
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

function uniqueIds(values: Array<string | number | undefined | null>): Array<string | number> {
  const out: Array<string | number> = [];
  const seen = new Set<string>();
  for (const raw of values) {
    if (raw === undefined || raw === null) continue;
    const id = coerceFeatureId(raw);
    for (const variant of typeof id === "number" ? [id, String(id)] : [id, Number(id)]) {
      if (typeof variant === "number" && !Number.isFinite(variant)) continue;
      const key = `${typeof variant}:${String(variant)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(variant);
    }
  }
  return out;
}

/**
 * Resolve the exact vector feature for each replacement.
 * Never fall back to a nearby neighbor — that hid the wrong building and left
 * the selected extrusion visible under the GLB ("model moves onto the old one").
 */
function resolveTargetsAgainstMap(
  map: MapLibreMap,
  targets: HideTarget[],
  layerList: BuildingLayerInfo[],
  replacements: CustomBuildingModel[],
): HideTarget[] {
  const layerIds = layerList.map((l) => l.layerId).filter((id) => Boolean(map.getLayer(id)));

  return targets.map((target) => {
    const replacement = replacements.find((r) =>
      identitiesEqual(r.buildingIdentity, target.identity),
    );

    // Trusted id from the original click — do not replace with a neighbor guess.
    const storedId = target.featureId ?? replacement?.vectorFeatureId;
    if (storedId !== undefined && storedId !== null && String(storedId).length > 0) {
      const trusted: HideTarget = {
        ...target,
        featureId: coerceFeatureId(storedId),
        lng: target.lng ?? replacement?.longitude,
        lat: target.lat ?? replacement?.latitude,
      };
      if (replacement) replacement.vectorFeatureId = trusted.featureId;
      return trusted;
    }

    const lng = target.lng ?? replacement?.longitude;
    const lat = target.lat ?? replacement?.latitude;
    const footprint = target.geometry ?? replacement?.footprintGeometry;
    const [footLng, footLat] = footprint
      ? (() => {
          // Inline centroid of footprint for matching.
          if (footprint.type === "Polygon") {
            const ring = footprint.coordinates[0] ?? [];
            if (ring.length === 0) return [lng ?? 0, lat ?? 0] as [number, number];
            let area = 0;
            let cx = 0;
            let cy = 0;
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
              const [x0, y0] = ring[j] as [number, number];
              const [x1, y1] = ring[i] as [number, number];
              const f = x0 * y1 - x1 * y0;
              area += f;
              cx += (x0 + x1) * f;
              cy += (y0 + y1) * f;
            }
            if (Math.abs(area) < 1e-12) return [lng ?? 0, lat ?? 0] as [number, number];
            return [cx / (3 * area), cy / (3 * area)] as [number, number];
          }
          return [lng ?? 0, lat ?? 0] as [number, number];
        })()
      : ([lng ?? 0, lat ?? 0] as [number, number]);

    const probeLng = Number.isFinite(footLng) ? footLng : lng;
    const probeLat = Number.isFinite(footLat) ? footLat : lat;
    if (
      probeLng == null ||
      probeLat == null ||
      !Number.isFinite(probeLng) ||
      !Number.isFinite(probeLat)
    ) {
      return target;
    }

    const matched = findFeatureContainingPoint(map, layerList, layerIds, probeLng, probeLat);
    if (!matched || matched.id === undefined || matched.id === null) {
      return target;
    }

    const next: HideTarget = {
      ...target,
      featureId: matched.id,
      source: matched.source || target.source,
      sourceLayer: matched.sourceLayer ?? target.sourceLayer,
      lng: probeLng,
      lat: probeLat,
    };
    if (replacement) replacement.vectorFeatureId = next.featureId;
    return next;
  });
}

function findFeatureContainingPoint(
  map: MapLibreMap,
  layerList: BuildingLayerInfo[],
  layerIds: string[],
  lng: number,
  lat: number,
): MapGeoJSONFeature | null {
  // 1) Rendered features under the footprint center (must contain the point).
  if (layerIds.length > 0) {
    const point = map.project([lng, lat]);
    const pad = 10;
    try {
      const rendered = map.queryRenderedFeatures(
        [
          [point.x - pad, point.y - pad],
          [point.x + pad, point.y + pad],
        ],
        { layers: layerIds },
      );
      const hit = pickContainingFeature(rendered, lng, lat);
      if (hit) return hit;
    } catch {
      /* continue */
    }
  }

  // 2) Source features (works even if extrusion height already collapsed).
  for (const layer of layerList) {
    try {
      const sourceFeatures = map.querySourceFeatures(layer.source, {
        sourceLayer: layer.sourceLayer,
      });
      const asMapFeatures = sourceFeatures.map((f) => ({
        ...f,
        source: layer.source,
        sourceLayer: layer.sourceLayer,
      })) as MapGeoJSONFeature[];
      const hit = pickContainingFeature(asMapFeatures, lng, lat);
      if (hit) return hit;
    } catch {
      /* continue */
    }
  }

  return null;
}

function pickContainingFeature(
  features: MapGeoJSONFeature[],
  lng: number,
  lat: number,
): MapGeoJSONFeature | null {
  const containing = features.filter(
    (f) =>
      isBuildingGeometry(f.geometry) &&
      pointInBuilding(lng, lat, f.geometry) &&
      f.id !== undefined &&
      f.id !== null,
  );
  if (containing.length === 0) return null;
  containing.sort((a, b) => {
    const ga = a.geometry;
    const gb = b.geometry;
    if (!isBuildingGeometry(ga) || !isBuildingGeometry(gb)) return 0;
    return footprintArea(ga) - footprintArea(gb);
  });
  return containing[0] ?? null;
}

/**
 * Simple MapLibre-safe match using native MVT feature ids only.
 * OpenFreeMap buildings have feature ids but no osm_id property.
 */
function buildHideMatchExpression(targets: HideTarget[]): ExpressionSpecification | null {
  const featureIds = uniqueIds(targets.map((t) => t.featureId));
  if (featureIds.length === 0) return null;
  return ["in", ["id"], ["literal", featureIds]] as ExpressionSpecification;
}

function collectStateIds(targets: HideTarget[]): Array<string | number> {
  return uniqueIds(targets.map((t) => t.featureId));
}

function applyHideToLayer(
  map: MapLibreMap,
  layerInfo: BuildingLayerInfo,
  targets: HideTarget[],
  previousIds: Array<string | number>,
): boolean {
  if (!map.getLayer(layerInfo.layerId)) return false;

  cacheOriginalPaint(map, layerInfo);

  const source = layerInfo.source;
  const sourceLayer = layerInfo.sourceLayer;
  const ids = collectStateIds(targets);
  const matchExpr = buildHideMatchExpression(targets);

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

  if (!matchExpr && ids.length === 0) {
    map.setFilter(layerInfo.layerId, layerInfo.originalFilter ?? null);
    return false;
  }

  // 3D extrusion: collapse height as a belt-and-suspenders backup to filter.
  if (layerInfo.type === "fill-extrusion") {
    ensureLiteralExtrusionOpacity(map, layerInfo, 1);
    const originalHeight = layerInfo.originalHeight ?? FALLBACK_HEIGHT;
    const originalBase = layerInfo.originalBase ?? FALLBACK_BASE;
    const hidePredicate: ExpressionSpecification = matchExpr
      ? ([
          "any",
          ["boolean", ["feature-state", "hidden"], false],
          matchExpr,
        ] as ExpressionSpecification)
      : (["boolean", ["feature-state", "hidden"], false] as ExpressionSpecification);

    try {
      map.setPaintProperty(
        layerInfo.layerId,
        "fill-extrusion-height",
        collapseExtrusionWhenHidden(originalHeight, hidePredicate),
      );
      map.setPaintProperty(
        layerInfo.layerId,
        "fill-extrusion-base",
        collapseExtrusionWhenHidden(originalBase, hidePredicate),
      );
    } catch (error) {
      console.warn("[omt-glb-poc] height-hide paint failed", layerInfo.layerId, error);
    }
  }

  // Primary removal: filter the feature out (works for fill AND fill-extrusion).
  if (matchExpr) {
    const exclusion = ["!", matchExpr] as FilterSpecification;
    try {
      map.setFilter(
        layerInfo.layerId,
        mergeExclusionFilter(layerInfo.originalFilter ?? null, exclusion),
      );
      return true;
    } catch (error) {
      console.warn("[omt-glb-poc] hide filter failed", layerInfo.layerId, error);
      if (ids.length > 0) {
        try {
          const idExclusion = [
            "!",
            ["in", ["id"], ["literal", ids]],
          ] as FilterSpecification;
          map.setFilter(
            layerInfo.layerId,
            mergeExclusionFilter(layerInfo.originalFilter ?? null, idExclusion),
          );
          return true;
        } catch (fallbackError) {
          console.warn("[omt-glb-poc] id hide filter failed", layerInfo.layerId, fallbackError);
          map.setFilter(layerInfo.layerId, layerInfo.originalFilter ?? null);
        }
      } else {
        map.setFilter(layerInfo.layerId, layerInfo.originalFilter ?? null);
      }
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
  if (layerInfo.type === "fill-extrusion") {
    if (layerInfo.originalHeight !== undefined) {
      map.setPaintProperty(layerInfo.layerId, "fill-extrusion-height", layerInfo.originalHeight);
    }
    if (layerInfo.originalBase !== undefined) {
      map.setPaintProperty(layerInfo.layerId, "fill-extrusion-base", layerInfo.originalBase);
    }
    ensureLiteralExtrusionOpacity(map, layerInfo, 1);
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

    const target: HideTarget = {
      identity: r.buildingIdentity,
      featureId: r.vectorFeatureId,
      source: r.buildingIdentity.source,
      sourceLayer: r.buildingIdentity.sourceLayer ?? r.vectorSourceLayer,
      geometry: r.footprintGeometry,
      sourceGeometry: r.sourceGeometry,
      filterPropertyKey: r.filterPropertyKey,
      filterPropertyValue: r.filterPropertyValue,
      lng: r.longitude,
      lat: r.latitude,
    };

    if (target.filterPropertyKey == null || target.filterPropertyValue == null) {
      if (r.buildingIdentity.type === "osm-id") {
        target.filterPropertyKey = "osm_id";
        target.filterPropertyValue = coerceFeatureId(r.buildingIdentity.value);
      } else if (r.buildingIdentity.type === "feature-id") {
        target.featureId = target.featureId ?? coerceFeatureId(r.buildingIdentity.value);
      }
    }

    targets.push(target);
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
      sourceGeometry: b.sourceGeometry,
      filterPropertyKey: b.filterPropertyKey,
      filterPropertyValue: b.filterPropertyValue,
      lng: b.centerLng,
      lat: b.centerLat,
    }));
}

export type ApplyHiddenOptions = {
  skipExpand?: boolean;
  skipIfUnchanged?: boolean;
};

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

  const hideLayers = listAllBuildingHideLayers(map);
  const extrusionLayers = listAllBuildingExtrusionLayers(map);
  const layerList = hideLayers.length > 0 ? hideLayers : extrusionLayers.length > 0 ? extrusionLayers : [layerInfo];

  if (targets.length === 0 && replacements.length === 0) {
    for (const layer of layerList) {
      restoreLayer(map, layer, previousHiddenIds);
    }
    return { applied: true, warning: null, hiddenIds: [] };
  }

  // Resolve against all building layers (2D fill + 3D extrusion).
  const pickLayers = layerList;
  enrichPreservedSiblings(map, replacements, extrusionLayers.length > 0 ? extrusionLayers : pickLayers);
  const resolved = resolveTargetsAgainstMap(map, targets, pickLayers, replacements);
  syncReplacementGeoLayers(map, replacements);

  void options.skipExpand;
  const ids = collectStateIds(resolved);
  const matchExpr = buildHideMatchExpression(resolved);

  const sameIds =
    ids.length === previousHiddenIds.length &&
    ids.every((id) => previousHiddenIds.some((p) => String(p) === String(id)));

  if (options.skipIfUnchanged && sameIds && ids.length > 0) {
    for (const layer of layerList) {
      refreshFeatureStateOnly(map, layer, ids);
    }
    return { applied: true, warning: null, hiddenIds: ids };
  }

  let anyApplied = false;
  for (const layer of layerList) {
    if (applyHideToLayer(map, layer, resolved, previousHiddenIds)) {
      anyApplied = true;
    }
  }

  if (layerInfo.originalHeight === undefined && layerList[0]) {
    layerInfo.originalHeight = layerList[0].originalHeight;
    layerInfo.originalBase = layerList[0].originalBase;
    layerInfo.originalFilter = layerList[0].originalFilter ?? layerInfo.originalFilter;
  }

  const warning =
    !anyApplied || (!matchExpr && ids.length === 0)
      ? "Could not hide original extrusion (feature not found in tiles). Try re-selecting the building."
      : null;

  devLog("Hidden buildings", {
    resolved: resolved.map((t) => ({
      id: t.featureId,
      osm: t.filterPropertyValue,
      key: t.filterPropertyKey,
    })),
    ids,
    anyApplied,
  });

  return {
    applied: anyApplied,
    hiddenIds: ids,
    warning,
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

function enrichPreservedSiblings(
  map: MapLibreMap,
  replacements: CustomBuildingModel[],
  layerList: BuildingLayerInfo[],
): void {
  for (const replacement of replacements) {
    if (replacement.preservedSiblings && replacement.preservedSiblings.length > 0) continue;
    if (!replacement.footprintGeometry || replacement.footprintGeometry.type !== "Polygon") {
      continue;
    }

    const layer = layerList[0];
    if (!layer) continue;

    let features: ReturnType<MapLibreMap["querySourceFeatures"]> = [];
    try {
      features = map.querySourceFeatures(layer.source, {
        sourceLayer: layer.sourceLayer,
      });
    } catch {
      continue;
    }

    const key = replacement.filterPropertyKey;
    const value = replacement.filterPropertyValue;
    const featureId = replacement.vectorFeatureId;

    for (const feature of features) {
      if (!feature.geometry || feature.geometry.type !== "MultiPolygon") continue;

      let matches = false;
      if (key != null && value != null && feature.properties) {
        matches = String(feature.properties[key]) === String(value);
      }
      if (!matches && featureId != null && feature.id != null) {
        matches = String(feature.id) === String(featureId);
      }
      if (!matches) continue;

      const siblings = extractSiblingPolygons(
        feature.geometry as BuildingGeometry,
        replacement.footprintGeometry,
      );
      if (siblings.length > 0) {
        replacement.preservedSiblings = siblings;
        replacement.sourceGeometry = feature.geometry as BuildingGeometry;
      }
      break;
    }
  }
}

export function restoreOriginalBuildingFilter(
  map: MapLibreMap,
  layerInfo: BuildingLayerInfo,
  previousHiddenIds: Array<string | number> = [],
): void {
  if (!map.isStyleLoaded()) return;
  const hideLayers = listAllBuildingHideLayers(map);
  const extrusionLayers = listAllBuildingExtrusionLayers(map);
  const layerList =
    hideLayers.length > 0 ? hideLayers : extrusionLayers.length > 0 ? extrusionLayers : [layerInfo];
  for (const layer of layerList) {
    restoreLayer(map, layer, previousHiddenIds);
  }
  syncReplacementGeoLayers(map, []);
}

/** @deprecated */
export function expandHideTargetsFromMap(
  _map: MapLibreMap,
  _layerInfos: BuildingLayerInfo[],
  targets: HideTarget[],
): HideTarget[] {
  return targets;
}

/** @deprecated */
export function applyHiddenBuildingsFilter(
  map: MapLibreMap,
  layerInfo: BuildingLayerInfo,
  buildings: SelectedBuilding[],
  identityList: BuildingIdentity[],
): { applied: boolean; warning?: string } {
  const targets = hideTargetsFromSelection(buildings, identityList);
  const result = applyHiddenBuildings(map, layerInfo, targets, [], [], { skipExpand: true });
  return { applied: result.applied, warning: result.warning ?? undefined };
}
