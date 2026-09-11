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
export const TILE_SIZE = 136;
export const TILE_QR_SIZE = 88;

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
      className="pass-surface relative grid place-items-center rounded-[24px] transition-transform duration-300 ease-[var(--ease-pass)] active:scale-[0.975]"
      style={{ width: TILE_SIZE, height: TILE_SIZE }}
    >
      <GlitterSurface theme={theme} intensity={0.7} />
      <div
        ref={qrRef}
        style={{
          width: TILE_QR_SIZE,
          height: TILE_QR_SIZE,
          opacity: qrHidden ? 0 : 1,
        }}
      >
        <QRGrid pattern={pattern} animate={false} ghost={false} />
      </div>
    </button>
  ),
);
QRTile.displayName = "QRTile";
