"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ALLOWED_MODEL_EXTENSIONS,
  MAX_GLB_BYTES,
} from "@/lib/map/constants";

export type ModelLoadState = "idle" | "loading" | "success" | "error";

export type ModelSource = {
  url: string;
  label: string;
  revokeOnCleanup: boolean;
};

/** Persist uploads across refresh when small enough for localStorage. */
const DATA_URL_MAX_BYTES = 3 * 1024 * 1024;

function hasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_MODEL_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read file as data URL."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed."));
    reader.readAsDataURL(file);
  });
}

export function useModelLoader() {
  const [state, setState] = useState<ModelLoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<ModelSource | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const revokeCurrent = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  useEffect(() => () => revokeCurrent(), [revokeCurrent]);

  const setUrl = useCallback(
    (url: string, label = url) => {
      revokeCurrent();
      setState("loading");
      setError(null);
      if (!url.trim()) {
        setState("error");
        setError("Model URL is empty.");
        setSource(null);
        return;
      }
      setSource({ url: url.trim(), label, revokeOnCleanup: false });
      setState("success");
    },
    [revokeCurrent],
  );

  const uploadFile = useCallback(
    (file: File) => {
      void (async () => {
        revokeCurrent();
        setError(null);

        if (!hasAllowedExtension(file.name)) {
          setState("error");
          setError("Only .glb (recommended) or .gltf files are allowed.");
          setSource(null);
          return;
        }
        if (file.size > MAX_GLB_BYTES) {
          setState("error");
          setError(
            `File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Max ${(MAX_GLB_BYTES / (1024 * 1024)).toFixed(0)} MB.`,
          );
          setSource(null);
          return;
        }

        setState("loading");
        try {
          if (file.size <= DATA_URL_MAX_BYTES) {
            const dataUrl = await readFileAsDataUrl(file);
            setSource({ url: dataUrl, label: file.name, revokeOnCleanup: false });
          } else {
            const objectUrl = URL.createObjectURL(file);
            objectUrlRef.current = objectUrl;
            setSource({ url: objectUrl, label: file.name, revokeOnCleanup: true });
          }
          setState("success");
        } catch (err) {
          setState("error");
          setError(err instanceof Error ? err.message : "Failed to read uploaded file.");
          setSource(null);
        }
      })();
    },
    [revokeCurrent],
  );

  const clear = useCallback(() => {
    revokeCurrent();
    setSource(null);
    setState("idle");
    setError(null);
  }, [revokeCurrent]);

  return {
    state,
    error,
    source,
    setUrl,
    uploadFile,
    clear,
    markError: (message: string) => {
      setState("error");
      setError(message);
    },
  };
}
