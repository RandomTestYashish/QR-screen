import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Dialog, stripped of its own enter/exit animation.
 *
 * Radix is here for the parts that are genuinely hard — focus trap, focus
 * restore, `aria-modal`, escape and outside-press — while the motion is driven
 * by the FLIP controller in QRModal. Everything is force-mounted so the exit
 * transition can play before React unmounts the tree.
 */

const Dialog = DialogPrimitive.Root;
const DialogClose = DialogPrimitive.Close;
const DialogTitle = DialogPrimitive.Title;
const DialogDescription = DialogPrimitive.Description;

function DialogPortal({
  container,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal forceMount container={container} {...props} />;
}

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    forceMount
    data-slot="dialog-overlay"
    className={cn("absolute inset-0 z-40", className)}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Content
    ref={ref}
    forceMount
    data-slot="dialog-content"
    className={cn(
      "absolute inset-0 z-50 grid place-items-center outline-none",
      className,
    )}
    {...props}
  />
));
DialogContent.displayName = "DialogContent";

/** Available to assistive tech, invisible on screen. */
function VisuallyHidden({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute size-px overflow-hidden whitespace-nowrap [clip-path:inset(50%)]">
      {children}
    </span>
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  VisuallyHidden,
};
