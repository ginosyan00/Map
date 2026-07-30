import type { CustomBuildingModel } from "@/types/building";
import { isCustomBuildingModel } from "@/lib/storage/custom-buildings-storage";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";

function rowToModel(payload: Prisma.JsonValue): CustomBuildingModel | null {
  if (!isCustomBuildingModel(payload)) return null;
  return payload;
}

export async function listReplacements(): Promise<CustomBuildingModel[]> {
  const rows = await prisma.buildingReplacement.findMany({
    orderBy: { updatedAt: "desc" },
  });
  const models: CustomBuildingModel[] = [];
  for (const row of rows) {
    const model = rowToModel(row.payload);
    if (model) models.push(model);
  }
  return models;
}

export async function syncReplacements(
  replacements: CustomBuildingModel[],
): Promise<CustomBuildingModel[]> {
  const ids = replacements.map((r) => r.id);

  await prisma.$transaction(async (tx) => {
    if (ids.length === 0) {
      await tx.buildingReplacement.deleteMany();
      return;
    }

    await tx.buildingReplacement.deleteMany({
      where: { id: { notIn: ids } },
    });

    for (const model of replacements) {
      await tx.buildingReplacement.upsert({
        where: { id: model.id },
        create: {
          id: model.id,
          payload: model as unknown as Prisma.InputJsonValue,
        },
        update: {
          payload: model as unknown as Prisma.InputJsonValue,
        },
      });
    }
  });

  return listReplacements();
}

export async function deleteReplacement(id: string): Promise<void> {
  await prisma.buildingReplacement.deleteMany({ where: { id } });
}
