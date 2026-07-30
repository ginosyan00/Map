import { NextResponse } from "next/server";
import { getWriteSecret } from "@/lib/api/write-auth";
import { prisma } from "@/lib/db/prisma";
import { ensureUploadDir } from "@/lib/storage/model-uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ops / integration readiness probe.
 * GET /api/health
 */
export async function GET(): Promise<Response> {
  const checks: Record<string, "ok" | "error" | "warn"> = {
    database: "ok",
    uploads: "ok",
    writeAuth: getWriteSecret() ? "ok" : "warn",
  };
  const details: Record<string, string> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    checks.database = "error";
    details.database = error instanceof Error ? error.message : "Database check failed.";
  }

  try {
    await ensureUploadDir();
  } catch (error) {
    checks.uploads = "error";
    details.uploads = error instanceof Error ? error.message : "Uploads dir unavailable.";
  }

  if (checks.writeAuth === "warn") {
    details.writeAuth = "REPLACEMENTS_WRITE_SECRET is unset — writes are open.";
  }

  const ok = checks.database === "ok" && checks.uploads === "ok";
  return NextResponse.json(
    {
      ok,
      service: "manvel-map",
      checks,
      details,
      endpoints: {
        replacements: "/api/replacements",
        models: "/api/models",
        modelById: "/api/models/:id",
        roads: "/api/roads",
        health: "/api/health",
      },
    },
    { status: ok ? 200 : 503 },
  );
}
