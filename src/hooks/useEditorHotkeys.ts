"use client";

import { useEffect, useRef } from "react";

type HotkeyHandlers = {
  onReplace?: () => void;
  onClearSelection?: () => void;
  onRemoveActive?: () => void;
  enabled?: boolean;
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function useEditorHotkeys(handlers: HotkeyHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (handlers.enabled === false) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const current = handlersRef.current;

      if (event.key === "Escape") {
        current.onClearSelection?.();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        current.onReplace?.();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        current.onRemoveActive?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers.enabled]);
}
