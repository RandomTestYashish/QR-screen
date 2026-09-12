import * as React from "react";
import { QRGrid } from "./qr-grid";
import { GlitterSurface } from "@/components/surface/glitter-surface";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
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
 * The breath the pass takes as the theme changes: a small swell, then a settle
 * back to rest. It runs a little longer than the 420ms colour cross-fade so
 * the card is still moving as the new palette lands, which is what makes the
 * two read as one event rather than as a recolour with a bounce stapled on.
 */
const THEME_SWELL = 1.055;
const THEME_BREATH = 620;

/**
 * The compact pass on the home screen. Small on purpose: it reads as a chip
 * you carry, and it is the object the modal card physically grows out of.
 */
export const QRTile = React.forwardRef<HTMLButtonElement, QRTileProps>(
  ({ pattern, theme, qrRef, qrHidden, onOpen }, ref) => {
    const reducedMotion = useReducedMotion();
    const tileRef = React.useRef<HTMLButtonElement>(null);

    // The button is measured by the FLIP through the forwarded ref and
    // animated here through the local one, so both have to land on the node.
    const attach = React.useCallback(
      (node: HTMLButtonElement | null) => {
        tileRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    const shown = React.useRef(theme);
    React.useEffect(() => {
      if (shown.current === theme) return;
      shown.current = theme;
      if (reducedMotion) return;
      // Web Animations rather than a CSS transition: this is a there-and-back
      // move, and it has to sit on top of the tile's own press transition
      // without either one clobbering the other's transform.
      tileRef.current?.animate(
        [
          {
            transform: "scale(1)",
            easing: "cubic-bezier(0.33, 0.9, 0.5, 1)",
          },
          {
            transform: `scale(${THEME_SWELL})`,
            offset: 0.36,
            easing: "cubic-bezier(0.32, 0, 0.2, 1)",
          },
          { transform: "scale(1)" },
        ],
        { duration: THEME_BREATH },
      );
    }, [theme, reducedMotion]);

    return (
      <button
        ref={attach}
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
            // `visibility`, not just opacity: an opacity-0 grid still paints,
            // so while the card stands in for the tile both copies were
            // painting and transitioning every module. Visibility keeps the
            // box measurable for the FLIP while taking it out of paint.
            opacity: qrHidden ? 0 : 1,
            visibility: qrHidden ? "hidden" : "visible",
          }}
        >
          <QRGrid pattern={pattern} ghost={false} build />
        </div>
        <span className="eyebrow relative z-10 mt-2 text-ink-2">Members QR</span>
      </button>
    );
  },
);
QRTile.displayName = "QRTile";
