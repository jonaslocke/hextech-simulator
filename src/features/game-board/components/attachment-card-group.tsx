import type { CSSProperties, ReactNode } from "react";
import { getCardTileDimensions } from "./card-tile";

export function AttachmentCardGroup({
  attachments,
  groupId,
  host,
}: {
  attachments: Array<{ id: string; card: ReactNode }>;
  groupId: string;
  host: ReactNode;
}) {
  const cardWidth = getCardTileDimensions("md", "portrait").width;
  const layout = {
    // Twenty percent at the existing board card size, with a usable strip even
    // at the smallest responsive size. No change to card or zone scaling.
    "--attachment-strip-width": `max(24px, calc(${cardWidth} * 0.2))`,
    paddingRight: `calc(var(--attachment-strip-width) * ${attachments.length})`,
  } as CSSProperties;
  return (
    <div className="relative flex shrink-0 min-h-38 min-w-27 items-start pointer-events-none [&_[data-card-face]]:pointer-events-auto" data-attachment-group-id={groupId}>
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
