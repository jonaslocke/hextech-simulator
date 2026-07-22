"use client";

import * as React from "react";
import { X } from "lucide-react";

import { DialogPortal } from "@/shared/components/dialog-portal";
import { cn } from "@/shared/utils/cn";

type DialogContextValue = {
  onOpenChange: (open: boolean) => void;
};

const DialogContext = React.createContext<DialogContextValue | null>(null);

function Dialog({
  children,
  onOpenChange,
  open,
}: {
  children: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}) {
  return (
    <DialogContext.Provider value={{ onOpenChange: onOpenChange ?? (() => undefined) }}>
      {open ? children : null}
    </DialogContext.Provider>
  );
}

function DialogContent({ className, children, ...props }: React.ComponentProps<"div">) {
  const context = React.useContext(DialogContext);

  return (
    <DialogPortal>
      <div
        className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 sm:p-8"
        onMouseDown={() => context?.onOpenChange(false)}
      >
        <div
          aria-modal="true"
          className={cn(
            "relative my-auto w-full rounded-xl border bg-card p-6 text-card-foreground shadow-2xl",
            className,
          )}
          onMouseDown={(event) => event.stopPropagation()}
          role="dialog"
          {...props}
        >
          <button
            aria-label="Close dialog"
            className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            onClick={() => context?.onOpenChange(false)}
            type="button"
          >
            <X className="size-4" />
          </button>
          {children}
        </div>
      </div>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col space-y-1.5", className)} {...props} />;
}

function DialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("text-lg font-semibold", className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle };
