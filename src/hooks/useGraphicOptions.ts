"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TimeOfDay, WeatherMode } from "@/lib/map/atmosphere";

export type GraphicOptions = {
  groundElevations: boolean;
  terrainExaggeration: number;
  weather: WeatherMode;
  timeOfDay: TimeOfDay;
  showLabels: boolean;
  showBuildings: boolean;
  showSky: boolean;
  idleOrbit: boolean;
  showVehicles: boolean;
  showVegetation: boolean;
};

const STORAGE_KEY = "omt-glb-poc:graphic-options:v1";

const DEFAULT_OPTIONS: GraphicOptions = {
  groundElevations: true,
  terrainExaggeration: 1,
  weather: "sun",
  timeOfDay: "noon",
  showLabels: true,
  showBuildings: true,
  showSky: true,
  idleOrbit: false,
  showVehicles: false,
  showVegetation: true,
};

function isTimeOfDay(value: unknown): value is TimeOfDay {
  return (
    value === "live" ||
    value === "night" ||
    value === "morning" ||
    value === "noon" ||
    value === "evening"
  );
}

function isWeatherMode(value: unknown): value is WeatherMode {
  return value === "sun" || value === "rain" || value === "snow";
}

function loadOptions(): GraphicOptions {
  if (typeof window === "undefined") return DEFAULT_OPTIONS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_OPTIONS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_OPTIONS;
    const o = parsed as Record<string, unknown>;
    return {
      groundElevations:
        typeof o.groundElevations === "boolean"
          ? o.groundElevations
          : DEFAULT_OPTIONS.groundElevations,
      terrainExaggeration:
        typeof o.terrainExaggeration === "number" && Number.isFinite(o.terrainExaggeration)
          ? o.terrainExaggeration
          : DEFAULT_OPTIONS.terrainExaggeration,
      weather: isWeatherMode(o.weather) ? o.weather : DEFAULT_OPTIONS.weather,
      timeOfDay: isTimeOfDay(o.timeOfDay) ? o.timeOfDay : DEFAULT_OPTIONS.timeOfDay,
      showLabels: typeof o.showLabels === "boolean" ? o.showLabels : DEFAULT_OPTIONS.showLabels,
      showBuildings:
        typeof o.showBuildings === "boolean" ? o.showBuildings : DEFAULT_OPTIONS.showBuildings,
      showSky: typeof o.showSky === "boolean" ? o.showSky : DEFAULT_OPTIONS.showSky,
      idleOrbit: typeof o.idleOrbit === "boolean" ? o.idleOrbit : DEFAULT_OPTIONS.idleOrbit,
      showVehicles:
        typeof o.showVehicles === "boolean" ? o.showVehicles : DEFAULT_OPTIONS.showVehicles,
      showVegetation:
        typeof o.showVegetation === "boolean" ? o.showVegetation : DEFAULT_OPTIONS.showVegetation,
    };
  } catch {
    return DEFAULT_OPTIONS;
  }
}

export function useGraphicOptions() {
  const [options, setOptions] = useState<GraphicOptions>(DEFAULT_OPTIONS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setOptions(loadOptions());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(options));
    } catch {
      /* ignore quota */
    }
  }, [options, hydrated]);

  const patch = useCallback((partial: Partial<GraphicOptions>) => {
    setOptions((prev) => ({ ...prev, ...partial }));
  }, []);

  const atmosphereInput = useMemo(
    () => ({
      timeOfDay: options.timeOfDay,
      weather: options.weather,
      showSky: options.showSky,
      showBuildings: options.showBuildings,
      showLabels: options.showLabels,
    }),
    [
      options.timeOfDay,
      options.weather,
      options.showSky,
      options.showBuildings,
      options.showLabels,
    ],
  );

  return {
    options,
    patch,
    atmosphereInput,
    reset: () => setOptions(DEFAULT_OPTIONS),
  };
}
