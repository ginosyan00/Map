import { NextResponse } from "next/server";
import type { CustomBuildingModel } from "@/types/building";
import { assertWriteAuthorized } from "@/lib/api/write-auth";
import {
  isCustomBuildingModel,
  withSynthesizedFootprint,
} from "@/lib/storage/custom-buildings-storage";
import { listReplacements, syncReplacements } from "@/lib/db/replacements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_REPLACEMENTS = 200;
const MAX_MODEL_URL_LENGTH = 2_000_000;

export async function GET(): Promise<Response> {
  try {
    const replacements = await listReplacements();
    return NextResponse.json({ replacements });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load replacements.";
    return NextResponse.json({ error: message, replacements: [] }, { status: 500 });
  }
}

export async function PUT(request: Request): Promise<Response> {
  const unauthorized = assertWriteAuthorized(request);
  if (unauthorized) return unauthorized;

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    if (
      typeof body !== "object" ||
      body === null ||
      !("replacements" in body) ||
      !Array.isArray((body as { replacements: unknown }).replacements)
    ) {
      return NextResponse.json({ error: "Body must include replacements[]." }, { status: 400 });
    }

    const raw = (body as { replacements: unknown[] }).replacements;
    if (raw.length > MAX_REPLACEMENTS) {
      return NextResponse.json(
        { error: `Too many replacements (max ${MAX_REPLACEMENTS}).` },
        { status: 400 },
      );
    }

    const replacements: CustomBuildingModel[] = [];
    for (const item of raw) {
      if (!isCustomBuildingModel(item)) {
        return NextResponse.json(
          { error: "Invalid replacement payload." },
          { status: 400 },
        );
      }
      if (item.modelUrl.length > MAX_MODEL_URL_LENGTH) {
        return NextResponse.json(
          { error: "modelUrl exceeds maximum allowed length." },
          { status: 400 },
        );
      }
      if (item.modelUrl.startsWith("blob:")) {
        return NextResponse.json(
          { error: "blob: modelUrl is not allowed. Upload the model first." },
          { status: 400 },
        );
      }
      replacements.push(withSynthesizedFootprint(item));
    }

    const saved = await syncReplacements(replacements);
    return NextResponse.json({ replacements: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save replacements.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
