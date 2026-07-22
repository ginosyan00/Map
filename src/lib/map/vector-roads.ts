import type { Map as MapLibreMap } from "maplibre-gl";
import type { RoadLine } from "./overpass-roads";

const DRIVABLE = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "residential",
  "unclassified",
  "living_street",
  "service",
]);

type LngLat = [number, number];

/**
 * Extract drivable roads from already-loaded OpenMapTiles vector sources (free, no key).
 * Prefer this over Overpass when tiles are on-screen — no network / rate limits.
 */
export function extractRoadsFromVectorTiles(map: MapLibreMap): RoadLine[] {
  const style = map.getStyle();
  if (!style?.sources) return [];

  const roads: RoadLine[] = [];
  const seen = new Set<string>();

  for (const [sourceId, source] of Object.entries(style.sources)) {
    if (!source || typeof source !== "object" || source.type !== "vector") continue;

    let features: ReturnType<MapLibreMap["querySourceFeatures"]> = [];
    try {
      features = map.querySourceFeatures(sourceId, {
        sourceLayer: "transportation",
      });
    } catch {
      continue;
    }

    for (const feature of features) {
      const props = feature.properties ?? {};
      const klass = String(props.class ?? props.highway ?? "");
      if (!DRIVABLE.has(klass)) continue;

      const geom = feature.geometry;
      if (!geom) continue;

      const lines: LngLat[][] = [];
      if (geom.type === "LineString") {
        lines.push(geom.coordinates as LngLat[]);
      } else if (geom.type === "MultiLineString") {
        for (const line of geom.coordinates) lines.push(line as LngLat[]);
      } else {
        continue;
      }

      for (let i = 0; i < lines.length; i++) {
        const coords = densifyIfNeeded(lines[i]!);
        if (coords.length < 2) continue;
        const lengthM = lineLengthMeters(coords);
        if (lengthM < 6) continue;
        const id = `${sourceId}:${String(feature.id ?? props.osm_id ?? props.id ?? "x")}:${i}:${coords[0]![0].toFixed(5)}`;
        if (seen.has(id)) continue;
        seen.add(id);
        roads.push({ id, coords, highway: klass, lengthM });
      }
    }
  }

  return mergeNearDuplicates(roads);
}

function densifyIfNeeded(coords: LngLat[]): LngLat[] {
  // Tile geometries are already dense enough for car animation.
  return coords.filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]));
}

function mergeNearDuplicates(roads: RoadLine[]): RoadLine[] {
  // Keep more segments so every visible street can carry traffic.
  return roads.sort((a, b) => b.lengthM - a.lengthM).slice(0, 2000);
}

function lineLengthMeters(coords: LngLat[]): number {
  let sum = 0;
  for (let i = 1; i < coords.length; i++) {
    sum += approxMeters(coords[i - 1]!, coords[i]!);
  }
  return sum;
}

function approxMeters(a: LngLat, b: LngLat): number {
  const midLat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  const dx = (b[0] - a[0]) * Math.cos(midLat) * 111_320;
  const dy = (b[1] - a[1]) * 110_540;
  return Math.hypot(dx, dy);
}
