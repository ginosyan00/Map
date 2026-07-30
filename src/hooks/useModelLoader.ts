"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ALLOWED_MODEL_EXTENSIONS,
  MAX_GLB_BYTES,
} from "@/lib/map/constants";
import { uploadModelFile } from "@/lib/storage/models-api";

export type ModelLoadState = "idle" | "loading" | "success" | "error";

export type ModelSource = {
  url: string;
  label: string;
  revokeOnCleanup: boolean;
};

function hasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_MODEL_EXTENSIONS.some((ext) => lower.endsWith(ext));
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
      if (url.trim().startsWith("blob:")) {
        setState("error");
        setError("Blob URLs are not durable. Upload the file or use a hosted http(s) URL.");
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
          const uploaded = await uploadModelFile(file);
          setSource({
            url: uploaded.url,
            label: uploaded.label,
            revokeOnCleanup: false,
          });
          setState("success");
        } catch (err) {
          setState("error");
          setError(err instanceof Error ? err.message : "Failed to upload model.");
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
