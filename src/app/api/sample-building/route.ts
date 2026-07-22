import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fallback GLB serving when /public static files 404 under Turbopack.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const filePath = path.join(process.cwd(), "public", "models", "sample-building.glb");
    const buffer = await readFile(filePath);
    return new NextResponse(Uint8Array.from(buffer), {
      status: 200,
      headers: {
        "Content-Type": "model/gltf-binary",
        "Cache-Control": "public, max-age=3600",
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "sample-building.glb not found on disk" },
      { status: 404 },
    );
  }
}
