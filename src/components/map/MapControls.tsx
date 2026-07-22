"use client";

type Props = {
  statusText: string;
  onResetView: () => void;
};

export function MapControls({ statusText, onResetView }: Props) {
  return (
    <div className="map-chrome">
      <div className="hint">Click a building to select it</div>
      <div className="map-status">{statusText}</div>
      <button type="button" className="btn tiny" onClick={onResetView}>
        F4 view
      </button>
    </div>
  );
}
