import type { Map as MapLibreMap, SkySpecification } from "maplibre-gl";
import { listAllBuildingExtrusionLayers } from "./building-layer";
import { buildingColorByHeight } from "./building-paint";

export type TimeOfDay = "live" | "night" | "morning" | "noon" | "evening";
export type WeatherMode = "sun" | "rain" | "snow";

export type AtmosphereOptions = {
  timeOfDay: TimeOfDay;
  weather: WeatherMode;
  showSky: boolean;
  showBuildings: boolean;
  showLabels: boolean;
};

type TimePreset = {
  skyColor: string;
  horizonColor: string;
  fogColor: string;
  skyHorizonBlend: number;
  horizonFogBlend: number;
  fogGroundBlend: number;
  lightAnchor: "map" | "viewport";
  lightIntensity: number;
  lightColor: string;
  lightPosition: [number, number, number];
  buildingColor: string;
  buildingOpacity: number;
};

/** Daytime defaults: pale buildings, bright sky, strong side light. */
const TIME_PRESETS: Record<Exclude<TimeOfDay, "live">, TimePreset> = {
  night: {
    skyColor: "#0b1220",
    horizonColor: "#1e293b",
    fogColor: "#0f172a",
    skyHorizonBlend: 0.35,
    horizonFogBlend: 0.55,
    fogGroundBlend: 0.22,
    lightAnchor: "viewport",
    lightIntensity: 0.28,
    lightColor: "#94a3b8",
    lightPosition: [1.2, 200, 40],
    buildingColor: "#9aa3ad",
    buildingOpacity: 0.95,
  },
  morning: {
    skyColor: "#9ec9ef",
    horizonColor: "#f0e6d8",
    fogColor: "#e8eef4",
    skyHorizonBlend: 0.5,
    horizonFogBlend: 0.35,
    fogGroundBlend: 0.1,
    lightAnchor: "map",
    lightIntensity: 0.5,
    lightColor: "#fff8f0",
    lightPosition: [1.3, 230, 28],
    buildingColor: "#f5f4f1",
    buildingOpacity: 1,
  },
  noon: {
    skyColor: "#8eb8e0",
    horizonColor: "#dce8f2",
    fogColor: "#eef2f5",
    skyHorizonBlend: 0.55,
    horizonFogBlend: 0.22,
    fogGroundBlend: 0.06,
    lightAnchor: "map",
    lightIntensity: 0.62,
    lightColor: "#ffffff",
    lightPosition: [1.4, 210, 26],
    buildingColor: "#f3f2ef",
    buildingOpacity: 1,
  },
  evening: {
    skyColor: "#3d5a80",
    horizonColor: "#e8a06a",
    fogColor: "#4a5568",
    skyHorizonBlend: 0.42,
    horizonFogBlend: 0.48,
    fogGroundBlend: 0.16,
    lightAnchor: "map",
    lightIntensity: 0.42,
    lightColor: "#ffd7b0",
    lightPosition: [1.25, 250, 22],
    buildingColor: "#ebe4da",
    buildingOpacity: 1,
  },
};

function resolveLivePreset(): TimePreset {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 10) return TIME_PRESETS.morning;
  if (hour >= 10 && hour < 16) return TIME_PRESETS.noon;
  if (hour >= 16 && hour < 20) return TIME_PRESETS.evening;
  return TIME_PRESETS.night;
}

function resolvePreset(timeOfDay: TimeOfDay): TimePreset {
  if (timeOfDay === "live") return resolveLivePreset();
  return TIME_PRESETS[timeOfDay];
}

/**
 * Apply sky/fog/light/building shade via MapLibre v5 setSky API.
 * @see https://maplibre.org/maplibre-gl-js/docs/examples/sky-fog-terrain/
 */
export function applyAtmosphere(map: MapLibreMap, options: AtmosphereOptions): void {
  if (!map.isStyleLoaded()) return;

  const preset = resolvePreset(options.timeOfDay);

  if (!options.showSky) {
    try {
      (map.setSky as (sky?: SkySpecification) => void)(undefined);
    } catch {
      /* ignore */
    }
  } else {
    const weatherFog =
      options.weather === "rain" ? 0.28 : options.weather === "snow" ? 0.32 : preset.fogGroundBlend;
    const sky: SkySpecification = {
      "sky-color": preset.skyColor,
      "sky-horizon-blend": preset.skyHorizonBlend,
      "horizon-color": preset.horizonColor,
      "horizon-fog-blend":
        options.weather === "sun" ? preset.horizonFogBlend : Math.min(preset.horizonFogBlend + 0.2, 1),
      "fog-color":
        options.weather === "rain"
          ? "#94a3b8"
          : options.weather === "snow"
            ? "#e2e8f0"
            : preset.fogColor,
      "fog-ground-blend": weatherFog,
    };
    try {
      map.setSky(sky);
    } catch (error) {
      console.warn("[omt-glb-poc] setSky failed", error);
    }
  }

  try {
    map.setLight({
      anchor: preset.lightAnchor,
      color: preset.lightColor,
      intensity: preset.lightIntensity,
      position: preset.lightPosition,
    });
  } catch {
    /* light unsupported */
  }

  polishBuildingPaint(map, {
    color: preset.buildingColor,
    opacity: preset.buildingOpacity,
    visible: options.showBuildings,
  });

  setLabelVisibility(map, options.showLabels);
  map.triggerRepaint();
}

function polishBuildingPaint(
  map: MapLibreMap,
  opts: { color: string; opacity: number; visible: boolean },
): void {
  for (const layer of listAllBuildingExtrusionLayers(map)) {
    if (!map.getLayer(layer.layerId)) continue;
    try {
      map.setLayoutProperty(layer.layerId, "visibility", opts.visible ? "visible" : "none");
      map.setPaintProperty(layer.layerId, "fill-extrusion-color", buildingColorByHeight(opts.color));
      map.setPaintProperty(layer.layerId, "fill-extrusion-opacity", opts.opacity);
      map.setPaintProperty(layer.layerId, "fill-extrusion-vertical-gradient", true);
    } catch {
      /* ignore */
    }
    try {
      map.setPaintProperty(layer.layerId, "fill-extrusion-ambient-occlusion-intensity", 0.4);
      map.setPaintProperty(layer.layerId, "fill-extrusion-ambient-occlusion-radius", 5);
    } catch {
      /* AO may be unsupported */
    }
  }
}

function setLabelVisibility(map: MapLibreMap, visible: boolean): void {
  const style = map.getStyle();
  if (!style?.layers) return;
  for (const layer of style.layers) {
    if (layer.type !== "symbol") continue;
    const id = layer.id.toLowerCase();
    // Keep POIs hidden for a cleaner look even when labels on
    if (id.includes("poi") || id.includes("housenumber")) {
      try {
        map.setLayoutProperty(layer.id, "visibility", "none");
      } catch {
        /* ignore */
      }
      continue;
    }
    try {
      map.setLayoutProperty(layer.id, "visibility", visible ? "visible" : "none");
    } catch {
      /* ignore */
    }
  }
}
