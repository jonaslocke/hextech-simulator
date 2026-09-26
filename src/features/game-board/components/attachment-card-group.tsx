import type { CSSProperties, ReactNode } from "react";
import { getCardTileDimensions, type CardTileDimensions, type CardTileSize } from "./card-tile";

export function AttachmentCardGroup({
  attachments,
  groupId,
  host,
  hostExhausted = false,
  size = "md",
  dimensions: dimensionsOverride,
}: {
  attachments: Array<{ id: string; card: ReactNode }>;
  groupId: string;
  host: ReactNode;
  hostExhausted?: boolean;
  size?: CardTileSize;
  dimensions?: CardTileDimensions;
}) {
  const dimensions = dimensionsOverride ?? getCardTileDimensions(size, "portrait");
  const stripWidth = Math.max(24, Math.round(dimensions.width * 0.2));
  const hostFootprintWidth = hostExhausted ? dimensions.height : dimensions.width;
  const groupWidth = hostFootprintWidth + attachments.length * stripWidth;
  const layout = {
    "--attachment-strip-width": `${stripWidth}px`,
    width: `${groupWidth}px`,
    height: `${dimensions.height}px`,
  } as CSSProperties;
  return (
    <div className="relative flex shrink-0 items-start pointer-events-none [&_[data-card-face]]:pointer-events-auto" data-attachment-group-id={groupId} data-card-size={size} style={layout}>
      <div className="relative flex items-start" style={layout}>
        <div className="relative shrink-0" style={{ zIndex: attachments.length + 1 }}>
          {host}
        </div>
        {attachments.map((attachment, index) => (
          <div
            className="absolute top-0 transition-transform hover:-translate-y-1 focus-within:-translate-y-1 motion-reduce:transition-none"
            key={attachment.id}
            style={{
              right: `calc(var(--attachment-strip-width) * ${attachments.length - index - 1})`,
              zIndex: attachments.length - index,
              // Let the actual card faces occlude one another. An exhausted
              // host exposes Equipment above/below it; its empty footprint
              // must neither clip that art nor intercept its pointer events.
            }}
          >
            {attachment.card}
          </div>
        ))}
      </div>
    </div>
  );
}
