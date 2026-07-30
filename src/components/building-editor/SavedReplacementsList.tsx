"use client";

import { useState } from "react";
import type { CustomBuildingModel } from "@/types/building";

type Props = {
  replacements: CustomBuildingModel[];
  activeId: string | null;
  pendingDeleteIds: string[];
  isDirty: boolean;
  saving: boolean;
  onFocus: (id: string) => void;
  onEdit: (id: string) => void;
  onToggleVisible: (id: string, visible: boolean) => void;
  onDelete: (id: string) => void;
  onUndelete: (id: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
};

export function SavedReplacementsList(props: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const { replacements, activeId, pendingDeleteIds, isDirty, saving } = props;

  return (
    <section className="section">
      <div className="section-head">
        <h3>Saved</h3>
        <span className="tag">{replacements.length}</span>
      </div>

      {isDirty ? (
        <div className="draft-bar">
          <p className="muted small">Unsaved changes — press Save to apply.</p>
          <div className="row wrap">
            <button type="button" className="btn primary" disabled={saving} onClick={props.onSave}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="btn ghost" disabled={saving} onClick={props.onDiscard}>
              Discard
            </button>
          </div>
        </div>
      ) : null}

      {replacements.length === 0 ? (
        <p className="muted empty-hint">No replacements yet.</p>
      ) : (
        <ul className="list">
          {replacements.map((item) => {
            const pendingDelete = pendingDeleteIds.includes(item.id);
            return (
              <li
                key={item.id}
                className={`${item.id === activeId ? "active" : ""} ${pendingDelete ? "pending-delete" : ""}`}
              >
                <button
                  type="button"
                  className="list-main clickable"
                  onClick={() => props.onFocus(item.id)}
                  disabled={pendingDelete}
                >
                  <strong>{item.modelLabel ?? "Custom GLB"}</strong>
                  <span className="muted small">
                    {pendingDelete
                      ? "Marked for delete — Save to confirm"
                      : `${item.longitude.toFixed(4)}, ${item.latitude.toFixed(4)}`}
                  </span>
                </button>
                <div className="row wrap">
                  {pendingDelete ? (
                    <button
                      type="button"
                      className="btn tiny"
                      onClick={() => props.onUndelete(item.id)}
                    >
                      Undo delete
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn tiny"
                        onClick={() => props.onEdit(item.id)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn tiny"
                        onClick={() => props.onToggleVisible(item.id, !item.visible)}
                      >
                        {item.visible ? "Hide" : "Show"}
                      </button>
                      <button
                        type="button"
                        className="btn tiny danger"
                        onClick={() => props.onDelete(item.id)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <button
        type="button"
        className="btn ghost tiny advanced-toggle"
        onClick={() => setAdvancedOpen((v) => !v)}
      >
        {advancedOpen ? "Hide import / export" : "Import / export"}
      </button>
      {advancedOpen ? (
        <div className="row wrap" style={{ marginTop: 8 }}>
          <button type="button" className="btn" onClick={props.onExport}>
            Export JSON
          </button>
          <label className="btn">
            Import JSON
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) props.onImportFile(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      ) : null}
    </section>
  );
}
