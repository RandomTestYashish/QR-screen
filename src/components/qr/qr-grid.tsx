import * as React from "react";
import type { PassPattern } from "@/lib/pattern";
import type { TiltEngine } from "@/lib/tilt";
import { cn } from "@/lib/utils";

interface QRGridProps extends React.ComponentPropsWithoutRef<"svg"> {
  pattern: PassPattern;
  /** Faint placeholders under the empty cells. Purely decorative. */
  ghost?: boolean;
  /** Staggered swap when the pattern changes. */
  animate?: boolean;
  /** Assemble the modules once on mount. Never on the card — see below. */
  build?: boolean;
  /** Drives the specular sweep across the modules. */
  engine?: TiltEngine | null;
}

/** Module radius as a fraction of one cell. */
const MODULE_R = 0.305;
const GHOST_R = 0.075;

/**
 * Refresh is a two-phase exchange, not a crossfade: what is leaving clears out
 * first, and what is arriving lands behind it. The delay is keyed off the
 * module's *new* state, so no previous-pattern bookkeeping is needed — a module
 * that doesn't change state has no visible transition whatever its delay.
 */
const EXIT_SPAN = 150;
const ENTER_SPAN = 190;

/** Spread of the one-off assemble, swept diagonally. */
const BUILD_SPAN = 260;
const BUILD_DURATION = 420;

/** How far the specular highlight travels, in grid units, at full tilt. */
const LIGHT_TRAVEL = 2.4;

/**
 * Renders a PassPattern as a field of circular modules.
 *
 * Every cell is mounted for the life of the component and only its opacity and
 * scale change, so a refresh is a pure compositor transition — no remount, no
 * layout, and the ripple can travel out from the centre.
 *
 * Size-agnostic by design: the viewBox is the module grid itself, so the same
 * component draws the 88px tile and the 216px card at identical proportions,
 * and a larger `pattern.size` from a real encoder needs no changes here.
 */
export const QRGrid = React.forwardRef<SVGSVGElement, QRGridProps>(
  (
    {
      pattern,
      ghost = true,
      animate = true,
      build = false,
      engine = null,
      className,
      ...props
    },
    ref,
  ) => {
    const { size, modules } = pattern;

    // useId's delimiters aren't safe inside a url(#...) reference.
    const lightId = `qr-light-${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
    const lightRef = React.useRef<SVGRadialGradientElement>(null);

    // The assemble is a mount-only event. Left as a plain `build && on`
    // expression it would re-arm on every render, so a module switched on by a
    // refresh would replay the assemble instead of taking the two-phase
    // transition. Retire it once it has played.
    const [building, setBuilding] = React.useState(build);
    React.useEffect(() => {
      if (!building) return;
      const id = window.setTimeout(
        () => setBuilding(false),
        BUILD_SPAN + BUILD_DURATION + 50,
      );
      return () => window.clearTimeout(id);
    }, [building]);

    const cells = React.useMemo(() => {
      const center = (size - 1) / 2;
      const maxRadius = Math.hypot(center, center) || 1;
      const maxDiagonal = 2 * (size - 1) || 1;
      const out = [];

      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          const on = modules[row * size + col];
          const radial = Math.hypot(col - center, row - center) / maxRadius;
          out.push({
            key: `${row}-${col}`,
            cx: col + 0.5,
            cy: row + 0.5,
            on,
            delay: on
              ? EXIT_SPAN + Math.round(radial * ENTER_SPAN)
              : Math.round(radial * EXIT_SPAN),
            buildDelay: Math.round(((row + col) / maxDiagonal) * BUILD_SPAN),
          });
        }
      }
      return out;
    }, [size, modules]);

    /**
     * Specular sweep. One gradient spans the whole grid in user space, so every
     * module samples the same light — moving its centre is two attribute writes
     * per frame rather than a per-module recalculation. The highlight travels
     * against the tilt, the way a reflection does on a physical foil.
     */
    React.useEffect(() => {
      if (!engine) return;
      return engine.subscribe(({ x, y }) => {
        const light = lightRef.current;
        if (!light) return;
        const mid = size / 2;
        light.setAttribute("cx", (mid - x * LIGHT_TRAVEL).toFixed(3));
        light.setAttribute("cy", (mid + y * LIGHT_TRAVEL).toFixed(3));
      });
    }, [engine, size]);

    return (
      <svg
        ref={ref}
        viewBox={`0 0 ${size} ${size}`}
        shapeRendering="geometricPrecision"
        aria-hidden="true"
        focusable="false"
        className={cn("block size-full overflow-visible", className)}
        {...props}
      >
        <defs>
          <radialGradient
            ref={lightRef}
            id={lightId}
            gradientUnits="userSpaceOnUse"
            cx={size / 2}
            cy={size / 2}
            r={size * 0.9}
          >
            <stop offset="0" style={{ stopColor: "var(--module)", stopOpacity: 1 }} />
            <stop
              offset="0.55"
              style={{ stopColor: "var(--module)", stopOpacity: 0.97 }}
            />
            {/* Floor kept high: the brief calls for pure white modules, so
                this is a lighting falloff on white, not a tint. Even at full
                tilt the dimmest module stays well clear of the card. */}
            <stop
              offset="1"
              style={{ stopColor: "var(--module)", stopOpacity: 0.85 }}
            />
          </radialGradient>
        </defs>

        {ghost && (
          <g fill="var(--module-dim)">
            {cells.map((cell) => (
              <circle
                key={`g-${cell.key}`}
                cx={cell.cx}
                cy={cell.cy}
                r={GHOST_R}
              />
            ))}
          </g>
        )}

        <g fill={`url(#${lightId})`}>
          {cells.map((cell) => (
            <circle
              key={cell.key}
              cx={cell.cx}
              cy={cell.cy}
              r={MODULE_R}
              opacity={cell.on ? 1 : 0}
              style={{
                transformBox: "fill-box",
                transformOrigin: "center",
                transform: cell.on ? "scale(1)" : "scale(0.32)",
                transition: animate
                  ? cell.on
                    ? `opacity 240ms var(--ease-pass) ${cell.delay}ms, transform 300ms var(--ease-pass) ${cell.delay}ms`
                    : `opacity 180ms var(--ease-pass) ${cell.delay}ms, transform 220ms var(--ease-pass) ${cell.delay}ms`
                  : undefined,
                // `backwards` only, never `forwards`: the assemble holds its
                // first frame through the delay and then hands the module back
                // to the transition above, instead of pinning it forever.
                animation:
                  building && cell.on
                    ? `module-build ${BUILD_DURATION}ms var(--ease-pass) ${cell.buildDelay}ms backwards`
                    : undefined,
                willChange: animate ? "transform, opacity" : undefined,
              }}
            />
          ))}
        </g>
      </svg>
    );
  },
);
QRGrid.displayName = "QRGrid";
