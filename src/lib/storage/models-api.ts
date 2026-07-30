import { getClientWriteHeaders } from "@/lib/storage/write-headers";

type UploadResponse = {
  id?: string;
  url?: string;
  label?: string;
  error?: string;
};

export async function uploadModelFile(file: File): Promise<{ url: string; label: string }> {
  const form = new FormData();
  form.append("file", file, file.name);

  const response = await fetch("/api/models", {
    method: "POST",
    headers: getClientWriteHeaders(),
    body: form,
  });

  const data = (await response.json()) as UploadResponse;
  if (!response.ok || typeof data.url !== "string") {
    throw new Error(data.error ?? "Failed to upload model.");
  }

  return {
    url: data.url,
    label: typeof data.label === "string" && data.label.trim() ? data.label : file.name,
  };
}

/** Convert a data: URL GLB into a durable /api/models/:id URL. */
export async function uploadModelDataUrl(
  dataUrl: string,
  label = "migrated.glb",
): Promise<string> {
  const comma = dataUrl.indexOf(",");
  if (!dataUrl.startsWith("data:") || comma < 0) {
    throw new Error("Expected a data: URL.");
  }

  const meta = dataUrl.slice(5, comma);
  const payload = dataUrl.slice(comma + 1);
  const isBase64 = /;base64/i.test(meta);
  const bytes = isBase64
    ? Uint8Array.from(atob(payload), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));

  const file = new File([bytes], label.endsWith(".glb") ? label : `${label}.glb`, {
    type: "model/gltf-binary",
  });
  const uploaded = await uploadModelFile(file);
  return uploaded.url;
}
