"use client";

import { useCallback, useMemo, useState } from "react";
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

const DEFAULT_OPTIONS: GraphicOptions = {
  groundElevations: true,
  terrainExaggeration: 1,
  weather: "sun",
  timeOfDay: "noon",
  showLabels: true,
  showBuildings: true,
  showSky: true,
  idleOrbit: false,
  showVehicles: true,
  showVegetation: true,
};

export function useGraphicOptions() {
  const [options, setOptions] = useState<GraphicOptions>(DEFAULT_OPTIONS);

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
