import type { Map as MapLibreMap, MapStyleImageMissingEvent } from "maplibre-gl";

const EMPTY_PIXEL = new Uint8Array([0, 0, 0, 0]);

/**
 * OpenFreeMap Liberty references sprite icons that are sometimes absent.
 * Register a 1×1 transparent placeholder so MapLibre stops spamming the console.
 */
export function attachMissingImageFallback(map: MapLibreMap): () => void {
  const onMissing = (event: MapStyleImageMissingEvent): void => {
    const id = event.id;
    if (!id || map.hasImage(id)) return;
    map.addImage(id, { width: 1, height: 1, data: EMPTY_PIXEL });
  };

  map.on("styleimagemissing", onMissing);
  return () => {
    map.off("styleimagemissing", onMissing);
  };
}
