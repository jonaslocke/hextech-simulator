"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  placeAttachmentGroups,
  type AttachmentGroupBox,
  type AttachmentGroupDescriptor,
} from "./attachment-group-layout";

type Frame = {
  groups: AttachmentGroupBox[];
  originX: number;
  originY: number;
  scrollLeft: number;
  scrollTop: number;
  height: number;
  clientWidth: number;
  clientHeight: number;
};

/** Both board rows use the same measured placement; other zones keep normal flow. */
export function useAttachmentGroupLayout({
  containerRef,
  groups,
  enabled = true,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  groups: readonly AttachmentGroupDescriptor[];
  enabled?: boolean;
}) {
  const previousRef = useRef<Frame | null>(null);
  const anchorsRef = useRef<string[]>([]);
  const groupsRef = useRef(groups);
  const resetRef = useRef(false);
  const [revision, setRevision] = useState(0);
  const [extent, setExtent] = useState<{ width: number; height: number } | null>(null);

  useLayoutEffect(() => {
    groupsRef.current = groups;
    const container = containerRef.current;
    if (!container) {
      previousRef.current = null;
      anchorsRef.current = [];
      setExtent((current) => current === null ? current : null);
      return;
    }
    const elements = groupElements(container);
    if (resetRef.current || !enabled) {
      previousRef.current = null;
      anchorsRef.current = [];
      resetRef.current = false;
    }
    if (anchorsRef.current.length === 0) releasePositions(container, elements);
    let frame = measure(container, groups, elements);
    const previous = previousRef.current;
    const padding = getComputedStyle(container);
    const place = () => enabled && previous ? placeAttachmentGroups({
      previous: previous.groups,
      current: frame.groups,
      anchorIds: anchorsRef.current,
      // New cards must not inherit the normal-flow position below the spacer.
      newGroupOrigin: { x: parseFloat(padding.paddingLeft), y: parseFloat(padding.paddingTop) },
      // Do not shrink the canvas under a scrolled viewport on detach. Browser
      // scroll clamping would otherwise move the host during each layout pass.
      minimumExtent: {
        width: previous.scrollLeft + previous.clientWidth,
        height: previous.scrollTop + previous.clientHeight,
      },
      anchorOffset: {
        x: previous.originX - frame.originX + frame.scrollLeft - previous.scrollLeft,
        y: previous.originY - frame.originY + frame.scrollTop - previous.scrollTop,
      },
    }) : null;
    let placement = place();

    if (placement && anchorsRef.current.length === 0 && previous) {
      // Keep the row viewport stable when absolute groups/scrollbars replace
      // flex content. Otherwise intrinsic height changes can move the host.
      container.style.height = `${previous.height}px`;
      frame = measure(container, groups, elements);
      placement = place();
    }

    if (placement) {
      anchorsRef.current = placement.anchorIds;
      container.style.alignContent = "start";
      for (const group of placement.groups) {
        const element = elements.get(group.id)!;
        element.style.position = "absolute";
        element.style.left = `${group.x}px`;
        element.style.top = `${group.y}px`;
      }
      // The spacer lives inside the row's padding, whereas measured positions
      // include it. Counting padding twice would resize neighboring zones.
      const width = Math.max(0, placement.width - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight));
      const height = Math.max(0, placement.height - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom));
      setExtent((current) => current?.width === width && current.height === height ? current : { width, height });
    } else {
      anchorsRef.current = [];
      releasePositions(container, elements);
      setExtent((current) => current === null ? current : null);
    }
    previousRef.current = measure(container, groups, elements);
  }, [containerRef, enabled, groups, revision]);

  useEffect(() => {
    if (!enabled) return;
    const reset = () => {
      resetRef.current = true;
      setRevision((value) => value + 1);
    };
    const captureScroll = () => {
      const container = containerRef.current;
      if (container) previousRef.current = measure(container, groupsRef.current, groupElements(container));
    };
    window.addEventListener("resize", reset);
    window.addEventListener("scroll", captureScroll, true);
    return () => {
      window.removeEventListener("resize", reset);
      window.removeEventListener("scroll", captureScroll, true);
    };
  }, [containerRef, enabled]);

  return extent;
}

function groupElements(container: HTMLDivElement) {
  return new Map(Array.from(container.children).flatMap((child) => {
    if (!(child instanceof HTMLDivElement) || !child.dataset.attachmentGroupId) return [];
    return [[child.dataset.attachmentGroupId, child] as const];
  }));
}

function releasePositions(container: HTMLDivElement, elements: Map<string, HTMLDivElement>) {
  container.style.removeProperty("align-content");
  container.style.removeProperty("height");
  for (const element of elements.values()) {
    element.style.removeProperty("position");
    element.style.removeProperty("left");
    element.style.removeProperty("top");
  }
}

function measure(
  container: HTMLDivElement,
  groups: readonly AttachmentGroupDescriptor[],
  elements: Map<string, HTMLDivElement>,
): Frame {
  const containerRect = container.getBoundingClientRect();
  const originX = containerRect.left + container.clientLeft;
  const originY = containerRect.top + container.clientTop;
  return {
    originX: originX + window.scrollX,
    originY: originY + window.scrollY,
    scrollLeft: container.scrollLeft,
    scrollTop: container.scrollTop,
    height: containerRect.height,
    clientWidth: container.clientWidth,
    clientHeight: container.clientHeight,
    groups: groups.flatMap((group) => {
      const element = elements.get(group.id);
      if (!element) return [];
      const rect = element.getBoundingClientRect();
      return [{ ...group, x: rect.left - originX + container.scrollLeft,
        y: rect.top - originY + container.scrollTop, width: rect.width, height: rect.height }];
    }),
  };
}
