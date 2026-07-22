import type {
  ExpressionSpecification,
  FilterSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";

export type BuildingLayerInfo = {
  layerId: string;
  source: string;
  sourceLayer: string | undefined;
  type: string;
  originalFilter: FilterSpecification | null;
  /** Cached before height-hide so restore can undo data-driven collapse. */
  originalHeight?: ExpressionSpecification | number;
  originalBase?: ExpressionSpecification | number;
  createdByApp: boolean;
};

export type MapRuntimeStatus = {
  styleLoaded: boolean;
  buildingLayer: BuildingLayerInfo | null;
  customLayerReady: boolean;
  webglLost: boolean;
  error: string | null;
};

export type MapDebugSnapshot = {
  zoom: number;
  pitch: number;
  bearing: number;
  center: [number, number];
  buildingLayerId: string | null;
  sourceId: string | null;
  sourceLayer: string | null;
  customLayerStatus: string;
  glbLoadingStatus: string;
};

export type MapRef = MapLibreMap;

export type TerrainElevationFn = (
  lngLat: [number, number],
) => number | null | undefined;
