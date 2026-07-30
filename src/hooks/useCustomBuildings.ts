"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useReplacementPersist } from "@/hooks/useReplacementPersist";
import {
  downloadJson,
  exportConfig,
  loadAndSanitizeStoreFromLocalStorage,
  markMigratedLocalToDb,
  saveStoreToLocalStorage,
  validateConfigExport,
} from "@/lib/storage/custom-buildings-storage";
import {
  modelLabelFromUrl,
  sanitizeLoadedReplacements,
  staleBlobWarning,
} from "@/lib/storage/replacement-sanitize";
import {
  fetchReplacementsFromApi,
  saveReplacementsToApi,
} from "@/lib/storage/replacements-api";
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
  const { schedulePersist, skipNextPersistRef } = useReplacementPersist(setStorageError);
  const storeRef = useRef(store);
  storeRef.current = store;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const fromDb = await fetchReplacementsFromApi();
        if (cancelled) return;

        if (fromDb.length > 0) {
          const { replacements, staleBlobCount } = sanitizeLoadedReplacements(fromDb);
          setStore({ version: 1, selectedBuildingId: null, replacements });
          markMigratedLocalToDb();
          setStorageError(staleBlobWarning(staleBlobCount));
        } else {
          const localResult = loadAndSanitizeStoreFromLocalStorage();
          if (localResult.store.replacements.length > 0) {
            // Remigrate whenever DB is empty but local still has data
            // (covers wiped DB + stale migratedOnce flag).
            const saved = await saveReplacementsToApi(localResult.store.replacements);
            if (cancelled) return;
            markMigratedLocalToDb();
            const { replacements, staleBlobCount } = sanitizeLoadedReplacements(saved);
            setStore({ version: 1, selectedBuildingId: null, replacements });
            setStorageError(staleBlobWarning(staleBlobCount));
          } else {
            setStorageError(staleBlobWarning(localResult.staleBlobCount));
          }
        }
      } catch (error) {
        if (cancelled) return;
        try {
          const localResult = loadAndSanitizeStoreFromLocalStorage();
          setStore(localResult.store);
          const base =
            error instanceof Error
              ? error.message
              : "Database unavailable; using local cache.";
          const stale = staleBlobWarning(localResult.staleBlobCount);
          setStorageError(stale ? `${base} Also reset stale blob: model URL(s).` : base);
        } catch {
          setStorageError(
            error instanceof Error
              ? error.message
              : "Database unavailable; using local cache.",
          );
        }
      } finally {
        if (!cancelled) {
          skipNextPersistRef.current = true;
          setHydrated(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [skipNextPersistRef]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      saveStoreToLocalStorage(store);
    } catch {
      /* ignore quota */
    }
  }, [store, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    schedulePersist(store.replacements);
  }, [store.replacements, hydrated, schedulePersist, skipNextPersistRef]);

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
      const trimmed = modelUrl.trim();
      if (!trimmed) throw new Error("Model URL is empty.");
      if (trimmed.startsWith("blob:")) {
        throw new Error(
          "Uploaded model is not durable yet. Wait for upload to finish, or use a hosted URL.",
        );
      }

      const now = new Date().toISOString();
      const existing = storeRef.current.replacements.find(
        (r) => identityKey(r.buildingIdentity) === identityKey(building.identity),
      );
      const resolvedUrl = resolveDurableModelUrl(trimmed);
      if (resolvedUrl.startsWith("blob:")) {
        throw new Error(
          "Blob URLs cannot be saved. Upload the GLB so it is stored on the server.",
        );
      }

      const model: CustomBuildingModel = {
        id: existing?.id ?? createId(),
        buildingIdentity: building.identity,
        modelUrl: resolvedUrl,
        modelLabel: modelLabelFromUrl(resolvedUrl, modelLabel),
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
        sourceGeometry: building.sourceGeometry,
        preservedSiblings: building.preservedSiblings,
        vectorFeatureId: building.featureId ?? existing?.vectorFeatureId,
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
    [upsertReplacement],
  );

  const updateActiveTransform = useCallback((patch: Partial<CustomBuildingModel>) => {
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
  }, []);

  const patchReplacement = useCallback(
    (id: string, patch: Partial<CustomBuildingModel>) => {
      setStore((prev) => ({
        ...prev,
        replacements: prev.replacements.map((r) =>
          r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r,
        ),
      }));
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

  const clearAllReplacements = useCallback(() => {
    setStore((prev) => ({
      ...prev,
      selectedBuildingId: null,
      replacements: [],
    }));
  }, []);

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
    patchReplacement,
    selectReplacement,
    removeReplacement,
    clearAllReplacements,
    resetActiveTransform,
    exportJson,
    importJson,
    useSampleForBuilding,
  };
}
