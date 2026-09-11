import * as React from "react";
import type { TiltEngine, TiltVector } from "@/lib/tilt";
import { clamp, cn } from "@/lib/utils";
import type { Theme } from "@/hooks/use-theme";

interface GlitterSurfaceProps {
  /** Omit for a static surface (the compact tile). */
  engine?: TiltEngine | null;
  theme: Theme;
  /** Global multiplier, 0-1. Lower it wherever the QR needs the room. */
  intensity?: number;
  className?: string;
}

interface Particle {
  x: number; // 0..1
  y: number; // 0..1
  size: number; // device px, integral -> lands on the pixel grid
  facetX: number;
  facetY: number;
  hue: number;
  sat: number;
  light: number;
  base: number; // peak alpha
  bias: number; // alpha floor, so the texture never fully disappears
}

/** One particle per N CSS px² of surface. Deliberately sparse. */
const AREA_PER_PARTICLE = 760;
const MAX_PARTICLES = 420;
/** Smallest tilt delta worth a repaint. */
const REDRAW_EPSILON = 0.0015;

/**
 * Restrained iridescent palette. Mostly achromatic silver; the tinted facets
 * are the minority and never run the full spectrum, which is what keeps this
 * reading as brushed holographic stock rather than as a rainbow.
 */
const FACET_HUES = [
  { hue: 0, sat: 0, weight: 0.46 }, // silver / soft white
  { hue: 212, sat: 0.34, weight: 0.22 }, // cool steel
  { hue: 284, sat: 0.3, weight: 0.14 }, // faint violet
  { hue: 44, sat: 0.28, weight: 0.1 }, // faint gold
  { hue: 168, sat: 0.26, weight: 0.08 }, // faint teal
];

function pickFacet(r: number) {
  let acc = 0;
  for (const facet of FACET_HUES) {
    acc += facet.weight;
    if (r <= acc) return facet;
  }
  return FACET_HUES[0];
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildParticles(
  width: number,
  height: number,
  dark: boolean,
): Particle[] {
  const count = clamp(
    Math.round((width * height) / AREA_PER_PARTICLE),
    24,
    MAX_PARTICLES,
  );
  const rand = mulberry32(0x5eed1e);
  const particles: Particle[] = [];

  for (let i = 0; i < count; i++) {
    const facet = pickFacet(rand());
    // Facet normal: which way this fleck is angled, so different specks catch
    // the light at different points through the tilt.
    const angle = rand() * Math.PI * 2;
    // Sized in device pixels, not CSS pixels: on a 3x screen the common
    // fleck is a third of a CSS pixel across, which is what keeps the
    // texture reading as embedded grain rather than as visible confetti.
    const grade = rand();

    particles.push({
      x: rand(),
      y: rand(),
      size: grade > 0.93 ? 3 : grade > 0.72 ? 2 : 1,
      facetX: Math.cos(angle),
      facetY: Math.sin(angle),
      hue: facet.hue + (rand() - 0.5) * 16,
      sat: facet.sat * (0.7 + rand() * 0.6),
      light: dark ? 82 + rand() * 16 : 32 + rand() * 22,
      base: (dark ? 0.3 : 0.26) * (0.45 + rand() * 0.8),
      bias: 0.06 + rand() * 0.09,
    });
  }
  return particles;
}

/**
 * Tilt-reactive glitter.
 *
 * Micro-flecks painted into the card's own surface — no shimmer sweep, no
 * sparkle loop. Each fleck has a fixed facet angle; tilting the device changes
 * which facets face the light, so the reflected colour redistributes toward
 * the direction of the tilt. Everything is static until the tilt actually
 * moves: the draw is gated on a delta, so an idle card runs zero work.
 */
export function GlitterSurface({
  engine,
  theme,
  intensity = 1,
  className,
}: GlitterSurfaceProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const particlesRef = React.useRef<Particle[]>([]);
  const sizeRef = React.useRef({ width: 0, height: 0, dpr: 1 });
  const lastRef = React.useRef({ x: NaN, y: NaN });

  const dark = theme === "dark";
  const intensityRef = React.useRef(intensity);
  intensityRef.current = intensity;
  const darkRef = React.useRef(dark);
  darkRef.current = dark;

  const draw = React.useCallback((tiltX: number, tiltY: number) => {
    const canvas = canvasRef.current;
    const { width, height, dpr } = sizeRef.current;
    if (!canvas || width === 0 || height === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = width * dpr;
    const h = height * dpr;
    const isDark = darkRef.current;
    const gain = intensityRef.current;

    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";

    // Diffuse reflection: a broad, very low-contrast pool of colour that
    // drifts opposite the tilt. Not a beam — it has no edge and never sweeps.
    const cx = (0.5 - tiltX * 0.32) * w;
    const cy = (0.5 + tiltY * 0.32) * h;
    const sheen = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h));
    const hueA = 206 + tiltX * 34;
    const hueB = 286 + tiltX * 28;
    if (isDark) {
      sheen.addColorStop(0, `hsl(${hueA} 42% 92% / ${0.075 * gain})`);
      sheen.addColorStop(0.42, `hsl(${hueB} 38% 78% / ${0.032 * gain})`);
    } else {
      sheen.addColorStop(0, `hsl(${hueA} 34% 46% / ${0.05 * gain})`);
      sheen.addColorStop(0.42, `hsl(${hueB} 30% 52% / ${0.026 * gain})`);
    }
    sheen.addColorStop(1, "hsl(0 0% 50% / 0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, w, h);

    // Flecks. `lighter` in dark mode makes them read as embedded highlights;
    // in light mode they are dark specks laid straight onto the stock.
    ctx.globalCompositeOperation = isDark ? "lighter" : "source-over";

    for (const p of particlesRef.current) {
      // Facet alignment (does this fleck face the light?) blended with a
      // positional term (which side of the card is catching it?).
      const facet = p.facetX * tiltX + p.facetY * tiltY;
      const spatial = (p.x - 0.5) * tiltX * 2 + (0.5 - p.y) * tiltY * 2;
      const align = clamp(facet * 0.62 + spatial * 0.38, -1, 1);
      const lit = align > 0 ? align * align : 0;

      const alpha = clamp((p.bias + lit * p.base * 3.2) * gain, 0, 0.55);
      if (alpha < 0.012) continue;

      // Hue drifts with the tilt direction — a few degrees, never a cycle.
      const hue = p.hue + tiltX * 26 + tiltY * 14;
      const sat = clamp(p.sat * (0.55 + lit * 0.9), 0, 0.7) * 100;

      ctx.fillStyle = `hsl(${hue} ${sat}% ${p.light}% / ${alpha})`;
      ctx.fillRect(
        Math.round(p.x * w) - (p.size >> 1),
        Math.round(p.y * h) - (p.size >> 1),
        p.size,
        p.size,
      );
    }
  }, []);

  // Size + particle field. Rebuilt only when the box or the theme changes.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const apply = () => {
      // offsetWidth/Height, never getBoundingClientRect: the card is mid-FLIP
      // when this first runs, and a transformed rect would size the backing
      // store to the shrunken card and leave a visible seam.
      const width = host.offsetWidth;
      const height = host.offsetHeight;
      const dpr = clamp(window.devicePixelRatio || 1, 1, 3);
      if (width === 0 || height === 0) return;
      const next = { width, height, dpr };
      const prev = sizeRef.current;
      if (
        prev.width === width &&
        prev.height === height &&
        prev.dpr === dpr &&
        particlesRef.current.length > 0
      ) {
        return;
      }

      sizeRef.current = next;
      // The element is sized by CSS (inset-0); only the backing store is set
      // here, so the two can never disagree.
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      particlesRef.current = buildParticles(width, height, dark);
      lastRef.current = { x: NaN, y: NaN };

      const tilt = engine?.current;
      draw(tilt?.x ?? 0, tilt?.y ?? 0);
    };

    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(host);
    return () => observer.disconnect();
  }, [dark, draw, engine]);

  // Repaint only when the smoothed tilt has actually moved.
  React.useEffect(() => {
    if (!engine) return;
    return engine.subscribe((tilt: Readonly<TiltVector>) => {
      const last = lastRef.current;
      if (
        Math.abs(tilt.x - last.x) < REDRAW_EPSILON &&
        Math.abs(tilt.y - last.y) < REDRAW_EPSILON
      ) {
        return;
      }
      lastRef.current = { x: tilt.x, y: tilt.y };
      draw(tilt.x, tilt.y);
    });
  }, [draw, engine]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 size-full",
        className,
      )}
      style={{
        mixBlendMode: "var(--glitter-blend)" as React.CSSProperties["mixBlendMode"],
        opacity: "var(--glitter-alpha)",
      }}
    />
  );
}
