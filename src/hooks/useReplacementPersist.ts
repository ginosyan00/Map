"use client";

import { useCallback, useRef } from "react";
import type { CustomBuildingModel } from "@/types/building";
import { uploadModelDataUrl } from "@/lib/storage/models-api";
import { saveReplacementsToApi } from "@/lib/storage/replacements-api";

type PersistControls = {
  persistNow: (replacements: CustomBuildingModel[]) => Promise<CustomBuildingModel[]>;
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
  const skipNextPersistRef = useRef(true);

  const persistNow = useCallback(
    async (replacements: CustomBuildingModel[]) => {
      try {
        const durable = await ensureDurableUrls(replacements);
        const saved = await saveReplacementsToApi(durable);
        onRewritten?.(saved);
        setStorageError(null);
        return saved;
      } catch (error) {
        setStorageError(
          error instanceof Error
            ? error.message
            : "Failed to persist replacements to database.",
        );
        throw error;
      }
    },
    [setStorageError, onRewritten],
  );

  return { persistNow, skipNextPersistRef };
}
