import type {
  ExpressionSpecification,
  FilterSpecification,
  Map as MapLibreMap,
  StyleSpecification,
} from "maplibre-gl";
import type { BuildingLayerInfo } from "@/types/map";
import { APP_BUILDING_EXTRUSION_LAYER_ID } from "./constants";
import { devLog } from "./constants";

const HEIGHT_EXPR: ExpressionSpecification = [
  "coalesce",
  ["get", "render_height"],
  ["get", "height"],
  ["get", "building:levels"],
  10,
];

const MIN_HEIGHT_EXPR: ExpressionSpecification = [
  "coalesce",
  ["get", "render_min_height"],
  ["get", "min_height"],
  0,
];

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
    const captured = captureLayerOriginals(map, existing);
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
      "fill-extrusion-color": "#c4c0b8",
      "fill-extrusion-height": HEIGHT_EXPR,
      "fill-extrusion-base": MIN_HEIGHT_EXPR,
      "fill-extrusion-opacity": 0.9,
    },
  });

  const created: BuildingLayerInfo = {
    layerId: APP_BUILDING_EXTRUSION_LAYER_ID,
    source: vectorBuilding.source,
    sourceLayer: vectorBuilding.sourceLayer,
    type: "fill-extrusion",
    originalFilter: null,
    originalHeight: HEIGHT_EXPR,
    originalBase: MIN_HEIGHT_EXPR,
    createdByApp: true,
  };
  layerOriginalsCache.set(created.layerId, {
    filter: null,
    height: HEIGHT_EXPR,
    base: MIN_HEIGHT_EXPR,
  });
  devLog("Created app building extrusion layer", created);
  return created;
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
    const id = typeof layer.id === "string" ? layer.id : "";
    const sourceLayer = layerSourceLayer(layer);
    const source = "source" in layer && typeof layer.source === "string" ? layer.source : "";
    const looksLikeBuilding =
      id.toLowerCase().includes("building") ||
      sourceLayer?.toLowerCase() === "building" ||
      sourceLayer?.toLowerCase().includes("building");

    if (!looksLikeBuilding || !source) continue;

    result.push({
      layerId: id,
      source,
      sourceLayer,
      type: "fill-extrusion",
      originalFilter: (layer.filter as FilterSpecification | undefined) ?? null,
      createdByApp: false,
    });
  }
  return result;
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
