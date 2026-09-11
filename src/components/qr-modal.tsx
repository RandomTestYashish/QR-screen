import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogOverlay,
  DialogPortal,
} from "@/components/ui/dialog";
import { PassCard, type PassCardRefs } from "@/components/pass-card";
import { animateClose, animateOpen, type FlipTargets } from "@/lib/flip";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useTiltEngine } from "@/hooks/use-tilt";
import type { PassPattern } from "@/lib/pattern";
import type { Theme } from "@/hooks/use-theme";

type Phase = "closed" | "opening" | "open" | "closing";

interface QRModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wraps the tile's QR. Both the origin and the destination of the growth. */
  sourceRef: React.RefObject<HTMLElement | null>;
  /** The control that opened the card. Focus returns here on close. */
  triggerRef: React.RefObject<HTMLElement | null>;
  /** The 375x812 canvas. The dialog is portalled into it, not into <body>. */
  container: HTMLElement | null;
  pattern: PassPattern;
  theme: Theme;
  onRefresh: () => void;
  /** Lets the screen hide the tile's QR while the card's stands in for it. */
  onSharedElementActive: (active: boolean) => void;
}

function useCardRefs(): PassCardRefs {
  const surface = React.useRef<HTMLDivElement>(null);
  const backdrop = React.useRef<HTMLDivElement>(null);
  const qr = React.useRef<HTMLDivElement>(null);
  const header = React.useRef<HTMLDivElement>(null);
  const close = React.useRef<HTMLButtonElement>(null);
  const details = React.useRef<HTMLDivElement>(null);
  const footer = React.useRef<HTMLDivElement>(null);
  const near = React.useRef<HTMLDivElement>(null);
  const far = React.useRef<HTMLDivElement>(null);
  // Refs are stable for the life of the component, so this object can be too —
  // and it has to be, or every render would restart the transition effect.
  return React.useMemo(
    () => ({ surface, backdrop, qr, header, close, details, footer, near, far }),
    [],
  );
}

export function QRModal({
  open,
  onOpenChange,
  sourceRef,
  triggerRef,
  container,
  pattern,
  theme,
  onRefresh,
  onSharedElementActive,
}: QRModalProps) {
  const reducedMotion = useReducedMotion();
  const [phase, setPhase] = React.useState<Phase>("closed");

  const flipRef = React.useRef<HTMLDivElement>(null);
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const cardRefs = useCardRefs();

  // Tilt only comes alive once the card has actually landed, so the growth
  // reads as one clean motion rather than as two competing ones.
  const engine = useTiltEngine(phase === "open", cardRefs.surface);

  const mounted = phase !== "closed";

  const collectTargets = React.useCallback((): FlipTargets | null => {
    const flip = flipRef.current;
    const overlay = overlayRef.current;
    const { surface, backdrop, qr, header, details, footer, near, far } =
      cardRefs;
    if (!flip || !overlay || !backdrop.current || !qr.current) return null;
    const nonNull = <T,>(el: T | null): el is T => el !== null;
    return {
      flip,
      overlay,
      backdrop: backdrop.current,
      qr: qr.current,
      sections: [header.current, details.current, footer.current].filter(
        nonNull,
      ),
      tiltNodes: [surface.current, near.current, far.current].filter(nonNull),
    };
  }, [cardRefs]);

  // Drive the phase machine off the controlled `open` prop. The tree stays
  // mounted through "closing" so the exit transition can finish.
  React.useEffect(() => {
    if (open && phase === "closed") setPhase("opening");
    if (!open && (phase === "open" || phase === "opening")) setPhase("closing");
  }, [open, phase]);

  React.useLayoutEffect(() => {
    if (phase !== "opening" && phase !== "closing") return;

    const targets = collectTargets();
    const source = sourceRef.current?.getBoundingClientRect();
    if (!targets || !source) {
      setPhase(phase === "opening" ? "open" : "closed");
      return;
    }

    let cancelled = false;
    const opening = phase === "opening";

    // Hand the QR over before the first frame so the two never both show.
    onSharedElementActive(true);

    const run = opening
      ? animateOpen(targets, source, reducedMotion)
      : animateClose(targets, source, reducedMotion);

    run.then(() => {
      if (cancelled) return;
      if (opening) {
        setPhase("open");
      } else {
        setPhase("closed");
        onSharedElementActive(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    phase,
    collectTargets,
    sourceRef,
    triggerRef,
    reducedMotion,
    onSharedElementActive,
  ]);

  return (
    <Dialog
      open={mounted}
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      {/* forceMount keeps the exit transition alive, so the portal itself has
          to come down once the card is fully closed — otherwise the dialog's
          full-bleed content layer would keep swallowing taps on the tile. */}
      {mounted && (
        <DialogPortal container={container}>
          <DialogOverlay
            ref={overlayRef}
            className="bg-[var(--scrim)] backdrop-blur-[6px]"
            style={{ opacity: 0 }}
          />
          <DialogContent
            className="pointer-events-none"
            onOpenAutoFocus={(event) => {
              // Focus lands in the card without yanking the viewport around
              // mid-transition.
              event.preventDefault();
              cardRefs.close.current?.focus({ preventScroll: true });
            }}
            onCloseAutoFocus={(event) => {
              // The card is opened programmatically, not through a Radix
              // DialogTrigger, so Radix has no trigger to hand focus back to
              // and would drop it on the body. Return it to the tile.
              event.preventDefault();
              triggerRef.current?.focus({ preventScroll: true });
            }}
          >
            <div
              ref={flipRef}
              className="origin-center will-change-transform"
              style={{
                perspective: 1100,
                pointerEvents: phase === "open" ? "auto" : "none",
              }}
            >
              <PassCard
                pattern={pattern}
                theme={theme}
                engine={engine}
                refs={cardRefs}
                onRefresh={onRefresh}
              />
            </div>
          </DialogContent>
        </DialogPortal>
      )}
    </Dialog>
  );
}
