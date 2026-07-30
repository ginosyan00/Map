import type { CustomBuildingModel, SelectedBuilding } from "@/types/building";
import {
  DEFAULT_MODEL_ALTITUDE,
  DEFAULT_MODEL_MIN_ZOOM,
  DEFAULT_MODEL_ROTATION_X_DEG,
  DEFAULT_MODEL_ROTATION_Y_DEG,
  DEFAULT_MODEL_ROTATION_Z_DEG,
  DEFAULT_MODEL_SCALE,
} from "@/lib/map/constants";
import { identityKey } from "@/lib/map/building-identification";
import { modelLabelFromUrl } from "@/lib/storage/replacement-sanitize";
import { resolveDurableModelUrl } from "@/lib/three/load-glb-model";

function createId(): string {
  return `custom-building-${crypto.randomUUID()}`;
}

export function buildReplacementModel(
  building: SelectedBuilding,
  modelUrl: string,
  existing: CustomBuildingModel | undefined,
  altitude = DEFAULT_MODEL_ALTITUDE,
  modelLabel?: string,
): CustomBuildingModel {
  const trimmed = modelUrl.trim();
  if (!trimmed) throw new Error("Model URL is empty.");
  if (trimmed.startsWith("blob:")) {
    throw new Error(
      "Uploaded model is not durable yet. Wait for upload to finish, or use a hosted URL.",
    );
  }

  const resolvedUrl = resolveDurableModelUrl(trimmed);
  if (resolvedUrl.startsWith("blob:")) {
    throw new Error(
      "Blob URLs cannot be saved. Upload the GLB so it is stored on the server.",
    );
  }

  const now = new Date().toISOString();
  return {
    id: existing?.id ?? createId(),
    buildingIdentity: building.identity,
    modelUrl: resolvedUrl,
    modelLabel: modelLabelFromUrl(resolvedUrl, modelLabel),
    longitude: building.centerLng,
    latitude: building.centerLat,
    altitude,
    rotationX: existing?.rotationX ?? DEFAULT_MODEL_ROTATION_X_DEG,
    rotationY: existing?.rotationY ?? DEFAULT_MODEL_ROTATION_Y_DEG,
    rotationZ: existing?.rotationZ ?? DEFAULT_MODEL_ROTATION_Z_DEG,
    scale: existing?.scale ?? DEFAULT_MODEL_SCALE,
    minZoom: existing?.minZoom ?? DEFAULT_MODEL_MIN_ZOOM,
    visible: true,
    footprintGeometry: building.geometry,
    sourceGeometry: building.sourceGeometry,
    preservedSiblings: building.preservedSiblings,
    vectorFeatureId: building.featureId ?? existing?.vectorFeatureId,
    vectorSourceLayer: building.sourceLayer,
    filterPropertyKey: building.filterPropertyKey,
    filterPropertyValue: building.filterPropertyValue,
    buildingHeight: building.height ?? 15,
    buildingMinHeight: building.minHeight ?? 0,
    hideWarning: !building.canFilterHide,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function findByIdentity(
  replacements: CustomBuildingModel[],
  building: SelectedBuilding,
): CustomBuildingModel | undefined {
  return replacements.find(
    (r) => identityKey(r.buildingIdentity) === identityKey(building.identity),
  );
}

export function replacementsEqual(
  a: CustomBuildingModel[],
  b: CustomBuildingModel[],
): boolean {
  if (a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
