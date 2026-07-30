import { NextResponse } from "next/server";
import { isValidModelUploadId, readModelUpload } from "@/lib/storage/model-uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { id } = await context.params;
  if (!isValidModelUploadId(id)) {
    return NextResponse.json({ error: "Invalid model id." }, { status: 400 });
  }

  const bytes = await readModelUpload(id);
  if (!bytes) {
    return NextResponse.json({ error: "Model not found." }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": "model/gltf-binary",
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": String(bytes.byteLength),
    },
  });
}
