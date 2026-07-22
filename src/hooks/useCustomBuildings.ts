"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ConfigExport,
  CustomBuildingModel,
  CustomBuildingStore,
  SelectedBuilding,
} from "@/types/building";
import {
  DEFAULT_MODEL_ALTITUDE,
  DEFAULT_MODEL_MIN_ZOOM,
  DEFAULT_MODEL_ROTATION_X_DEG,
  DEFAULT_MODEL_ROTATION_Y_DEG,
  DEFAULT_MODEL_ROTATION_Z_DEG,
  DEFAULT_MODEL_SCALE,
  DEFAULT_APPLY_MODEL_URL,
} from "@/lib/map/constants";
import { identityKey } from "@/lib/map/building-identification";
import {
  downloadJson,
  exportConfig,
  loadStoreFromLocalStorage,
  saveStoreToLocalStorage,
  validateConfigExport,
} from "@/lib/storage/custom-buildings-storage";
import { resolveDurableModelUrl } from "@/lib/three/load-glb-model";

function createId(): string {
  return `custom-building-${crypto.randomUUID()}`;
}

export function useCustomBuildings() {
  const [store, setStore] = useState<CustomBuildingStore>({
    version: 1,
    selectedBuildingId: null,
    replacements: [],
  });
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    try {
      setStore(loadStoreFromLocalStorage());
    } catch {
      setStorageError("localStorage data was invalid and was reset.");
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      saveStoreToLocalStorage(store);
      setStorageError(null);
    } catch {
      setStorageError("Failed to persist replacements to localStorage.");
    }
  }, [store, hydrated]);

  const activeReplacement = useMemo(() => {
    if (!store.selectedBuildingId) return null;
    return store.replacements.find((r) => r.id === store.selectedBuildingId) ?? null;
  }, [store]);

  const upsertReplacement = useCallback((model: CustomBuildingModel) => {
    setStore((prev) => {
      const index = prev.replacements.findIndex((r) => r.id === model.id);
      const replacements =
        index >= 0
          ? prev.replacements.map((r, i) => (i === index ? model : r))
          : [...prev.replacements, model];
      return { ...prev, replacements, selectedBuildingId: model.id };
    });
  }, []);

  const applyReplacement = useCallback(
    (
      building: SelectedBuilding,
      modelUrl: string,
      altitude = DEFAULT_MODEL_ALTITUDE,
      modelLabel?: string,
    ) => {
      const now = new Date().toISOString();
      const existing = store.replacements.find(
        (r) => identityKey(r.buildingIdentity) === identityKey(building.identity),
      );

      const resolvedUrl = resolveDurableModelUrl(modelUrl);
      const label =
        modelLabel?.trim() ||
        (resolvedUrl.startsWith("blob:") || resolvedUrl.startsWith("data:")
          ? "Uploaded GLB"
          : resolvedUrl.includes("sample-building")
            ? "Sample building"
            : resolvedUrl.includes("office-building")
              ? "Office building"
              : "Custom GLB");

      const model: CustomBuildingModel = {
        id: existing?.id ?? createId(),
        buildingIdentity: building.identity,
        modelUrl: resolvedUrl,
        modelLabel: label,
        longitude: building.centerLng,
        latitude: building.centerLat,
        altitude,
        rotationX: existing?.rotationX ?? DEFAULT_MODEL_ROTATION_X_DEG,
        rotationY: existing?.rotationY ?? DEFAULT_MODEL_ROTATION_Y_DEG,
        rotationZ: existing?.rotationZ ?? DEFAULT_MODEL_ROTATION_Z_DEG,
        scale: existing?.scale ?? DEFAULT_MODEL_SCALE,
        minZoom: existing?.minZoom ?? DEFAULT_MODEL_MIN_ZOOM,
        visible: true,
        footprintGeometry: building.geometry,
        vectorFeatureId: building.featureId,
        vectorSourceLayer: building.sourceLayer,
        filterPropertyKey: building.filterPropertyKey,
        filterPropertyValue: building.filterPropertyValue,
        buildingHeight: building.height ?? 15,
        buildingMinHeight: building.minHeight ?? 0,
        hideWarning: !building.canFilterHide,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      upsertReplacement(model);
      return model;
    },
    [store.replacements, upsertReplacement],
  );

  const updateActiveTransform = useCallback(
    (patch: Partial<CustomBuildingModel>) => {
      setStore((prev) => {
        if (!prev.selectedBuildingId) return prev;
        return {
          ...prev,
          replacements: prev.replacements.map((r) =>
            r.id === prev.selectedBuildingId
              ? { ...r, ...patch, updatedAt: new Date().toISOString() }
              : r,
          ),
        };
      });
    },
    [],
  );

  const selectReplacement = useCallback((id: string | null) => {
    setStore((prev) => ({ ...prev, selectedBuildingId: id }));
  }, []);

  const removeReplacement = useCallback((id: string) => {
    setStore((prev) => ({
      ...prev,
      selectedBuildingId: prev.selectedBuildingId === id ? null : prev.selectedBuildingId,
      replacements: prev.replacements.filter((r) => r.id !== id),
    }));
  }, []);

  const restoreOriginal = useCallback((id: string) => {
    removeReplacement(id);
  }, [removeReplacement]);

  const resetActiveTransform = useCallback(() => {
    updateActiveTransform({
      altitude: DEFAULT_MODEL_ALTITUDE,
      rotationX: DEFAULT_MODEL_ROTATION_X_DEG,
      rotationY: DEFAULT_MODEL_ROTATION_Y_DEG,
      rotationZ: DEFAULT_MODEL_ROTATION_Z_DEG,
      scale: DEFAULT_MODEL_SCALE,
      minZoom: DEFAULT_MODEL_MIN_ZOOM,
      visible: true,
    });
  }, [updateActiveTransform]);

  const exportJson = useCallback(() => {
    downloadJson("building-replacements.json", exportConfig(store.replacements));
  }, [store.replacements]);

  const importJson = useCallback((data: unknown) => {
    const parsed: ConfigExport = validateConfigExport(data);
    setStore((prev) => ({
      ...prev,
      replacements: parsed.replacements,
      selectedBuildingId: parsed.replacements[0]?.id ?? null,
    }));
  }, []);

  const useSampleForBuilding = useCallback(
    (building: SelectedBuilding, altitude?: number) =>
      applyReplacement(building, DEFAULT_APPLY_MODEL_URL, altitude),
    [applyReplacement],
  );

  return {
    store,
    hydrated,
    storageError,
    activeReplacement,
    upsertReplacement,
    applyReplacement,
    updateActiveTransform,
    selectReplacement,
    removeReplacement,
    restoreOriginal,
    resetActiveTransform,
    exportJson,
    importJson,
    useSampleForBuilding,
  };
}
