import * as React from "react";
import type { PassPattern } from "@/lib/pattern";
import type { TiltEngine } from "@/lib/tilt";
import { cn } from "@/lib/utils";

interface QRGridProps extends React.ComponentPropsWithoutRef<"svg"> {
  pattern: PassPattern;
  /** Faint placeholders under the empty cells. Defaults off on dense grids. */
  ghost?: boolean;
  /** Staggered swap when the pattern changes. */
  animate?: boolean;
  /** Assemble the modules on first paint. Never on the card — see below. */
  build?: boolean;
  /** Drives the specular sweep across the modules. */
  engine?: TiltEngine | null;
  /** Slow radial breath through the modules while nothing else is happening. */
  ambient?: boolean;
}

/** Module radius as a fraction of one cell. */
const MODULE_R = 0.34;
const GHOST_R = 0.075;

/** Above this many modules per side the empty-cell ghosts read as grey fill. */
const DENSE_SIZE = 16;

/**
 * Refresh is a two-phase exchange, not a crossfade: what is leaving clears out
 * first, and what is arriving lands behind it.
 */
const EXIT_SPAN = 150;
const EXIT_DURATION = 180;
const ENTER_SPAN = 190;
const ENTER_DURATION = 240;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

/** How far the specular highlight travels, in grid units, at full tilt. */
const LIGHT_TRAVEL = 2.4;

/**
 * The modules are bucketed into radial bands, and a band is the unit of both
 * animation and geometry. That is what keeps this cheap at any size: a 32x32
 * symbol is a thousand modules, and giving each one an element cost ~200ms of
 * dead time between tapping the tile and the card starting to grow. Each band
 * is three <path> elements instead — the ones staying put, the ones leaving
 * and the ones arriving — so the whole field is eighteen nodes however many
 * modules it holds.
 */
const BANDS = 6;
const BREATH_PERIOD = 4.8;
const BREATH_OFFSET = 0.34;

/** Smallest gradient move worth writing. */
const LIGHT_EPSILON = 0.02;

interface Cell {
  index: number;
  cx: number;
  cy: number;
}

interface Band {
  cells: Cell[];
  enterDelay: number;
  exitDelay: number;
  style?: React.CSSProperties;
}

/** One subpath per lit module, as a pair of arcs. */
function bandPath(cells: Cell[], modules: readonly boolean[], radius: number) {
  const d: string[] = [];
  const r = radius;
  const span = (r * 2).toFixed(3);
  const back = (-r * 2).toFixed(3);
  for (const cell of cells) {
    if (!modules[cell.index]) continue;
    d.push(
      `M${(cell.cx - r).toFixed(3)} ${cell.cy.toFixed(3)}` +
        `a${r} ${r} 0 1 0 ${span} 0a${r} ${r} 0 1 0 ${back} 0Z`,
    );
  }
  return d.join("");
}

/**
 * Renders a PassPattern as a field of circular modules.
 *
 * Size-agnostic by design: the viewBox is the module grid itself, so the same
 * component draws the 88px tile and the 216px card at identical proportions,
 * and a real encoder's symbol needs no changes here.
 */
