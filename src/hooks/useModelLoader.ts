"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_GLB_BYTES } from "@/lib/map/constants";
import { uploadModelFile } from "@/lib/storage/models-api";

export type ModelLoadState = "idle" | "loading" | "success" | "error";

export type ModelSource = {
  url: string;
  label: string;
  revokeOnCleanup: boolean;
};

function isGlbFile(name: string): boolean {
  return name.toLowerCase().endsWith(".glb");
}

export function useModelLoader() {
  const [state, setState] = useState<ModelLoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<ModelSource | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);

  const revokeCurrent = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  useEffect(() => () => revokeCurrent(), [revokeCurrent]);

  const bumpRequest = useCallback(() => {
    requestIdRef.current += 1;
    return requestIdRef.current;
  }, []);

  const setUrl = useCallback(
    (url: string, label = url) => {
      bumpRequest();
      revokeCurrent();
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
    [bumpRequest, revokeCurrent],
  );

  const uploadFile = useCallback(
    (file: File) => {
      const requestId = bumpRequest();
      revokeCurrent();
      setError(null);

      if (!isGlbFile(file.name)) {
        setState("error");
        setError("Only .glb files are supported.");
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
      void (async () => {
        try {
          const uploaded = await uploadModelFile(file);
          if (requestId !== requestIdRef.current) return;
          setSource({
            url: uploaded.url,
            label: uploaded.label,
            revokeOnCleanup: false,
          });
          setState("success");
        } catch (err) {
          if (requestId !== requestIdRef.current) return;
          setState("error");
          setError(err instanceof Error ? err.message : "Failed to upload model.");
          setSource(null);
        }
      })();
    },
    [bumpRequest, revokeCurrent],
  );

  const clear = useCallback(() => {
    bumpRequest();
    revokeCurrent();
    setSource(null);
    setState("idle");
    setError(null);
  }, [bumpRequest, revokeCurrent]);

  return {
    state,
    error,
    source,
    setUrl,
    uploadFile,
    clear,
    markError: (message: string) => {
      bumpRequest();
      setState("error");
      setError(message);
    },
  };
}
