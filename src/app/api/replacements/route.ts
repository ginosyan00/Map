import { NextResponse } from "next/server";
import type { CustomBuildingModel } from "@/types/building";
import { isCustomBuildingModel } from "@/lib/storage/custom-buildings-storage";
import { listReplacements, syncReplacements } from "@/lib/db/replacements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  try {
    const body: unknown = await request.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("replacements" in body) ||
      !Array.isArray((body as { replacements: unknown }).replacements)
    ) {
      return NextResponse.json({ error: "Body must include replacements[]." }, { status: 400 });
    }

    const raw = (body as { replacements: unknown[] }).replacements;
    const replacements: CustomBuildingModel[] = [];
    for (const item of raw) {
      if (!isCustomBuildingModel(item)) {
        return NextResponse.json(
          { error: "Invalid replacement payload." },
          { status: 400 },
        );
      }
      replacements.push(item);
    }

    const saved = await syncReplacements(replacements);
    return NextResponse.json({ replacements: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save replacements.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
