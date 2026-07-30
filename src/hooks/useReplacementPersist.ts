"use client";

import { useCallback, useEffect, useRef } from "react";
import type { CustomBuildingModel } from "@/types/building";
import { uploadModelDataUrl } from "@/lib/storage/models-api";
import { saveReplacementsToApi } from "@/lib/storage/replacements-api";

const SAVE_DEBOUNCE_MS = 600;

type PersistControls = {
  schedulePersist: (replacements: CustomBuildingModel[]) => void;
  flushPendingPersist: () => void;
  skipNextPersistRef: React.MutableRefObject<boolean>;
};

async function ensureDurableUrls(
  replacements: CustomBuildingModel[],
): Promise<CustomBuildingModel[]> {
  const out: CustomBuildingModel[] = [];
  for (const item of replacements) {
    if (!item.modelUrl.startsWith("data:")) {
      out.push(item);
      continue;
    }
    const url = await uploadModelDataUrl(
      item.modelUrl,
      item.modelLabel?.endsWith(".glb") ? item.modelLabel : "uploaded.glb",
    );
    out.push({ ...item, modelUrl: url, updatedAt: new Date().toISOString() });
  }
  return out;
}

export function useReplacementPersist(
  setStorageError: (message: string | null) => void,
  onRewritten?: (replacements: CustomBuildingModel[]) => void,
): PersistControls {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveGenerationRef = useRef(0);
  const pendingReplacementsRef = useRef<CustomBuildingModel[] | null>(null);
  const skipNextPersistRef = useRef(true);

  const persistNow = useCallback(
    async (replacements: CustomBuildingModel[]) => {
      const generation = ++saveGenerationRef.current;
      pendingReplacementsRef.current = null;
      try {
        const durable = await ensureDurableUrls(replacements);
        if (generation !== saveGenerationRef.current) return;
        if (durable.some((item, i) => item.modelUrl !== replacements[i]?.modelUrl)) {
          skipNextPersistRef.current = true;
          onRewritten?.(durable);
        }
        await saveReplacementsToApi(durable);
        if (generation !== saveGenerationRef.current) return;
        setStorageError(null);
      } catch (error) {
        if (generation !== saveGenerationRef.current) return;
        setStorageError(
          error instanceof Error
            ? error.message
            : "Failed to persist replacements to database.",
        );
      }
    },
    [setStorageError, onRewritten],
  );

  const schedulePersist = useCallback(
    (replacements: CustomBuildingModel[]) => {
      pendingReplacementsRef.current = replacements;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        const pending = pendingReplacementsRef.current;
        if (!pending) return;
        void persistNow(pending);
      }, SAVE_DEBOUNCE_MS);
    },
    [persistNow],
  );

  const flushPendingPersist = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingReplacementsRef.current;
    if (!pending) return;
    void persistNow(pending);
  }, [persistNow]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushPendingPersist();
    };
    const onPageHide = () => flushPendingPersist();
    window.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onPageHide);
    return () => {
      window.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onPageHide);
      flushPendingPersist();
    };
  }, [flushPendingPersist]);

  return { schedulePersist, flushPendingPersist, skipNextPersistRef };
}
