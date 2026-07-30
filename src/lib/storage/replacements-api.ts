import type { CustomBuildingModel } from "@/types/building";
import {
  isCustomBuildingModel,
  withSynthesizedFootprint,
} from "@/lib/storage/custom-buildings-storage";
import { getClientWriteHeaders } from "@/lib/storage/write-headers";

type ListResponse = {
  replacements: CustomBuildingModel[];
  error?: string;
};

function normalizeList(replacements: unknown): CustomBuildingModel[] {
  if (!Array.isArray(replacements)) return [];
  const out: CustomBuildingModel[] = [];
  for (const item of replacements) {
    if (!isCustomBuildingModel(item)) continue;
    out.push(withSynthesizedFootprint(item));
  }
  return out;
}

export async function fetchReplacementsFromApi(): Promise<CustomBuildingModel[]> {
  const response = await fetch("/api/replacements", { cache: "no-store" });
  const data = (await response.json()) as ListResponse;
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to load replacements from database.");
  }
  return normalizeList(data.replacements);
}

export async function saveReplacementsToApi(
  replacements: CustomBuildingModel[],
): Promise<CustomBuildingModel[]> {
  const response = await fetch("/api/replacements", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getClientWriteHeaders(),
    },
    body: JSON.stringify({ replacements }),
  });
  const data = (await response.json()) as ListResponse;
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to save replacements to database.");
  }
  const normalized = normalizeList(data.replacements);
  return normalized.length > 0 || replacements.length === 0 ? normalized : replacements;
}
