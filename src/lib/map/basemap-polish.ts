import type { Map as MapLibreMap, StyleSpecification } from "maplibre-gl";

/**
 * Restyle OpenFreeMap/OMT layers for a clean architectural look:
 * white extrusions, dark asphalt, green parks, soft ground, muted labels.
 * Does not touch fill-extrusion-height / base / filter (hide cache safe).
 */
export function applyBasemapLook(map: MapLibreMap): void {
  if (!map.isStyleLoaded()) return;
  const style = map.getStyle() as StyleSpecification | undefined;
  if (!style?.layers) return;

  for (const layer of style.layers) {
    const id = layer.id.toLowerCase();
    const type = layer.type;

    try {
      if (type === "background") {
        map.setPaintProperty(layer.id, "background-color", "#e8e6e1");
        continue;
      }

      if (type === "fill") {
        if (isPark(id)) {
          map.setPaintProperty(layer.id, "fill-color", "#7a9a6a");
          map.setPaintProperty(layer.id, "fill-opacity", 0.92);
        } else if (isWater(id)) {
          map.setPaintProperty(layer.id, "fill-color", "#a8c4d4");
          map.setPaintProperty(layer.id, "fill-opacity", 1);
        } else if (isLand(id)) {
          map.setPaintProperty(layer.id, "fill-color", "#ddd9d2");
        } else if (isSandOrBeach(id)) {
          map.setPaintProperty(layer.id, "fill-color", "#e6dfd0");
        }
        continue;
      }

      if (type === "line") {
        if (isRoadFill(id) || isHighway(id)) {
          if (id.includes("casing") || id.includes("case") || id.includes("outline")) {
            map.setPaintProperty(layer.id, "line-color", "#ffffff");
            map.setPaintProperty(layer.id, "line-opacity", 0.95);
          } else if (id.includes("tunnel")) {
            map.setPaintProperty(layer.id, "line-color", "#9a9a9a");
          } else {
            map.setPaintProperty(layer.id, "line-color", "#5c5c5c");
            map.setPaintProperty(layer.id, "line-opacity", 1);
          }
        } else if (isPath(id)) {
          map.setPaintProperty(layer.id, "line-color", "#cfc9c0");
        } else if (isWater(id)) {
          map.setPaintProperty(layer.id, "line-color", "#8eb0c2");
        } else if (isBoundary(id)) {
          map.setPaintProperty(layer.id, "line-opacity", 0.25);
        }
        continue;
      }

      if (type === "fill-extrusion") {
        if (id.includes("building")) {
          map.setPaintProperty(layer.id, "fill-extrusion-opacity", 1);
          map.setPaintProperty(layer.id, "fill-extrusion-vertical-gradient", true);
          try {
            map.setPaintProperty(layer.id, "fill-extrusion-ambient-occlusion-intensity", 0.4);
            map.setPaintProperty(layer.id, "fill-extrusion-ambient-occlusion-radius", 5);
          } catch {
            /* AO may be unsupported */
          }
          // Color/height grow applied once in building-layer first-render polish.
        }
        continue;
      }

      if (type === "symbol") {
        if (id.includes("poi") || id.includes("housenumber") || id.includes("shop")) {
          map.setLayoutProperty(layer.id, "visibility", "none");
        } else if (id.includes("road") || id.includes("street") || id.includes("highway")) {
          map.setPaintProperty(layer.id, "text-color", "#6b6b6b");
          map.setPaintProperty(layer.id, "text-halo-color", "#ffffff");
          map.setPaintProperty(layer.id, "text-halo-width", 1.2);
        } else {
          map.setPaintProperty(layer.id, "text-opacity", 0.75);
        }
      }

      if (type === "circle" && (id.includes("poi") || id.includes("place"))) {
        map.setLayoutProperty(layer.id, "visibility", "none");
      }
    } catch {
      /* property may not exist on this layer */
    }
  }

  try {
    map.setLight({
      anchor: "map",
      color: "#ffffff",
      intensity: 0.55,
      position: [1.35, 210, 30],
    });
  } catch {
    /* ignore */
  }
}

function isPark(id: string): boolean {
  return (
    id.includes("park") ||
    id.includes("grass") ||
    id.includes("wood") ||
    id.includes("forest") ||
    id.includes("garden") ||
    id.includes("pitch") ||
    id.includes("landcover-grass") ||
    id.includes("landuse-grass")
  );
}

function isWater(id: string): boolean {
  return id.includes("water") || id.includes("river") || id.includes("lake");
}

function isLand(id: string): boolean {
  return (
    id.includes("landcover") ||
    id.includes("landuse") ||
    id.includes("land") ||
    id === "earth" ||
    id.includes("background")
  );
}

function isSandOrBeach(id: string): boolean {
  return id.includes("sand") || id.includes("beach");
}

function isRoadFill(id: string): boolean {
  return (
    id.includes("road") ||
    id.includes("street") ||
    id.includes("bridge") ||
    id.includes("motorway") ||
    id.includes("trunk") ||
    id.includes("primary") ||
    id.includes("secondary") ||
    id.includes("tertiary") ||
    id.includes("residential") ||
    id.includes("service") ||
    id.includes("transportation")
  );
}

function isHighway(id: string): boolean {
  return id.includes("highway") || id.includes("motorway");
}

function isPath(id: string): boolean {
  return id.includes("path") || id.includes("pedestrian") || id.includes("footway") || id.includes("sidewalk");
}

function isBoundary(id: string): boolean {
  return id.includes("boundary") || id.includes("admin");
}
