import type { Map as MapLibreMap } from "maplibre-gl";

/** Default camera: Yerevan downtown, pitched 3D view. */
export const DEFAULT_VIEW = {
  center: [44.5236047, 40.2119757] as [number, number],
  zoom: 17,
  pitch: 69,
  bearing: 38,
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
