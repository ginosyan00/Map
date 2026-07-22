import type {
  ExpressionSpecification,
  FilterSpecification,
  Map as MapLibreMap,
  StyleSpecification,
} from "maplibre-gl";
import type { BuildingLayerInfo } from "@/types/map";
import {
  APP_BUILDING_EXTRUSION_LAYER_ID,
  HIGHLIGHT_EXTRUSION_LAYER_ID,
  PRESERVED_PARTS_LAYER_ID,
  PRESERVED_PARTS_SOURCE_ID,
  REPLACED_COVER_LAYER_ID,
  REPLACED_COVER_SOURCE_ID,
  REPLACED_MODEL_LAYER_ID,
  REPLACED_MODEL_SOURCE_ID,
  devLog,
} from "./constants";
import {
  BUILDING_HEIGHT_EXPR,
  BUILDING_MIN_HEIGHT_EXPR,
  buildingBaseWithZoomGrow,
  buildingColorByHeight,
  buildingHeightWithZoomGrow,
} from "./building-paint";

const HEIGHT_EXPR = BUILDING_HEIGHT_EXPR;
const MIN_HEIGHT_EXPR = BUILDING_MIN_HEIGHT_EXPR;

/** Overlay extrusions — never treat as basemap buildings for hide/query. */
const OVERLAY_EXTRUSION_LAYER_IDS = new Set([
  HIGHLIGHT_EXTRUSION_LAYER_ID,
  PRESERVED_PARTS_LAYER_ID,
  REPLACED_COVER_LAYER_ID,
  REPLACED_MODEL_LAYER_ID,
]);

const OVERLAY_SOURCE_IDS = new Set([
  PRESERVED_PARTS_SOURCE_ID,
  REPLACED_COVER_SOURCE_ID,
  REPLACED_MODEL_SOURCE_ID,
]);

type LayerOriginals = {
  filter: FilterSpecification | null;
  height: ExpressionSpecification | number;
  base: ExpressionSpecification | number;
};

const layerOriginalsCache = new Map<string, LayerOriginals>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function layerSourceLayer(layer: Record<string, unknown>): string | undefined {
  const value = layer["source-layer"];
  return typeof value === "string" ? value : undefined;
}

function captureLayerOriginals(map: MapLibreMap, info: BuildingLayerInfo): BuildingLayerInfo {
  const cached = layerOriginalsCache.get(info.layerId);
  if (cached) {
    return {
      ...info,
      originalFilter: cached.filter,
      originalHeight: cached.height,
      originalBase: cached.base,
    };
  }

  const filter =
    (map.getFilter(info.layerId) as FilterSpecification | null) ?? info.originalFilter ?? null;
  const height =
    (map.getPaintProperty(info.layerId, "fill-extrusion-height") as
      | ExpressionSpecification
      | number
      | undefined) ?? HEIGHT_EXPR;
  const base =
    (map.getPaintProperty(info.layerId, "fill-extrusion-base") as
      | ExpressionSpecification
      | number
      | undefined) ?? MIN_HEIGHT_EXPR;

  layerOriginalsCache.set(info.layerId, { filter, height, base });
  return {
    ...info,
    originalFilter: filter,
    originalHeight: height,
    originalBase: base,
  };
}

/**
 * Find an existing fill-extrusion building layer, or create one from a vector building source.
 */
