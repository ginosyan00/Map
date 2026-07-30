export type CameraShareState = {
  lng: number;
  lat: number;
  zoom: number;
  pitch: number;
  bearing: number;
};

export type AppShareState = {
  embed: boolean;
  focusId: string | null;
  camera: CameraShareState | null;
};

function num(value: string | null): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Read integration/share params from the current URL. */
export function parseShareState(search: string): AppShareState {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const lng = num(params.get("lng"));
  const lat = num(params.get("lat"));
  const zoom = num(params.get("z") ?? params.get("zoom"));
  const pitch = num(params.get("pitch"));
  const bearing = num(params.get("bearing"));

  const camera =
    lng != null && lat != null
      ? {
          lng,
          lat,
          zoom: zoom ?? 16,
          pitch: pitch ?? 55,
          bearing: bearing ?? 0,
        }
      : null;

  return {
    embed: params.get("embed") === "1" || params.get("embed") === "true",
    focusId: params.get("focus"),
    camera,
  };
}

export function buildShareUrl(input: {
  origin: string;
  pathname?: string;
  embed?: boolean;
  focusId?: string | null;
  camera?: CameraShareState | null;
}): string {
  const origin = input.origin.trim() || "http://localhost";
  const url = new URL(input.pathname || "/", origin);
  if (input.embed) url.searchParams.set("embed", "1");
  if (input.focusId) url.searchParams.set("focus", input.focusId);
  if (input.camera) {
    url.searchParams.set("lng", input.camera.lng.toFixed(6));
    url.searchParams.set("lat", input.camera.lat.toFixed(6));
    url.searchParams.set("z", input.camera.zoom.toFixed(2));
    url.searchParams.set("pitch", input.camera.pitch.toFixed(1));
    url.searchParams.set("bearing", input.camera.bearing.toFixed(1));
  }
  return url.toString();
}

export function buildEmbedSnippet(shareUrl: string): string {
  return `<iframe src="${shareUrl}" title="Manvel Map" style="width:100%;height:640px;border:0;border-radius:12px;" allowfullscreen loading="lazy"></iframe>`;
}
