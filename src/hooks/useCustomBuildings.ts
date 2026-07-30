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
  sanitizeLoadedReplacements,
  staleBlobWarning,
} from "@/lib/storage/replacement-sanitize";
import {
  buildReplacementModel,
  findByIdentity,
  replacementsEqual,
} from "@/lib/storage/replacement-model";
import {
  fetchReplacementsFromApi,
  saveReplacementsToApi,
} from "@/lib/storage/replacements-api";

export function useCustomBuildings() {
  const [committed, setCommitted] = useState<CustomBuildingModel[]>([]);
  const [draft, setDraft] = useState<CustomBuildingModel[]>([]);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const onRewritten = useCallback((replacements: CustomBuildingModel[]) => {
    setCommitted(replacements);
    setDraft(replacements);
    setPendingDeleteIds([]);
  }, []);

  const { persistNow, skipNextPersistRef } = useReplacementPersist(
    setStorageError,
    onRewritten,
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const fromDb = await fetchReplacementsFromApi();
        if (cancelled) return;
        if (fromDb.length > 0) {
          const { replacements, staleBlobCount } = sanitizeLoadedReplacements(fromDb);
          setCommitted(replacements);
          setDraft(replacements);
          markMigratedLocalToDb();
          setStorageError(staleBlobWarning(staleBlobCount));
        } else {
          const localResult = loadAndSanitizeStoreFromLocalStorage();
          if (localResult.store.replacements.length > 0) {
            const saved = await saveReplacementsToApi(localResult.store.replacements);
            if (cancelled) return;
            markMigratedLocalToDb();
            const { replacements, staleBlobCount } = sanitizeLoadedReplacements(saved);
            setCommitted(replacements);
            setDraft(replacements);
            setStorageError(staleBlobWarning(staleBlobCount));
          } else {
            setStorageError(staleBlobWarning(localResult.staleBlobCount));
          }
        }
      } catch (error) {
        if (cancelled) return;
        try {
          const localResult = loadAndSanitizeStoreFromLocalStorage();
          setCommitted(localResult.store.replacements);
          setDraft(localResult.store.replacements);
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

  const visibleDraft = useMemo(
    () => draft.filter((item) => !pendingDeleteIds.includes(item.id)),
    [draft, pendingDeleteIds],
  );

  const isDirty = useMemo(() => {
    if (pendingDeleteIds.length > 0) return true;
    return !replacementsEqual(draft, committed);
  }, [draft, committed, pendingDeleteIds]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      saveStoreToLocalStorage({
        version: 1,
        selectedBuildingId,
        replacements: committed,
      });
    } catch {
      /* ignore */
    }
  }, [committed, selectedBuildingId, hydrated]);

  const activeReplacement = useMemo(() => {
    if (!selectedBuildingId || pendingDeleteIds.includes(selectedBuildingId)) return null;
    return draft.find((r) => r.id === selectedBuildingId) ?? null;
  }, [draft, selectedBuildingId, pendingDeleteIds]);

  const upsertReplacement = useCallback((model: CustomBuildingModel) => {
    setDraft((prev) => {
      const index = prev.findIndex((r) => r.id === model.id);
      return index >= 0
        ? prev.map((r, i) => (i === index ? model : r))
        : [...prev, model];
    });
    setPendingDeleteIds((ids) => ids.filter((id) => id !== model.id));
    setSelectedBuildingId(model.id);
  }, []);

  const applyReplacement = useCallback(
    (
      building: SelectedBuilding,
      modelUrl: string,
      altitude = DEFAULT_MODEL_ALTITUDE,
      modelLabel?: string,
    ) => {
      const existing =
        findByIdentity(draftRef.current, building) ?? findByIdentity(committed, building);
      const model = buildReplacementModel(
        building,
        modelUrl,
        existing,
        altitude,
        modelLabel,
      );
      upsertReplacement(model);
      return model;
    },
    [committed, upsertReplacement],
  );

  const updateActiveTransform = useCallback((patch: Partial<CustomBuildingModel>) => {
    setDraft((prev) => {
      if (!selectedBuildingId) return prev;
      return prev.map((r) =>
        r.id === selectedBuildingId
          ? { ...r, ...patch, updatedAt: new Date().toISOString() }
          : r,
      );
    });
  }, [selectedBuildingId]);

  const patchReplacement = useCallback((id: string, patch: Partial<CustomBuildingModel>) => {
    setDraft((prev) =>
      prev.map((r) =>
        r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r,
      ),
    );
  }, []);

  const selectReplacement = useCallback((id: string | null) => {
    setSelectedBuildingId(id);
  }, []);

  const markDeleteReplacement = useCallback((id: string) => {
    setPendingDeleteIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    setSelectedBuildingId((current) => (current === id ? null : current));
  }, []);

  const unmarkDeleteReplacement = useCallback((id: string) => {
    setPendingDeleteIds((ids) => ids.filter((x) => x !== id));
  }, []);

  const clearAllReplacements = useCallback(() => {
    setDraft(committed);
    setPendingDeleteIds(committed.map((r) => r.id));
    setSelectedBuildingId(null);
  }, [committed]);

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

  const saveDraft = useCallback(async () => {
    const next = draft.filter((item) => !pendingDeleteIds.includes(item.id));
    setSaving(true);
    try {
      const saved = await persistNow(next);
      setCommitted(saved);
      setDraft(saved);
      setPendingDeleteIds([]);
      setStorageError(null);
    } finally {
      setSaving(false);
    }
  }, [draft, pendingDeleteIds, persistNow]);

  const discardDraft = useCallback(() => {
    setDraft(committed);
    setPendingDeleteIds([]);
    setSelectedBuildingId((id) =>
      id && committed.some((r) => r.id === id) ? id : null,
    );
  }, [committed]);

  const exportJson = useCallback(() => {
    downloadJson("building-replacements.json", exportConfig(visibleDraft));
  }, [visibleDraft]);

  const importJson = useCallback((data: unknown) => {
    const parsed: ConfigExport = validateConfigExport(data);
    setDraft(parsed.replacements);
    setPendingDeleteIds([]);
    setSelectedBuildingId(parsed.replacements[0]?.id ?? null);
  }, []);

  const store: CustomBuildingStore = useMemo(
    () => ({
      version: 1,
      selectedBuildingId,
      replacements: visibleDraft,
    }),
    [selectedBuildingId, visibleDraft],
  );

  return {
    store,
    draftReplacements: draft,
    hydrated,
    storageError,
    saving,
    isDirty,
    pendingDeleteIds,
    activeReplacement,
    upsertReplacement,
    applyReplacement,
    updateActiveTransform,
    patchReplacement,
    selectReplacement,
    markDeleteReplacement,
    unmarkDeleteReplacement,
    removeReplacement: markDeleteReplacement,
    clearAllReplacements,
    resetActiveTransform,
    saveDraft,
    discardDraft,
    exportJson,
    importJson,
    useSampleForBuilding: (building: SelectedBuilding, altitude?: number) =>
      applyReplacement(building, DEFAULT_APPLY_MODEL_URL, altitude),
  };
}