export function ensureBuildingExtrusionLayer(map: MapLibreMap): BuildingLayerInfo {
  const style = map.getStyle() as StyleSpecification | undefined;
  if (!style?.layers) {
    throw new Error("Map style has no layers.");
  }

  const existing = findExistingBuildingExtrusion(style);
  if (existing) {
    if (!map.getLayer(existing.layerId)) {
      throw new Error(`Detected building layer "${existing.layerId}" is missing on the map.`);
    }
    // Polish first, then cache — hide/restore keeps the grow-in height expressions.
    applyBuildingFirstRenderPaint(map, existing.layerId);
    const captured = captureLayerOriginals(map, existing);
    // Also polish sibling building extrusions (Liberty often has 2+).
    for (const sibling of listBuildingExtrusionsFromStyle(style)) {
      if (sibling.layerId === existing.layerId) continue;
      if (!map.getLayer(sibling.layerId)) continue;
      applyBuildingFirstRenderPaint(map, sibling.layerId);
      captureLayerOriginals(map, sibling);
    }
    devLog("Using existing building extrusion layer", captured);
    return captured;
  }

  const vectorBuilding = findVectorBuildingSource(style);
  if (!vectorBuilding) {
    throw new Error(
      "No building fill-extrusion layer and no vector building source-layer found in the style.",
    );
  }

  if (map.getLayer(APP_BUILDING_EXTRUSION_LAYER_ID)) {
    map.removeLayer(APP_BUILDING_EXTRUSION_LAYER_ID);
  }

  map.addLayer({
    id: APP_BUILDING_EXTRUSION_LAYER_ID,
    type: "fill-extrusion",
    source: vectorBuilding.source,
    "source-layer": vectorBuilding.sourceLayer,
    minzoom: 14,
    paint: {
      "fill-extrusion-color": buildingColorByHeight("#f3f2ef"),
      "fill-extrusion-height": buildingHeightWithZoomGrow(HEIGHT_EXPR),
      "fill-extrusion-base": buildingBaseWithZoomGrow(MIN_HEIGHT_EXPR),
      "fill-extrusion-opacity": 1,
      "fill-extrusion-vertical-gradient": true,
    },
  });

  try {
    map.setPaintProperty(APP_BUILDING_EXTRUSION_LAYER_ID, "fill-extrusion-ambient-occlusion-intensity", 0.42);
    map.setPaintProperty(APP_BUILDING_EXTRUSION_LAYER_ID, "fill-extrusion-ambient-occlusion-radius", 5);
  } catch {
    /* AO may be unsupported */
  }

  const grownHeight = buildingHeightWithZoomGrow(HEIGHT_EXPR);
  const grownBase = buildingBaseWithZoomGrow(MIN_HEIGHT_EXPR);

  const created: BuildingLayerInfo = {
    layerId: APP_BUILDING_EXTRUSION_LAYER_ID,
    source: vectorBuilding.source,
    sourceLayer: vectorBuilding.sourceLayer,
    type: "fill-extrusion",
    originalFilter: null,
    originalHeight: grownHeight,
    originalBase: grownBase,
    createdByApp: true,
  };
  layerOriginalsCache.set(created.layerId, {
    filter: null,
    height: grownHeight,
    base: grownBase,
  });
  devLog("Created app building extrusion layer", created);
  return created;
}

/**
 * Premium first paint: height tint, zoom grow-in, vertical gradient, soft AO.
 */
export function applyBuildingFirstRenderPaint(map: MapLibreMap, layerId: string): void {
  if (!map.getLayer(layerId)) return;
  try {
    map.setPaintProperty(layerId, "fill-extrusion-color", buildingColorByHeight("#f3f2ef"));
    map.setPaintProperty(layerId, "fill-extrusion-height", buildingHeightWithZoomGrow(HEIGHT_EXPR));
    map.setPaintProperty(layerId, "fill-extrusion-base", buildingBaseWithZoomGrow(MIN_HEIGHT_EXPR));
    map.setPaintProperty(layerId, "fill-extrusion-opacity", 1);
    map.setPaintProperty(layerId, "fill-extrusion-vertical-gradient", true);
  } catch {
    /* ignore */
  }
  try {
    map.setPaintProperty(layerId, "fill-extrusion-ambient-occlusion-intensity", 0.42);
    map.setPaintProperty(layerId, "fill-extrusion-ambient-occlusion-radius", 5);
  } catch {
    /* AO may be unsupported */
  }
}

function findExistingBuildingExtrusion(style: StyleSpecification): BuildingLayerInfo | null {
  const all = listBuildingExtrusionsFromStyle(style);
  return all[0] ?? null;
}

function listBuildingExtrusionsFromStyle(style: StyleSpecification): BuildingLayerInfo[] {
  const result: BuildingLayerInfo[] = [];
  for (const layer of style.layers ?? []) {
    if (!isRecord(layer)) continue;
    if (layer.type !== "fill-extrusion") continue;
    const info = buildingLayerInfoFromStyleLayer(style, layer);
    if (info) result.push(info);
  }
  return result;
}

/**
 * Liberty draws buildings as BOTH:
 * - `building` fill (2D footprint)
 * - `building-3d` fill-extrusion
 * Hide must target both or the flat footprint remains under the GLB.
 */
function listBuildingHideLayersFromStyle(style: StyleSpecification): BuildingLayerInfo[] {
  const result: BuildingLayerInfo[] = [];
  for (const layer of style.layers ?? []) {
    if (!isRecord(layer)) continue;
    if (layer.type !== "fill-extrusion" && layer.type !== "fill") continue;
    const info = buildingLayerInfoFromStyleLayer(style, layer);
    if (info) result.push(info);
  }
  return result;
}

