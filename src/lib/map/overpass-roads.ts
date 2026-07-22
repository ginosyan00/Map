export type RoadLine = {
  id: string;
  coords: Array<[number, number]>;
  highway: string;
  lengthM: number;
};

export type BBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

const DEFAULT_OVERPASS =
  process.env.NEXT_PUBLIC_OVERPASS_URL?.trim() || "https://overpass-api.de/api/interpreter";

type OverpassElement = {
  type: string;
  id: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

/**
 * Fetch drivable OSM ways via Overpass API (free, no key).
 * Prefer the app proxy `/api/roads` to avoid browser CORS / UA issues.
 */
export async function fetchRoadsInBBox(
  bbox: BBox,
  signal?: AbortSignal,
): Promise<RoadLine[]> {
  const params = new URLSearchParams({
    west: String(bbox.west),
    south: String(bbox.south),
    east: String(bbox.east),
    north: String(bbox.north),
  });

  try {
    const proxy = await fetch(`/api/roads?${params.toString()}`, { signal });
    if (proxy.ok) {
      const json = (await proxy.json()) as { roads?: RoadLine[] };
      if (Array.isArray(json.roads)) return json.roads;
    }
  } catch {
    /* fall through to direct Overpass */
  }

  return fetchRoadsDirect(bbox, signal);
}

export async function fetchRoadsDirect(
  bbox: BBox,
  signal?: AbortSignal,
  endpoint: string = DEFAULT_OVERPASS,
): Promise<RoadLine[]> {
  const query = buildOverpassQuery(bbox);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  if (!response.ok) {
    throw new Error(`Overpass failed (${response.status}).`);
  }
  const data = (await response.json()) as OverpassResponse;
  return parseOverpassRoads(data);
}

export function buildOverpassQuery(bbox: BBox): string {
  const { south, west, north, east } = bbox;
  return `
[out:json][timeout:25];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|residential|unclassified|living_street)$"](${south},${west},${north},${east});
);
out geom;
`.trim();
}

export function parseOverpassRoads(data: OverpassResponse): RoadLine[] {
  const roads: RoadLine[] = [];
  for (const el of data.elements ?? []) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;
    const coords: Array<[number, number]> = el.geometry.map((p) => [p.lon, p.lat]);
    const lengthM = lineLengthMeters(coords);
    if (lengthM < 12) continue;
    roads.push({
      id: `way/${el.id}`,
      coords,
      highway: el.tags?.highway ?? "residential",
      lengthM,
    });
  }
  return roads;
}

export function expandBBox(centerLng: number, centerLat: number, radiusDeg: number): BBox {
  return {
    west: centerLng - radiusDeg,
    south: centerLat - radiusDeg * 0.75,
    east: centerLng + radiusDeg,
    north: centerLat + radiusDeg * 0.75,
  };
}

function lineLengthMeters(coords: Array<[number, number]>): number {
  let sum = 0;
  for (let i = 1; i < coords.length; i++) {
    sum += haversineM(coords[i - 1], coords[i]);
  }
  return sum;
}

function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
