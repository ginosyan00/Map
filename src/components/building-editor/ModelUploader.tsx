"use client";

import { useState } from "react";

type Props = {
  onUpload: (file: File) => void;
  onUrlSubmit: (url: string) => void;
  onUseSample: () => void;
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  currentLabel?: string | null;
};

export function ModelUploader({
  onUpload,
  onUrlSubmit,
  onUseSample,
  status,
  error,
  currentLabel,
}: Props) {
  const busy = status === "loading";
  const [urlOpen, setUrlOpen] = useState(false);

  return (
    <div className="stack">
      <div className="model-actions">
        <label className={`upload-tile ${busy ? "disabled" : ""}`}>
          <span className="upload-tile-title">Upload GLB</span>
          <span className="muted small">From your computer</span>
          <input
            type="file"
            accept=".glb,model/gltf-binary"
            hidden
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.target.value = "";
            }}
          />
        </label>
        <button
          type="button"
          className="upload-tile ghost-tile"
          disabled={busy}
          onClick={onUseSample}
        >
          <span className="upload-tile-title">Use sample</span>
          <span className="muted small">Quick demo box</span>
        </button>
      </div>

      <button
        type="button"
        className="btn tiny ghost"
        disabled={busy}
        onClick={() => setUrlOpen((v) => !v)}
      >
        {urlOpen ? "Hide URL input" : "Or load from URL"}
      </button>

      {urlOpen ? (
        <form
          className="row"
          onSubmit={(event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const data = new FormData(form);
            const url = String(data.get("modelUrl") ?? "");
            onUrlSubmit(url);
          }}
        >
          <input
            name="modelUrl"
            className="input grow"
            placeholder="https://…/model.glb"
            disabled={busy}
          />
          <button type="submit" className="btn" disabled={busy}>
            Load
          </button>
        </form>
      ) : null}

      <p className={`model-status status-${status}`}>
        {busy ? "Uploading…" : status === "success" ? "Ready" : status === "error" ? "Failed" : "No model yet"}
        {currentLabel && status === "success" ? ` · ${currentLabel}` : ""}
      </p>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
