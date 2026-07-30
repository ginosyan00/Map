"use client";

import { useCallback, useEffect, useRef } from "react";
import type { CustomBuildingModel } from "@/types/building";
import { saveReplacementsToApi } from "@/lib/storage/replacements-api";

const SAVE_DEBOUNCE_MS = 600;

type PersistControls = {
  schedulePersist: (replacements: CustomBuildingModel[]) => void;
  flushPendingPersist: () => void;
  skipNextPersistRef: React.MutableRefObject<boolean>;
};

export function useReplacementPersist(
  setStorageError: (message: string | null) => void,
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
        await saveReplacementsToApi(replacements);
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
    [setStorageError],
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
