import type { Map as MapLibreMap } from "maplibre-gl";
import { CUSTOM_LAYER_ID } from "@/lib/map/constants";
import { CustomBuildingLayer } from "@/components/map/CustomBuildingLayer";

type MapWithLayer = MapLibreMap & { __customBuildingLayer?: CustomBuildingLayer };

export function ensureCustomBuildingLayer(map: MapLibreMap): CustomBuildingLayer {
  const existing = map.getLayer(CUSTOM_LAYER_ID);
  if (existing) {
    const attached = (map as MapWithLayer).__customBuildingLayer;
    if (attached) return attached;
    map.removeLayer(CUSTOM_LAYER_ID);
  }

  const layer = new CustomBuildingLayer();
  map.addLayer(layer);
  (map as MapWithLayer).__customBuildingLayer = layer;
  return layer;
}

export function removeCustomBuildingLayer(map: MapLibreMap): void {
  if (map.getLayer(CUSTOM_LAYER_ID)) {
    map.removeLayer(CUSTOM_LAYER_ID);
  }
  delete (map as MapWithLayer).__customBuildingLayer;
}
