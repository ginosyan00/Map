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