export const QRGrid = React.forwardRef<SVGSVGElement, QRGridProps>(
  (
    {
      pattern,
      ghost,
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
    const dense = size > DENSE_SIZE;
    const showGhost = ghost ?? !dense;

    // useId's delimiters aren't safe inside a url(#...) reference.
    const lightId = `qr-light-${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
    const lightRef = React.useRef<SVGRadialGradientElement>(null);
    const lastLight = React.useRef({ x: NaN, y: NaN });
    const fieldRef = React.useRef<SVGGElement>(null);
    const shown = React.useRef<readonly boolean[] | null>(null);

    /** Geometry depends on `size` alone, never on which modules are lit. */
    const bands = React.useMemo<Band[]>(() => {
      const centre = (size - 1) / 2;
      const maxRadius = Math.hypot(centre, centre) || 1;
      const cells: Cell[][] = Array.from({ length: BANDS }, () => []);

      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          const radial = Math.hypot(col - centre, row - centre) / maxRadius;
          const band = Math.min(BANDS - 1, Math.floor(radial * BANDS));
          cells[band].push({
            index: row * size + col,
            cx: col + 0.5,
            cy: row + 0.5,
          });
        }
      }

      return cells.map((band, index) => {
        const radial = (index + 0.5) / BANDS;
        return {
          cells: band,
          exitDelay: Math.round(radial * EXIT_SPAN),
          enterDelay: EXIT_SPAN + Math.round(radial * ENTER_SPAN),
          style: ambient
            ? {
                // Negative delay starts each band already part-way through, so
                // the swell is staggered from the first frame rather than
                // easing in together.
                animation: `module-breathe ${BREATH_PERIOD}s ease-in-out ${(
                  -index * BREATH_OFFSET
                ).toFixed(2)}s infinite`,
              }
            : undefined,
        };
      });
    }, [size, ambient]);

    const ghostPath = React.useMemo(() => {
      if (!showGhost) return "";
      const all = bands.flatMap((band) => band.cells);
      return bandPath(
        all,
        all.map(() => true),
        GHOST_R,
      );
    }, [bands, showGhost]);

    /**
     * Which modules are lit is applied straight to the DOM. The three layers
     * per band mean an unchanged module is never re-animated and never
     * double-drawn: it simply stays in the `keep` layer at full opacity while
     * the other two carry the exchange.
     *
     * The first application has to land whole and un-animated on the card: its
     * QR is the shared element, and it must be complete on the frame the
     * growth starts or the transition would visibly fill in. The tile opts in
     * to animating that first application instead — that is its assemble.
     */
    React.useLayoutEffect(() => {
      const field = fieldRef.current;
      if (!field) return;

      const previous = shown.current;
      // React re-invokes layout effects on mount in development. Without this
      // the second pass would see the pattern it just applied, consolidate it
      // and cancel the assemble mid-flight — so the tile animated in
      // production and snapped in during development.
      if (previous === modules) return;
      const first = previous === null;
      const moving = animate && (!first || build);

      bands.forEach((band, index) => {
        const group = field.children[index] as SVGGElement | undefined;
        if (!group) return;
        const [keep, exit, enter] = Array.from(
          group.children,
        ) as SVGPathElement[];
        if (!keep || !exit || !enter) return;

        for (const layer of [keep, exit, enter]) {
          for (const animation of layer.getAnimations()) animation.cancel();
        }

        if (!moving) {
          keep.setAttribute("d", bandPath(band.cells, modules, MODULE_R));
          exit.setAttribute("d", "");
          enter.setAttribute("d", "");
          keep.style.opacity = "1";
          exit.style.opacity = "0";
          enter.style.opacity = "1";
          return;
        }

        const staying: boolean[] = [];
        const leaving: boolean[] = [];
        const arriving: boolean[] = [];
        for (const cell of band.cells) {
          const now = modules[cell.index];
          const was = previous ? previous[cell.index] : false;
          staying[cell.index] = was && now;
          leaving[cell.index] = was && !now;
          arriving[cell.index] = !was && now;
        }

        keep.setAttribute("d", bandPath(band.cells, staying, MODULE_R));
        exit.setAttribute("d", bandPath(band.cells, leaving, MODULE_R));
        enter.setAttribute("d", bandPath(band.cells, arriving, MODULE_R));
        keep.style.opacity = "1";

        exit.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: EXIT_DURATION,
          delay: band.exitDelay,
          easing: EASE,
          fill: "both",
        });
        enter.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: ENTER_DURATION,
          delay: band.enterDelay,
          easing: EASE,
          fill: "both",
        });
      });

      shown.current = modules;
    }, [modules, bands, animate, build]);

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
        const last = lastLight.current;
        if (
          Math.abs(x - last.x) < LIGHT_EPSILON &&
          Math.abs(y - last.y) < LIGHT_EPSILON
        ) {
          return;
        }
        lastLight.current = { x, y };
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
            <stop
              offset="0"
              style={{ stopColor: "var(--module)", stopOpacity: 1 }}
            />
            <stop
              offset="0.55"
              style={{ stopColor: "var(--module)", stopOpacity: 0.97 }}
            />
            {/* Floor kept high: the brief calls for pure white modules, so
                this is a lighting falloff on white, not a tint. */}
            <stop
              offset="1"
              style={{ stopColor: "var(--module)", stopOpacity: 0.85 }}
            />
          </radialGradient>
        </defs>

        {showGhost && <path d={ghostPath} fill="var(--module-dim)" />}

        <g ref={fieldRef} fill={`url(#${lightId})`}>
          {bands.map((band, index) => (
            <g key={`band-${index}`} style={band.style}>
              <path d="" />
              <path d="" style={{ opacity: 0 }} />
              <path d="" style={{ opacity: 0 }} />
            </g>
          ))}
        </g>
      </svg>
    );
  },
);
QRGrid.displayName = "QRGrid";
