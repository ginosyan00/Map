"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildEmbedSnippet,
  buildShareUrl,
  type CameraShareState,
} from "@/lib/integration/share-url";

type HealthResponse = {
  ok: boolean;
  checks?: Record<string, string>;
  endpoints?: Record<string, string>;
  error?: string;
};

type ModelsResponse = {
  models?: Array<{ id: string; url: string; bytes: number }>;
  count?: number;
  error?: string;
};

type Props = {
  camera: CameraShareState | null;
  focusId: string | null;
  replacementCount: number;
  onClearAll: () => void;
};

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ManageIntegratePanel({
  camera,
  focusId,
  replacementCount,
  onClearAll,
}: Props) {
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [modelCount, setModelCount] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [healthRes, modelsRes] = await Promise.all([
        fetch("/api/health", { cache: "no-store" }),
        fetch("/api/models", { cache: "no-store" }),
      ]);
      const healthJson = (await healthRes.json()) as HealthResponse;
      const modelsJson = (await modelsRes.json()) as ModelsResponse;
      setHealth(healthJson);
      setModelCount(typeof modelsJson.count === "number" ? modelsJson.count : null);
    } catch (error) {
      setHealth({
        ok: false,
        error: error instanceof Error ? error.message : "Health check failed.",
      });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  const viewUrl = buildShareUrl({
    origin,
    camera,
    focusId,
  });
  const embedUrl = buildShareUrl({
    origin,
    embed: true,
    camera,
    focusId,
  });
  const embedSnippet = buildEmbedSnippet(embedUrl);

  const flash = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 1800);
  };

  return (
    <section className="section">
      <div className="section-head">
        <h3>Manage &amp; integrate</h3>
        <button type="button" className="btn tiny ghost" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Open"}
        </button>
      </div>

      {!open ? (
        <p className="muted empty-hint">
          Share links, embed iframe, health check, clear all.
        </p>
      ) : (
        <div className="stack">
          <div className="manage-stats">
            <div>
              <span className="muted small">Replacements</span>
              <strong>{replacementCount}</strong>
            </div>
            <div>
              <span className="muted small">Uploaded GLBs</span>
              <strong>{modelCount ?? "—"}</strong>
            </div>
            <div>
              <span className="muted small">API</span>
              <strong className={health?.ok ? "ok-text" : "warn-text-inline"}>
                {health ? (health.ok ? "Healthy" : "Issues") : "…"}
              </strong>
            </div>
          </div>

          <div className="row wrap">
            <button
              type="button"
              className="btn"
              onClick={async () => {
                flash((await copyText(viewUrl)) ? "Share link copied." : "Copy failed.");
              }}
            >
              Copy share link
            </button>
            <button
              type="button"
              className="btn"
              onClick={async () => {
                flash((await copyText(embedSnippet)) ? "Embed code copied." : "Copy failed.");
              }}
            >
              Copy embed iframe
            </button>
            <button type="button" className="btn ghost" onClick={() => void refresh()}>
              Refresh status
            </button>
          </div>

          <label className="field">
            <span className="field-label">Embed URL</span>
            <input className="input" readOnly value={embedUrl} onFocus={(e) => e.currentTarget.select()} />
          </label>

          <p className="muted small">
            APIs: <code>GET/PUT /api/replacements</code>, <code>GET/POST /api/models</code>,{" "}
            <code>GET /api/health</code>. Use write secret header for mutating calls.
          </p>
          <p className="muted small">
            Shortcuts: <kbd>Enter</kbd> replace · <kbd>Esc</kbd> clear selection ·{" "}
            <kbd>Delete</kbd> remove active
          </p>

          <button
            type="button"
            className="btn danger"
            disabled={replacementCount === 0}
            onClick={() => {
              if (
                window.confirm(
                  `Delete all ${replacementCount} replacement(s)? This syncs an empty list to the database.`,
                )
              ) {
                onClearAll();
                flash("All replacements cleared.");
              }
            }}
          >
            Clear all replacements
          </button>

          {notice ? <p className="ok compact">{notice}</p> : null}
        </div>
      )}
    </section>
  );
}
