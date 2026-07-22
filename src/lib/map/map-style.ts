import type { StyleSpecification, VectorSourceSpecification } from "maplibre-gl";
import { F4_DEMO_VIEW } from "./camera-presets";

export type MapEnvConfig = {
  styleUrl: string | null;
  tilesUrl: string | null;
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
};

export function getMapEnvConfig(): MapEnvConfig {
  const styleUrl = process.env.NEXT_PUBLIC_MAP_STYLE_URL?.trim() || null;
  const tilesUrl = process.env.NEXT_PUBLIC_MAPTILES_URL?.trim() || null;
  const lng = Number(process.env.NEXT_PUBLIC_MAP_CENTER_LNG ?? F4_DEMO_VIEW.center[0]);
  const lat = Number(process.env.NEXT_PUBLIC_MAP_CENTER_LAT ?? F4_DEMO_VIEW.center[1]);
  const zoom = Number(process.env.NEXT_PUBLIC_MAP_INITIAL_ZOOM ?? F4_DEMO_VIEW.zoom);
  const pitch = Number(process.env.NEXT_PUBLIC_MAP_INITIAL_PITCH ?? F4_DEMO_VIEW.pitch);
  const bearing = Number(process.env.NEXT_PUBLIC_MAP_INITIAL_BEARING ?? F4_DEMO_VIEW.bearing);

  return {
    styleUrl,
    tilesUrl,
    center: [lng, lat],
    zoom: Number.isFinite(zoom) ? zoom : F4_DEMO_VIEW.zoom,
    pitch: Number.isFinite(pitch) ? pitch : F4_DEMO_VIEW.pitch,
    bearing: Number.isFinite(bearing) ? bearing : F4_DEMO_VIEW.bearing,
  };
}

/**
 * Optionally rewrite OpenMapTiles vector source tiles to a self-hosted endpoint.
 */
export function applySelfHostedTiles(
  style: StyleSpecification,
  tilesUrl: string,
): StyleSpecification {
  const sources: StyleSpecification["sources"] = { ...style.sources };
  for (const [id, source] of Object.entries(sources)) {
    if (!source || typeof source !== "object") continue;
    if (!("type" in source) || source.type !== "vector") continue;
    const next: VectorSourceSpecification = {
      type: "vector",
      tiles: [tilesUrl],
      minzoom: "minzoom" in source && typeof source.minzoom === "number" ? source.minzoom : undefined,
      maxzoom: "maxzoom" in source && typeof source.maxzoom === "number" ? source.maxzoom : undefined,
      bounds: "bounds" in source ? (source.bounds as VectorSourceSpecification["bounds"]) : undefined,
      scheme: "scheme" in source ? (source.scheme as VectorSourceSpecification["scheme"]) : undefined,
      attribution:
        "attribution" in source && typeof source.attribution === "string"
          ? source.attribution
          : undefined,
    };
    sources[id] = next;
  }
  return { ...style, sources };
}

export const FALLBACK_STYLE_HINT =
  "Set NEXT_PUBLIC_MAP_STYLE_URL in .env.local (e.g. https://tiles.openfreemap.org/styles/liberty).";
