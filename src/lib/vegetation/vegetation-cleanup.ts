import type { Map as MapLibreMap } from "maplibre-gl";
import { VEGETATION_LAYER_ID } from "./vegetation-config";
import { disposeTreeTemplates } from "./tree-model-loader";

export function removeVegetationLayerSafe(map: MapLibreMap): void {
  if (map.getLayer(VEGETATION_LAYER_ID)) {
    map.removeLayer(VEGETATION_LAYER_ID);
  }
}

export function disposeVegetationResources(opts?: { disposeTemplates?: boolean }): void {
  if (opts?.disposeTemplates) {
    disposeTreeTemplates();
  }
}
