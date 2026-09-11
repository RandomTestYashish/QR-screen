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
  /** Slow radial breath through the modules while nothing else is happening. */
  ambient?: boolean;
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
 * Ambient breath. Deliberately not one animation per module: the modules are
 * bucketed into radial bands and the band is animated, so the whole effect
 * costs six composited opacity animations rather than sixty-four. The phase
 * offset between bands is what makes it read as a slow swell travelling out
 * from the centre instead of the code blinking as one block.
 */
const BANDS = 6;
const BREATH_PERIOD = 4.8;
const BREATH_OFFSET = 0.34;

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
      ambient = true,
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
            band: Math.min(BANDS - 1, Math.floor(radial * BANDS)),
            delay: on
              ? EXIT_SPAN + Math.round(radial * ENTER_SPAN)
              : Math.round(radial * EXIT_SPAN),
            buildDelay: Math.round(((row + col) / maxDiagonal) * BUILD_SPAN),
          });
        }
      }
      return out;
    }, [size, modules]);

    const bands = React.useMemo(
      () =>
        Array.from({ length: BANDS }, (_, band) =>
          cells.filter((cell) => cell.band === band),
        ),
      [cells],
    );

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
          {bands.map((band, index) => (
            <g
              key={`band-${index}`}
              style={
                ambient
                  ? {
                      // Negative delay starts each band already part-way
                      // through, so the swell is staggered from the first
                      // frame rather than easing in together.
                      animation: `module-breathe ${BREATH_PERIOD}s ease-in-out ${(
                        -index * BREATH_OFFSET
                      ).toFixed(2)}s infinite`,
                    }
                  : undefined
              }
            >
              {band.map((cell) => (
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
                    // `backwards` only, never `forwards`: the assemble holds
                    // its first frame through the delay and then hands the
                    // module back to the transition above.
                    animation:
                      building && cell.on
                        ? `module-build ${BUILD_DURATION}ms var(--ease-pass) ${cell.buildDelay}ms backwards`
                        : undefined,
                    willChange: animate ? "transform, opacity" : undefined,
                  }}
                />
              ))}
            </g>
          ))}
        </g>
      </svg>
    );
  },
);
QRGrid.displayName = "QRGrid";
