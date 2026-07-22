"use client";

type Props = {
  onUpload: (file: File) => void;
  onUrlSubmit: (url: string) => void;
  onUseSample: () => void;
  disabled?: boolean;
  status: "idle" | "loading" | "success" | "error";
  error: string | null;
  currentLabel?: string | null;
};

export function ModelUploader({
  onUpload,
  onUrlSubmit,
  onUseSample,
  disabled,
  status,
  error,
  currentLabel,
}: Props) {
  return (
    <div className="stack">
      <div className="row wrap">
        <button type="button" className="btn" disabled={disabled} onClick={onUseSample}>
          Use Sample Model
        </button>
        <label className={`btn ${disabled ? "disabled" : ""}`}>
          Upload GLB
          <input
            type="file"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            hidden
            disabled={disabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.target.value = "";
            }}
          />
        </label>
      </div>

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
          disabled={disabled}
        />
        <button type="submit" className="btn" disabled={disabled}>
          Load URL
        </button>
      </form>

      <p className="muted small">
        Status: <strong>{status}</strong>
        {currentLabel ? ` · ${currentLabel}` : ""}
      </p>
      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
