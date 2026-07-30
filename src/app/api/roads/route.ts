import { NextResponse } from "next/server";
import {
  buildOverpassQuery,
  parseOverpassRoads,
  type BBox,
} from "@/lib/map/overpass-roads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OVERPASS_ENDPOINTS = [
  process.env.NEXT_PUBLIC_OVERPASS_URL?.trim(),
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
].filter((v): v is string => Boolean(v));

/**
 * Free Overpass proxy — OSM roads for vehicle simulation (no API key).
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const west = Number(url.searchParams.get("west"));
  const south = Number(url.searchParams.get("south"));
  const east = Number(url.searchParams.get("east"));
  const north = Number(url.searchParams.get("north"));

  if (![west, south, east, north].every(Number.isFinite)) {
    return NextResponse.json({ error: "Invalid bbox." }, { status: 400 });
  }

  if (!(west < east && south < north)) {
    return NextResponse.json(
      { error: "Invalid bbox order (need west < east and south < north)." },
      { status: 400 },
    );
  }

  // Guard against huge queries.
  if (east - west > 0.08 || north - south > 0.08) {
    return NextResponse.json({ error: "BBox too large." }, { status: 400 });
  }

  const bbox: BBox = { west, south, east, north };
  const query = buildOverpassQuery(bbox);

  let lastError = "Overpass unavailable.";
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "omt-glb-poc/0.1 (MapLibre vehicle layer)",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(28_000),
      });
      if (!response.ok) {
        lastError = `Overpass ${response.status}`;
        continue;
      }
      const text = await response.text();
      if (!text.trimStart().startsWith("{")) {
        lastError = "Overpass returned non-JSON (rate limited?).";
        continue;
      }
      const data: unknown = JSON.parse(text);
      const roads = parseOverpassRoads(data as Parameters<typeof parseOverpassRoads>[0]);
      return NextResponse.json(
        { roads, source: "overpass", count: roads.length },
        {
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
          },
        },
      );
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Overpass fetch failed.";
    }
  }

  return NextResponse.json({ error: lastError, roads: [] }, { status: 502 });
}
