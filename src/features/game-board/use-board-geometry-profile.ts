"use client";

import { useEffect, useState } from "react";
import type { BoardGeometryProfile } from "./board-geometry";

export function useBoardGeometryProfile(): BoardGeometryProfile {
  const [profile, setProfile] = useState<BoardGeometryProfile>("reference");
  useEffect(() => {
    const query = window.matchMedia("(max-height: 849px)");
    const update = () => setProfile(query.matches ? "compact" : "reference");
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return profile;
}
