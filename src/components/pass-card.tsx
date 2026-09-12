import * as React from "react";
import { QRGrid } from "@/components/qr/qr-grid";
import { GlitterSurface } from "@/components/surface/glitter-surface";
import { RefreshAction } from "@/components/refresh-action";
import {
  DialogDescription,
  DialogTitle,
  VisuallyHidden,
} from "@/components/ui/dialog";
import type { PassPattern } from "@/lib/pattern";
import type { Theme } from "@/hooks/use-theme";
import type { TiltEngine } from "@/lib/tilt";

/** 375 viewport - 24 margin either side. */
export const CARD_WIDTH = 327;
export const CARD_QR_SIZE = 216;

/** Degrees of card rotation at full tilt. */
const MAX_ROTATION = 6;
/** Parallax travel, in px, for the layer nearest the viewer. */
const MAX_PARALLAX = 9;

export interface PassCardRefs {
  /** Box that carries the tilt rotation. */
  surface: React.RefObject<HTMLDivElement | null>;
  /** Painted surface — gradient, glitter, edge. Fades during the transition. */
  backdrop: React.RefObject<HTMLDivElement | null>;
  /** The shared element the FLIP is solved from. */
  qr: React.RefObject<HTMLDivElement | null>;
  header: React.RefObject<HTMLDivElement | null>;
  details: React.RefObject<HTMLDivElement | null>;
  footer: React.RefObject<HTMLDivElement | null>;
  /** The two parallax planes. Zeroed before the FLIP measures anything. */
  near: React.RefObject<HTMLDivElement | null>;
  far: React.RefObject<HTMLDivElement | null>;
}

interface PassCardProps {
  pattern: PassPattern;
  theme: Theme;
  engine: TiltEngine | null;
  refs: PassCardRefs;
  onRefresh: () => void;
}

/**
 * The expanded pass.
 *
 * Layered back to front: gradient + glitter on their own element (so they can
 * fade independently of the QR), then two parallax planes of content. The tilt
 * subscriber writes transforms straight onto the nodes — no state, no
 * re-render — so the entire physical response stays on the compositor.
 */
export function PassCard({
  pattern,
  theme,
  engine,
  refs,
  onRefresh,
}: PassCardProps) {
  const { near: nearRef, far: farRef } = refs;

  React.useEffect(() => {
    if (!engine) return;
    return engine.subscribe(({ x, y }) => {
      const surface = refs.surface.current;
      if (surface) {
        surface.style.transform =
          `rotateY(${(x * MAX_ROTATION).toFixed(3)}deg) ` +
          `rotateX(${(-y * MAX_ROTATION).toFixed(3)}deg)`;
      }
      const near = nearRef.current;
      if (near) {
        near.style.transform = `translate3d(${(x * MAX_PARALLAX).toFixed(2)}px, ${(
          y * MAX_PARALLAX
        ).toFixed(2)}px, 0)`;
      }
      const far = farRef.current;
      if (far) {
        const k = MAX_PARALLAX * 0.42;
        far.style.transform = `translate3d(${(x * k).toFixed(2)}px, ${(y * k).toFixed(
          2,
        )}px, 0)`;
      }
    });
  }, [engine, farRef, nearRef, refs.surface]);

  return (
    <div
      ref={refs.surface}
      className="relative will-change-transform"
      style={{ width: CARD_WIDTH, padding: 24 }}
    >
      <div
        ref={refs.backdrop}
        aria-hidden="true"
        className="pass-surface absolute inset-0 rounded-[28px]"
      >
        <GlitterSurface engine={engine} theme={theme} intensity={0.95} />
      </div>

      <div ref={refs.header} className="relative z-10 flex h-6 items-center">
        <DialogTitle asChild>
          <h2 className="eyebrow text-ink-2">Access QR</h2>
        </DialogTitle>
      </div>

      {/* The shared element. It is carried across the transition, so it never
          fades — continuity depends on it staying fully opaque throughout. */}
      <div ref={nearRef} className="relative z-10 mt-6 will-change-transform">
        <div
          ref={refs.qr}
          className="mx-auto"
          style={{ width: CARD_QR_SIZE, height: CARD_QR_SIZE }}
        >
          <QRGrid pattern={pattern} engine={engine} />
        </div>
      </div>

      <div ref={farRef} className="relative z-10 will-change-transform">
        <div ref={refs.details}>
          <p className="mt-8 text-[17px] font-semibold leading-6 tracking-[-0.02em] text-ink">
            Founding Member
          </p>

          <dl className="mt-4">
            <dt className="eyebrow text-ink-3">Credential</dt>
            <dd
              key={pattern.id}
              className="mt-2 text-[15px] font-semibold tabular-nums tracking-[0.08em] text-ink [animation:token-in_460ms_var(--ease-pass)]"
            >
              {pattern.token}
            </dd>
          </dl>

          <p className="mt-6 text-[12px] font-light italic leading-4 text-ink-3">
            Single-use credential. Regenerates on refresh.
          </p>
        </div>

        <div
          ref={refs.footer}
          className="mt-6 flex justify-center border-t border-hairline pt-6"
          style={{ marginInline: -24, paddingInline: 24 }}
        >
          <RefreshAction onRefresh={onRefresh} />
        </div>
      </div>

      <VisuallyHidden>
        <DialogDescription>
          Founding member credential {pattern.token}. The pattern shown is a
          visual prototype and does not encode a scannable code.
        </DialogDescription>
      </VisuallyHidden>
    </div>
  );
}
