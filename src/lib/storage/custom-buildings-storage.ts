import type {
  BuildingGeometry,
  BuildingIdentityType,
  ConfigExport,
  CustomBuildingModel,
  CustomBuildingStore,
} from "@/types/building";
import { DEFAULT_APPLY_MODEL_URL, STORAGE_KEY } from "@/lib/map/constants";

const EMPTY_STORE: CustomBuildingStore = {
  version: 1,
  selectedBuildingId: null,
  replacements: [],
};

const IDENTITY_TYPES = new Set<BuildingIdentityType>([
  "osm-id",
  "custom-id",
  "feature-id",
  "source-feature-id",
  "geometry-hash",
]);

const MIGRATE_ONCE_KEY = "omt-glb-poc:migrated-local-to-db:v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIdentity(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.type === "string" &&
    IDENTITY_TYPES.has(value.type as BuildingIdentityType) &&
    typeof value.value === "string" &&
    value.value.length > 0 &&
    typeof value.source === "string" &&
    value.source.length > 0
  );
}

function isBuildingGeometry(value: unknown): value is BuildingGeometry {
  if (!isRecord(value)) return false;
  if (value.type !== "Polygon" && value.type !== "MultiPolygon") return false;
  return Array.isArray(value.coordinates);
}

function synthesizeFootprint(longitude: number, latitude: number): BuildingGeometry {
  const d = 0.00005;
  return {
    type: "Polygon",
    coordinates: [
      [
        [longitude - d, latitude - d],
        [longitude + d, latitude - d],
        [longitude + d, latitude + d],
        [longitude - d, latitude + d],
        [longitude - d, latitude - d],
      ],
    ],
  };
}

/** Pure helper — does not mutate input. */
export function withSynthesizedFootprint(model: CustomBuildingModel): CustomBuildingModel {
  const now = new Date().toISOString();
  const withDates: CustomBuildingModel = {
    ...model,
    createdAt: model.createdAt || now,
    updatedAt: model.updatedAt || now,
  };
  if (isBuildingGeometry(withDates.footprintGeometry)) return withDates;
  return {
    ...withDates,
    footprintGeometry: synthesizeFootprint(withDates.longitude, withDates.latitude),
  };
}

export function isCustomBuildingModel(value: unknown): value is CustomBuildingModel {
  if (!isRecord(value)) return false;
  if (typeof value.id !== "string" || value.id.length === 0) return false;
  if (!isIdentity(value.buildingIdentity)) return false;
  if (typeof value.modelUrl !== "string" || value.modelUrl.length === 0) return false;
  if (!isFiniteNumber(value.longitude)) return false;
  if (!isFiniteNumber(value.latitude)) return false;
  if (!isFiniteNumber(value.altitude)) return false;
  if (!isFiniteNumber(value.rotationX)) return false;
  if (!isFiniteNumber(value.rotationY)) return false;
  if (!isFiniteNumber(value.rotationZ)) return false;
  if (!isFiniteNumber(value.scale)) return false;
  if (!isFiniteNumber(value.minZoom)) return false;
  if (typeof value.visible !== "boolean") return false;
  if (value.createdAt !== undefined && typeof value.createdAt !== "string") return false;
  if (value.updatedAt !== undefined && typeof value.updatedAt !== "string") return false;
  if (
    value.footprintGeometry !== undefined &&
    !isBuildingGeometry(value.footprintGeometry)
  ) {
    return false;
  }
  return true;
}

export function validateConfigExport(value: unknown): ConfigExport {
  if (!isRecord(value)) {
    throw new Error("Invalid configuration: root must be an object.");
  }
  if (value.version !== 1) {
    throw new Error("Unsupported configuration version.");
  }
  if (!Array.isArray(value.replacements)) {
    throw new Error("Invalid configuration: replacements must be an array.");
  }
  const replacements: CustomBuildingModel[] = [];
  for (const item of value.replacements) {
    if (!isCustomBuildingModel(item)) {
      throw new Error("Invalid configuration: one or more replacements failed validation.");
    }
    const sanitized = sanitizeReplacementModelUrl(item.modelUrl);
    if (sanitized.wasStaleBlob) {
      throw new Error(
        "Invalid configuration: blob: model URLs are not durable. Re-upload models before exporting.",
      );
    }
    replacements.push(withSynthesizedFootprint({ ...item, modelUrl: sanitized.modelUrl }));
  }
  return {
    version: 1,
    replacements,
    exportedAt:
      typeof value.exportedAt === "string" ? value.exportedAt : new Date().toISOString(),
  };
}

export type SanitizedStoreResult = {
  store: CustomBuildingStore;
  staleBlobCount: number;
};

export function sanitizeReplacementModelUrl(modelUrl: string): {
  modelUrl: string;
  wasStaleBlob: boolean;
} {
  if (modelUrl.startsWith("blob:")) {
    return { modelUrl: DEFAULT_APPLY_MODEL_URL, wasStaleBlob: true };
  }
  if (modelUrl.startsWith("procedural://")) {
    return { modelUrl: DEFAULT_APPLY_MODEL_URL, wasStaleBlob: false };
  }
  return { modelUrl, wasStaleBlob: false };
}

export function loadStoreFromLocalStorage(): CustomBuildingStore {
  return loadAndSanitizeStoreFromLocalStorage().store;
}

export function loadAndSanitizeStoreFromLocalStorage(): SanitizedStoreResult {
  if (typeof window === "undefined") {
    return { store: { ...EMPTY_STORE }, staleBlobCount: 0 };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { store: { ...EMPTY_STORE }, staleBlobCount: 0 };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.replacements)) {
      throw new Error("Invalid store shape");
    }
    let staleBlobCount = 0;
    const replacements = parsed.replacements
      .filter(isCustomBuildingModel)
      .map((item) => {
        const sanitized = sanitizeReplacementModelUrl(item.modelUrl);
        if (sanitized.wasStaleBlob) staleBlobCount += 1;
        return withSynthesizedFootprint({ ...item, modelUrl: sanitized.modelUrl });
      });
    return {
      store: {
        version: 1,
        selectedBuildingId:
          typeof parsed.selectedBuildingId === "string" || parsed.selectedBuildingId === null
            ? (parsed.selectedBuildingId as string | null)
            : null,
        replacements,
      },
      staleBlobCount,
    };
  } catch {
    return { store: { ...EMPTY_STORE }, staleBlobCount: 0 };
  }
}

export function saveStoreToLocalStorage(store: CustomBuildingStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function hasMigratedLocalToDb(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(MIGRATE_ONCE_KEY) === "1";
}

export function markMigratedLocalToDb(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MIGRATE_ONCE_KEY, "1");
}

export function exportConfig(replacements: CustomBuildingModel[]): ConfigExport {
  return {
    version: 1,
    replacements,
    exportedAt: new Date().toISOString(),
  };
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
