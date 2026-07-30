import type { CustomBuildingModel } from "@/types/building";
import { saveModelUpload } from "@/lib/storage/model-uploads";

function decodeDataUrl(dataUrl: string): Buffer {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) {
    throw new Error("Expected a data: URL.");
  }
  const meta = dataUrl.slice(5, comma);
  const payload = dataUrl.slice(comma + 1);
  if (/;base64/i.test(meta)) {
    return Buffer.from(payload, "base64");
  }
  return Buffer.from(decodeURIComponent(payload), "utf8");
}

/**
 * Persist oversized embedded GLBs to disk and rewrite modelUrl to /api/models/:id.
 * Prevents Neon PUT timeouts / 500s from multi-MB JSON payloads.
 */
export async function materializeDataUrlModels(
  replacements: CustomBuildingModel[],
): Promise<CustomBuildingModel[]> {
  const out: CustomBuildingModel[] = [];
  for (const item of replacements) {
    if (!item.modelUrl.startsWith("data:")) {
      out.push(item);
      continue;
    }
    const bytes = decodeDataUrl(item.modelUrl);
    const saved = await saveModelUpload(bytes);
    out.push({
      ...item,
      modelUrl: saved.url,
      updatedAt: new Date().toISOString(),
    });
  }
  return out;
}
