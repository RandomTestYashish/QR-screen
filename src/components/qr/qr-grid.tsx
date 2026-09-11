import * as React from "react";
import type { PassPattern } from "@/lib/pattern";
import { cn } from "@/lib/utils";

interface QRGridProps extends React.ComponentPropsWithoutRef<"svg"> {
  pattern: PassPattern;
  /** Faint placeholders under the empty cells. Purely decorative. */
  ghost?: boolean;
  /** Disable the staggered swap (reduced motion, or the compact tile). */
  animate?: boolean;
}

/** Module radius as a fraction of one cell. */
const MODULE_R = 0.305;
const GHOST_R = 0.075;
/** Total spread of the refresh stagger, in ms. */
const STAGGER = 180;

/**
 * Renders a PassPattern as a field of circular modules.
 *
 * Every cell is mounted for the life of the component and only its opacity and
 * scale change, so a refresh is a pure compositor transition — no remount, no
 * layout, and the stagger can ripple out from the centre.
 *
 * Size-agnostic by design: the viewBox is the module grid itself, so the same
 * component draws the 88px tile and the 216px card at identical proportions,
 * and a larger `pattern.size` from a real encoder needs no changes here.
 */
export const QRGrid = React.forwardRef<SVGSVGElement, QRGridProps>(
  ({ pattern, ghost = true, animate = true, className, ...props }, ref) => {
    const { size, modules } = pattern;
    const center = (size - 1) / 2;
    const maxDistance = Math.hypot(center, center) || 1;

    const cells = React.useMemo(() => {
      const out = [];
      for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
          const distance = Math.hypot(col - center, row - center) / maxDistance;
          out.push({
            key: `${row}-${col}`,
            cx: col + 0.5,
            cy: row + 0.5,
            on: modules[row * size + col],
            delay: Math.round(distance * STAGGER),
          });
        }
      }
      return out;
    }, [size, modules, center, maxDistance]);

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
        <g fill="var(--module)">
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
                  ? `opacity 260ms var(--ease-pass) ${cell.delay}ms, transform 340ms var(--ease-pass) ${cell.delay}ms, fill 420ms var(--ease-pass)`
                  : "fill 420ms var(--ease-pass)",
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
