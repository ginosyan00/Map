import type {
  ConfigExport,
  CustomBuildingModel,
  CustomBuildingStore,
} from "@/types/building";
import { STORAGE_KEY } from "@/lib/map/constants";

const EMPTY_STORE: CustomBuildingStore = {
  version: 1,
  selectedBuildingId: null,
  replacements: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isIdentity(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.type === "string" &&
    typeof value.value === "string" &&
    typeof value.source === "string"
  );
}

export function isCustomBuildingModel(value: unknown): value is CustomBuildingModel {
  if (!isRecord(value)) return false;
  const baseOk =
    typeof value.id === "string" &&
    isIdentity(value.buildingIdentity) &&
    typeof value.modelUrl === "string" &&
    typeof value.longitude === "number" &&
    typeof value.latitude === "number" &&
    typeof value.altitude === "number" &&
    typeof value.rotationX === "number" &&
    typeof value.rotationY === "number" &&
    typeof value.rotationZ === "number" &&
    typeof value.scale === "number" &&
    typeof value.minZoom === "number" &&
    typeof value.visible === "boolean";
  if (!baseOk) return false;

  // Older saved records may lack footprintGeometry — synthesize a tiny square.
  if (!isRecord(value.footprintGeometry)) {
    const lng = value.longitude as number;
    const lat = value.latitude as number;
    const d = 0.00005;
    (value as CustomBuildingModel).footprintGeometry = {
      type: "Polygon",
      coordinates: [
        [
          [lng - d, lat - d],
          [lng + d, lat - d],
          [lng + d, lat + d],
          [lng - d, lat + d],
          [lng - d, lat - d],
        ],
      ],
    };
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
    replacements.push(item);
  }
  return {
    version: 1,
    replacements,
    exportedAt:
      typeof value.exportedAt === "string" ? value.exportedAt : new Date().toISOString(),
  };
}

export function loadStoreFromLocalStorage(): CustomBuildingStore {
  if (typeof window === "undefined") return { ...EMPTY_STORE };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY_STORE };
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.replacements)) {
      throw new Error("Invalid store shape");
    }
    const replacements = parsed.replacements.filter(isCustomBuildingModel).map((item) => {
      let modelUrl = item.modelUrl;
      // Stale blob: URLs die after refresh — drop them. Live uploads use data: now.
      if (
        typeof modelUrl !== "string" ||
        modelUrl.startsWith("blob:") ||
        modelUrl.startsWith("procedural://")
      ) {
        modelUrl = "/models/sample-building.glb";
      }
      return { ...item, modelUrl };
    });
    return {
      version: 1,
      selectedBuildingId:
        typeof parsed.selectedBuildingId === "string" || parsed.selectedBuildingId === null
          ? (parsed.selectedBuildingId as string | null)
          : null,
      replacements,
    };
  } catch {
    return { ...EMPTY_STORE };
  }
}

export function saveStoreToLocalStorage(store: CustomBuildingStore): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
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
