"use client";

import { useState } from "react";
import type { SelectedBuilding } from "@/types/building";
import { identityKey } from "@/lib/map/building-identification";

type Props = {
  building: SelectedBuilding | null;
};

export function SelectedBuildingInfo({ building }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!building) {
    return (
      <div className="empty-select">
        <p className="empty-select-title">No building selected</p>
        <p className="muted small">Click any extruded building on the map to start.</p>
      </div>
    );
  }

  const title = building.name ?? building.buildingType ?? "Selected building";

  return (
    <div className="stack tight">
      <div className="select-card">
        <strong>{title}</strong>
        <span className="muted small">
          {building.height !== null ? `${building.height} m high` : "Height unknown"}
          {building.osmId ? ` · OSM ${building.osmId}` : ""}
        </span>
      </div>
      <button
        type="button"
        className="btn tiny ghost"
        onClick={() => setDetailsOpen((v) => !v)}
      >
        {detailsOpen ? "Hide details" : "Show details"}
      </button>
      {detailsOpen ? (
        <dl className="info-grid">
          <div className="info-row">
            <dt>Identity</dt>
            <dd title={identityKey(building.identity)}>{building.identity.type}</dd>
          </div>
          <div className="info-row">
            <dt>Filter</dt>
            <dd>{building.filterStrategy}</dd>
          </div>
          <div className="info-row">
            <dt>Center</dt>
            <dd>
              {building.centerLng.toFixed(5)}, {building.centerLat.toFixed(5)}
            </dd>
          </div>
        </dl>
      ) : null}
    </div>
  );
}
