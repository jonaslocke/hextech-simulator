import type { ReactNode } from "react";
import {
  attachmentCardOffset,
  attachmentGroupPadding,
} from "./attachment-layout";

export function AttachmentCardGroup({
  attachments,
  host,
}: {
  attachments: Array<{ id: string; card: ReactNode }>;
  host: ReactNode;
}) {
  return (
    <div
      className="relative flex min-h-38 min-w-27 items-start"
      style={attachmentGroupPadding(attachments.length)}
    >
      {host}
      {attachments.map((attachment, index) => (
        <div className="absolute" key={attachment.id} style={attachmentCardOffset(index)}>
          {attachment.card}
        </div>
      ))}
    </div>
  );
}
