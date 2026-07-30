import { NextResponse } from "next/server";
import { assertWriteAuthorized } from "@/lib/api/write-auth";
import { MAX_GLB_BYTES } from "@/lib/map/constants";
import { saveModelUpload } from "@/lib/storage/model-uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TYPES = new Set([
  "model/gltf-binary",
  "model/gltf+json",
  "application/octet-stream",
  "",
]);

export async function POST(request: Request): Promise<Response> {
  const unauthorized = assertWriteAuthorized(request);
  if (unauthorized) return unauthorized;

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file field." }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith(".glb")) {
      return NextResponse.json({ error: "Only .glb files are allowed." }, { status: 400 });
    }

    if (file.size <= 0 || file.size > MAX_GLB_BYTES) {
      return NextResponse.json(
        {
          error: `File size must be between 1 byte and ${MAX_GLB_BYTES} bytes.`,
        },
        { status: 400 },
      );
    }

    const type = file.type.trim();
    if (!ALLOWED_TYPES.has(type)) {
      return NextResponse.json({ error: "Unsupported content type." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = await saveModelUpload(buffer);
    return NextResponse.json({
      id: saved.id,
      url: saved.url,
      label: file.name,
      bytes: buffer.byteLength,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to upload model.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
