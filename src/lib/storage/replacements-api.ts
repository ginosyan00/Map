import type { CustomBuildingModel } from "@/types/building";
import { isCustomBuildingModel } from "@/lib/storage/custom-buildings-storage";

type ListResponse = {
  replacements: CustomBuildingModel[];
  error?: string;
};

export async function fetchReplacementsFromApi(): Promise<CustomBuildingModel[]> {
  const response = await fetch("/api/replacements", { cache: "no-store" });
  const data = (await response.json()) as ListResponse;
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to load replacements from database.");
  }
  return Array.isArray(data.replacements)
    ? data.replacements.filter(isCustomBuildingModel)
    : [];
}

export async function saveReplacementsToApi(
  replacements: CustomBuildingModel[],
): Promise<CustomBuildingModel[]> {
  const response = await fetch("/api/replacements", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ replacements }),
  });
  const data = (await response.json()) as ListResponse;
  if (!response.ok) {
    throw new Error(data.error ?? "Failed to save replacements to database.");
  }
  return Array.isArray(data.replacements)
    ? data.replacements.filter(isCustomBuildingModel)
    : replacements;
}
