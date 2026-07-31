export type BuildingIdentityType =
  | "osm-id"
  | "custom-id"
  | "feature-id"
  | "source-feature-id"
  | "geometry-hash";

/**
 * Stable identity for a building footprint.
 * Prefer osm-id / custom-id. Feature IDs can change across zoom / tileset rebuilds.
 */
export type BuildingIdentity = {
  type: BuildingIdentityType;
  value: string;
  source: string;
  sourceLayer?: string;
};

export type BuildingGeometry =
  | GeoJSON.Polygon
  | GeoJSON.MultiPolygon;

export type SelectedBuilding = {
  featureId: string | number | undefined;
  source: string;
  sourceLayer: string | undefined;
  properties: Record<string, unknown>;
  /** Single polygon under the click (never a whole MultiPolygon cluster). */
  geometry: BuildingGeometry;
  /** Original vector geometry before click-part extraction. */
  sourceGeometry: BuildingGeometry;
  /** Other MultiPolygon parts kept visible after hiding the parent feature. */
  preservedSiblings: GeoJSON.Polygon[];
  clickLng: number;
  clickLat: number;
  centerLng: number;
  centerLat: number;
  identity: BuildingIdentity;
  osmId: string | null;
  customId: string | null;
  name: string | null;
  buildingType: string | null;
  height: number | null;
  minHeight: number | null;
  canFilterHide: boolean;
  filterStrategy: "property" | "feature-id" | "none";
  filterPropertyKey?: string;
  filterPropertyValue?: string | number;
};

/**
 * Rotation values are stored in degrees for UI / persistence.
 * Convert to radians only when applying Three.js transforms.
 */
export type CustomBuildingModel = {
  id: string;
  buildingIdentity: BuildingIdentity;
  modelUrl: string;
  modelLabel?: string;

  longitude: number;
  latitude: number;
  /** Placement home position — offsets and Reset transform return here. */
  originLongitude?: number;
  originLatitude?: number;
  altitude: number;

  rotationX: number;
  rotationY: number;
  rotationZ: number;

  scale: number;

  minZoom: number;
  visible: boolean;

  /** Footprint under the click (single house part). */
  footprintGeometry: BuildingGeometry;
  /** Full OSM/vector geometry (may be MultiPolygon / courtyard ring). */
  sourceGeometry?: BuildingGeometry;
  /** Sibling parts re-drawn after parent feature hide. */
  preservedSiblings?: GeoJSON.Polygon[];
  /** Vector tile feature id when available. */
  vectorFeatureId?: string | number;
  vectorSourceLayer?: string;
  filterPropertyKey?: string;
  filterPropertyValue?: string | number;
  buildingHeight?: number | null;
  buildingMinHeight?: number | null;

  /** When true, original vector extrusion could not be reliably excluded. */
  hideWarning?: boolean;

  createdAt: string;
  updatedAt: string;
};

export type CustomBuildingStore = {
  version: 1;
  selectedBuildingId: string | null;
  replacements: CustomBuildingModel[];
};

export type ConfigExport = {
  version: 1;
  replacements: CustomBuildingModel[];
  exportedAt: string;
};
