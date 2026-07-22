"use client";

import { useCallback, useState } from "react";
import type { SelectedBuilding } from "@/types/building";

export function useSelectedBuilding() {
  const [selected, setSelected] = useState<SelectedBuilding | null>(null);

  const selectBuilding = useCallback((building: SelectedBuilding) => {
    setSelected(building);
  }, []);

  const clearSelection = useCallback(() => {
    setSelected(null);
  }, []);

  return {
    selected,
    selectBuilding,
    clearSelection,
    setSelected,
  };
}
