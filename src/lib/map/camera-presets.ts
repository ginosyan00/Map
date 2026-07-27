import type { Map as MapLibreMap } from "maplibre-gl";

function envNumber(key: string, fallback: number): number {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Default camera from NEXT_PUBLIC_MAP_* (see .env).
 * Fallback matches F4map demo: https://demo.f4map.com/#lat=40.2072833&lon=44.5189334&zoom=18&camera.phi=-17.59
 */
export const DEFAULT_VIEW = {
  center: [
    envNumber("NEXT_PUBLIC_MAP_CENTER_LNG", 44.5189334),
    envNumber("NEXT_PUBLIC_MAP_CENTER_LAT", 40.2072833),
  ] as [number, number],
  zoom: envNumber("NEXT_PUBLIC_MAP_INITIAL_ZOOM", 18),
  pitch: envNumber("NEXT_PUBLIC_MAP_INITIAL_PITCH", 62),
  bearing: envNumber("NEXT_PUBLIC_MAP_INITIAL_BEARING", -17.59),
};

export type CinematicFlyOptions = {
  center: [number, number];
  zoom?: number;
  pitch?: number;
  bearing?: number;
  duration?: number;
};

export function cinematicFlyTo(map: MapLibreMap, options: CinematicFlyOptions): void {
  map.flyTo({
    center: options.center,
    zoom: options.zoom ?? map.getZoom(),
    pitch: options.pitch ?? map.getPitch(),
    bearing: options.bearing ?? map.getBearing(),
    duration: options.duration ?? 2200,
    curve: 1.4,
    speed: 0.8,
    essential: true,
  });
}

export function cinematicEaseTo(map: MapLibreMap, options: CinematicFlyOptions): void {
  map.easeTo({
    center: options.center,
    zoom: options.zoom ?? map.getZoom(),
    pitch: options.pitch ?? map.getPitch(),
    bearing: options.bearing ?? map.getBearing(),
    duration: options.duration ?? 1400,
    easing: (t) => 1 - Math.pow(1 - t, 3),
    essential: true,
  });
}

export function resetToDefaultView(map: MapLibreMap): void {
  cinematicEaseTo(map, {
    center: DEFAULT_VIEW.center,
    zoom: DEFAULT_VIEW.zoom,
    pitch: DEFAULT_VIEW.pitch,
    bearing: DEFAULT_VIEW.bearing,
    duration: 1600,
  });
}

type OrbitController = {
  start: () => void;
  stop: () => void;
  destroy: () => void;
  setEnabled: (enabled: boolean) => void;
};

/**
 * Gentle idle bearing drift. Pauses on user interaction, resumes after idle delay.
 */
export function createIdleOrbit(map: MapLibreMap, degreesPerSecond = 0.7): OrbitController {
  let enabled = true;
  let raf = 0;
  let lastTs = 0;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let paused = false;

  const tick = (ts: number): void => {
    if (!enabled || paused) {
      raf = 0;
      return;
    }
    if (!lastTs) lastTs = ts;
    const dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    map.setBearing(map.getBearing() + degreesPerSecond * dt);
    raf = requestAnimationFrame(tick);
  };

  const start = (): void => {
    if (!enabled || raf) return;
    lastTs = 0;
    raf = requestAnimationFrame(tick);
  };

  const stop = (): void => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastTs = 0;
  };

  const pauseForInteraction = (): void => {
    paused = true;
    stop();
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      paused = false;
      if (enabled) start();
    }, 4500);
  };

  const events = ["mousedown", "touchstart", "wheel", "dragstart"] as const;
  for (const event of events) {
    map.on(event, pauseForInteraction);
  }

  return {
    start,
    stop,
    setEnabled: (next) => {
      enabled = next;
      if (!enabled) {
        stop();
        paused = true;
      } else {
        paused = false;
        start();
      }
    },
    destroy: () => {
      stop();
      if (idleTimer) clearTimeout(idleTimer);
      for (const event of events) {
        map.off(event, pauseForInteraction);
      }
    },
  };
}