function buildingLayerInfoFromStyleLayer(
  style: StyleSpecification,
  layer: Record<string, unknown>,
): BuildingLayerInfo | null {
  const id = typeof layer.id === "string" ? layer.id : "";
  if (!id || OVERLAY_EXTRUSION_LAYER_IDS.has(id)) return null;

  const sourceLayer = layerSourceLayer(layer);
  const source = "source" in layer && typeof layer.source === "string" ? layer.source : "";
  if (!source || OVERLAY_SOURCE_IDS.has(source)) return null;

  const sourceSpec = style.sources?.[source];
  if (isRecord(sourceSpec) && sourceSpec.type === "geojson") return null;

  const looksLikeBuilding =
    id.toLowerCase().includes("building") ||
    sourceLayer?.toLowerCase() === "building" ||
    sourceLayer?.toLowerCase().includes("building");

  if (!looksLikeBuilding) return null;

  const type = layer.type === "fill" ? "fill" : "fill-extrusion";
  return {
    layerId: id,
    source,
    sourceLayer,
    type,
    originalFilter: (layer.filter as FilterSpecification | undefined) ?? null,
    createdByApp: id === APP_BUILDING_EXTRUSION_LAYER_ID,
  };
}

/**
 * Every fill-extrusion building layer currently on the map (Liberty may have more than one).
 * Paint originals are cached on first capture so hide/restore never nests expressions.
 */
export function listAllBuildingExtrusionLayers(map: MapLibreMap): BuildingLayerInfo[] {
  const style = map.getStyle() as StyleSpecification | undefined;
  if (!style?.layers) return [];

  return listBuildingExtrusionsFromStyle(style)
    .filter((info) => Boolean(map.getLayer(info.layerId)))
    .map((info) => captureLayerOriginals(map, info));
}

/** Fill + fill-extrusion building layers that must be filtered when replacing a building. */
export function listAllBuildingHideLayers(map: MapLibreMap): BuildingLayerInfo[] {
  const style = map.getStyle() as StyleSpecification | undefined;
  if (!style?.layers) return [];

  return listBuildingHideLayersFromStyle(style)
    .filter((info) => Boolean(map.getLayer(info.layerId)))
    .map((info) => {
      if (info.type === "fill-extrusion") return captureLayerOriginals(map, info);
      // Fill layers: only cache filter.
      if (info.originalFilter === undefined) {
        const cached = layerOriginalsCache.get(info.layerId);
        if (cached) return { ...info, originalFilter: cached.filter };
        const filter =
          (map.getFilter(info.layerId) as FilterSpecification | null) ?? info.originalFilter ?? null;
        layerOriginalsCache.set(info.layerId, {
          filter,
          height: HEIGHT_EXPR,
          base: MIN_HEIGHT_EXPR,
        });
        return { ...info, originalFilter: filter };
      }
      return info;
    });
}

function findVectorBuildingSource(
  style: StyleSpecification,
): { source: string; sourceLayer: string } | null {
  for (const layer of style.layers ?? []) {
    if (!isRecord(layer)) continue;
    const sourceLayer = layerSourceLayer(layer);
    if (!sourceLayer || sourceLayer.toLowerCase() !== "building") continue;
    const source =
      "source" in layer && typeof layer.source === "string" ? layer.source : "";
    if (!source) continue;
    return { source, sourceLayer };
  }

  // OpenMapTiles schemas often expose "building" without a dedicated fill layer at low zoom.
  for (const [sourceId, source] of Object.entries(style.sources ?? {})) {
    if (!isRecord(source) || source.type !== "vector") continue;
    return { source: sourceId, sourceLayer: "building" };
  }

  return null;
}

export function getBuildingQueryLayers(info: BuildingLayerInfo): string[] {
  return [info.layerId];
}

export function getBuildingQueryLayersFromMap(map: MapLibreMap): string[] {
  return listAllBuildingExtrusionLayers(map).map((l) => l.layerId);
}

/** All building extrusion layer ids currently on the map (for click picking). */
export function getAllBuildingQueryLayers(map: MapLibreMap, fallback: BuildingLayerInfo): string[] {
  const fromMap = getBuildingQueryLayersFromMap(map).filter((id) => Boolean(map.getLayer(id)));
  if (fromMap.length > 0) return fromMap;
  return getBuildingQueryLayers(fallback).filter((id) => Boolean(map.getLayer(id)));
}
