"use client";

import { useEffect, useMemo, useState } from "react";
import {
  parseShareState,
  type AppShareState,
  type CameraShareState,
} from "@/lib/integration/share-url";

export function useAppShareState(): AppShareState {
  const [state, setState] = useState<AppShareState>({
    embed: false,
    focusId: null,
    camera: null,
  });

  useEffect(() => {
    setState(parseShareState(window.location.search));
  }, []);

  return state;
}

export function useInitialCamera(
  shareCamera: CameraShareState | null,
): CameraShareState | null {
  return useMemo(() => shareCamera, [shareCamera]);
}
