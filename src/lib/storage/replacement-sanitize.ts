import type { CustomBuildingModel } from "@/types/building";
import {
  sanitizeReplacementModelUrl,
  withSynthesizedFootprint,
} from "@/lib/storage/custom-buildings-storage";

export function sanitizeLoadedReplacements(
  replacements: CustomBuildingModel[],
): { replacements: CustomBuildingModel[]; staleBlobCount: number } {
  let staleBlobCount = 0;
  const next = replacements.map((item) => {
    const sanitized = sanitizeReplacementModelUrl(item.modelUrl);
    if (sanitized.wasStaleBlob) staleBlobCount += 1;
    return withSynthesizedFootprint({ ...item, modelUrl: sanitized.modelUrl });
  });
  return { replacements: next, staleBlobCount };
}

export function staleBlobWarning(count: number): string | null {
  if (count <= 0) return null;
  return `${count} replacement(s) used a stale blob: URL and were reset to the sample model. Re-upload those GLBs.`;
}

export function modelLabelFromUrl(resolvedUrl: string, modelLabel?: string): string {
  const trimmed = modelLabel?.trim();
  if (trimmed) return trimmed;
  if (resolvedUrl.startsWith("data:") || resolvedUrl.startsWith("/api/models/")) {
    return "Uploaded GLB";
  }
  if (resolvedUrl.includes("sample-building")) return "Sample building";
  if (resolvedUrl.includes("office-building")) return "Office building";
  return "Custom GLB";
}
