"use client";

import type { SelectedBuilding } from "@/types/building";

type Props = {
  building: SelectedBuilding | null;
};

export function SelectedBuildingInfo({ building }: Props) {
  if (!building) {
    return (
      <p className="muted">
        Click a 3D building on the map to inspect its OpenMapTiles properties.
      </p>
    );
  }

  const rows: Array<[string, string]> = [
    ["Feature ID", building.featureId !== undefined ? String(building.featureId) : "—"],
    ["OSM ID", building.osmId ?? "—"],
    ["Name", building.name ?? "—"],
    ["Building type", building.buildingType ?? "—"],
    ["Height", building.height !== null ? String(building.height) : "—"],
    ["Minimum height", building.minHeight !== null ? String(building.minHeight) : "—"],
    ["Source", building.source],
    ["Source layer", building.sourceLayer ?? "—"],
    ["Center longitude", building.centerLng.toFixed(6)],
    ["Center latitude", building.centerLat.toFixed(6)],
  ];

  return (
    <dl className="info-grid">
      {rows.map(([label, value]) => (
        <div key={label} className="info-row">
          <dt>{label}</dt>
          <dd title={value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
