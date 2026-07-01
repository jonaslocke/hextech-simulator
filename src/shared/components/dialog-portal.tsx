"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const DIALOG_PORTAL_ID = "dialog-portal";

export function DialogPortal({ children }: { children: ReactNode }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setContainer(document.getElementById(DIALOG_PORTAL_ID));
  }, []);

  return container ? createPortal(children, container) : null;
}
