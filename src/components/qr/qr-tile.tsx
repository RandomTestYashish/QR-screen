import * as React from "react";
import { QRGrid } from "./qr-grid";
import { GlitterSurface } from "@/components/surface/glitter-surface";
import type { PassPattern } from "@/lib/pattern";
import type { Theme } from "@/hooks/use-theme";

interface QRTileProps {
  pattern: PassPattern;
  theme: Theme;
  /** Measured as the FLIP origin, so it must wrap the QR and nothing else. */
  qrRef: React.RefObject<HTMLDivElement | null>;
  /** Hidden (not unmounted) while the modal's QR stands in for it. */
  qrHidden: boolean;
  onOpen: () => void;
}

/** Tile box and QR box, both on the 8pt grid. */
export const TILE_WIDTH = 144;
export const TILE_HEIGHT = 168;
export const TILE_QR_SIZE = 112;

/**
 * The compact pass on the home screen. Small on purpose: it reads as a chip
 * you carry, and it is the object the modal card physically grows out of.
 */
export const QRTile = React.forwardRef<HTMLButtonElement, QRTileProps>(
  ({ pattern, theme, qrRef, qrHidden, onOpen }, ref) => (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-label="Open access pass"
      className="pass-surface relative flex flex-col items-center rounded-[24px] p-4 transition-transform duration-300 ease-[var(--ease-pass)] active:scale-[0.975]"
      style={{ width: TILE_WIDTH, height: TILE_HEIGHT }}
    >
      <GlitterSurface theme={theme} intensity={0.7} />
      <div
        ref={qrRef}
        className="relative z-10"
        style={{
          width: TILE_QR_SIZE,
          height: TILE_QR_SIZE,
          // `visibility`, not just opacity: an opacity-0 grid still paints, so
          // while the card stands in for the tile both copies were painting
          // and transitioning every module. Visibility keeps the box
          // measurable for the FLIP while taking it out of paint entirely.
          opacity: qrHidden ? 0 : 1,
          visibility: qrHidden ? "hidden" : "visible",
        }}
      >
        <QRGrid pattern={pattern} ghost={false} build />
      </div>
      <span className="eyebrow relative z-10 mt-2 text-ink-2">Members QR</span>
    </button>
  ),
);
QRTile.displayName = "QRTile";
