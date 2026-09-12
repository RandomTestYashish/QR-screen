import * as React from "react";
import { clamp } from "@/lib/utils";
import type { Theme } from "@/hooks/use-theme";

interface BlinkingDotsProps {
  theme: Theme;
}

/**
 * Overall strength of the field. One knob for the whole background.
 * Applied on the element rather than folded into the per-dot alphas: those
 * decide which dots clear ALPHA_CUTOFF, so scaling them would thin the grid
 * out instead of just dimming it.
 */
const FIELD_OPACITY = 0.34;

/**
 * Grid pitch in CSS px, and the ceiling that keeps the count sane.
 * Radii are fractions of the pitch, so a denser grid gets proportionally
 * finer dots — the field reads as higher resolution rather than as the same
 * dots crowded together.
 */
const PITCH = 8;
const MAX_DOTS = 6000;

/** Dot radius. Blinking dots vary in light, not much in size. */
const BASE_R = PITCH * 0.064;
const HERO_R = PITCH * 0.121;
/** Share of dots that blink brighter and larger than the rest. */
const HERO_SHARE = 0.08;

/** Seconds for one blink cycle, low to high. */
const MIN_PERIOD = 1.8;
const MAX_PERIOD = 5.2;

const LEVELS = 8;
const ALPHA_CUTOFF = 0.02;

interface Palette {
  dot: string;
  floor: number;
  peak: number;
}

const PALETTE: Record<Theme, Palette> = {
  dark: { dot: "255,255,255", floor: 0.05, peak: 0.85 },
  // Graphite on paper. The same peak would be shouting against a light ground.
  light: { dot: "10,10,13", floor: 0.04, peak: 0.42 },
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A field of dots on a fixed grid, each blinking on its own clock.
 *
 * The distinguishing thing about this versus a wave field is that the dots are
 * *independent*: every one gets its own period and phase, so at any moment a
 * scattered handful are lit and the rest are near the floor. Nothing travels
 * across the grid and nothing moves — only the light changes.
 *
 * One canvas, no DOM per dot, one rAF loop, parked whenever the tab is hidden
 * or the viewer has asked for reduced motion.
 */
export function BlinkingDots({ theme }: BlinkingDotsProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const themeRef = React.useRef(theme);
  themeRef.current = theme;
  const repaint = React.useRef<(() => void) | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let count = 0;

    // Flat typed arrays rather than objects: the draw loop walks these every
    // frame and allocating nothing keeps it off the GC.
    let px = new Float32Array(0);
    let py = new Float32Array(0);
    let pr = new Float32Array(0);
    let speed = new Float32Array(0);
    let phase = new Float32Array(0);
    let gain = new Float32Array(0);

    let buckets: Float32Array[] = [];
    const counts = new Int32Array(LEVELS);

    const build = () => {
      let pitch = PITCH;
      if (Math.ceil(width / pitch) * Math.ceil(height / pitch) > MAX_DOTS) {
        pitch = Math.sqrt((width * height) / MAX_DOTS);
      }
      const cols = Math.ceil(width / pitch) + 1;
      const rows = Math.ceil(height / pitch) + 1;
      count = cols * rows;

      px = new Float32Array(count);
      py = new Float32Array(count);
      pr = new Float32Array(count);
      speed = new Float32Array(count);
      phase = new Float32Array(count);
      gain = new Float32Array(count);

      const rand = mulberry32(0xb1a5ed);
      let i = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++, i++) {
          const hero = rand() < HERO_SHARE;
          // A touch of jitter off the exact lattice, so it reads as a field
          // rather than as graph paper.
          px[i] = col * pitch + (rand() - 0.5) * pitch * 0.35;
          py[i] = row * pitch + (rand() - 0.5) * pitch * 0.35;
          pr[i] = hero ? HERO_R : BASE_R * (0.7 + rand() * 0.5);
          const period = MIN_PERIOD + rand() * (MAX_PERIOD - MIN_PERIOD);
          speed[i] = (Math.PI * 2) / period;
          phase[i] = rand() * Math.PI * 2;
          gain[i] = hero ? 1 : 0.35 + rand() * 0.5;
        }
      }

      buckets = Array.from({ length: LEVELS }, () => new Float32Array(count * 3));
    };

    const measure = () => {
      const w = host.offsetWidth;
      const h = host.offsetHeight;
      if (w === 0 || h === 0) return false;
      const nextDpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
      if (w === width && h === height && nextDpr === dpr && count > 0) {
        return true;
      }
      width = w;
      height = h;
      dpr = nextDpr;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      build();
      return true;
    };

    const draw = (seconds: number) => {
      const { dot, floor, peak } = PALETTE[themeRef.current];
      ctx.clearRect(0, 0, width * dpr, height * dpr);
      counts.fill(0);
      const span = peak - floor;

      for (let i = 0; i < count; i++) {
        const wave = 0.5 + 0.5 * Math.sin(seconds * speed[i] + phase[i]);
        // Cubed, not raw: a plain sine reads as a slow pulse. Cubing keeps a
        // dot near the floor for most of its cycle and gives it a brief
        // flash, which is what makes it a blink.
        const lit = wave * wave * wave;
        const alpha = floor + lit * span * gain[i];
        if (alpha < ALPHA_CUTOFF) continue;

        const level = clamp(
          Math.round(((alpha - floor) / span) * (LEVELS - 1)),
          0,
          LEVELS - 1,
        );
        const store = buckets[level];
        const at = counts[level] * 3;
        store[at] = px[i] * dpr;
        store[at + 1] = py[i] * dpr;
        // Hero dots swell a little as they flash; the rest hold their size.
        store[at + 2] =
          (pr[i] + lit * (pr[i] > BASE_R ? PITCH * 0.036 : PITCH * 0.011)) *
          dpr;
        counts[level]++;
      }

      for (let level = 0; level < LEVELS; level++) {
        const n = counts[level];
        if (n === 0) continue;
        ctx.fillStyle = `rgba(${dot},${(
          floor +
          (level / (LEVELS - 1)) * span
        ).toFixed(3)})`;
        ctx.beginPath();
        const store = buckets[level];
        for (let d = 0; d < n; d++) {
          const at = d * 3;
          const r = store[at + 2];
          ctx.moveTo(store[at] + r, store[at + 1]);
          ctx.arc(store[at], store[at + 1], r, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let start = 0;

    const loop = (now: number) => {
      if (!start) start = now;
      draw((now - start) / 1000);
      frame = requestAnimationFrame(loop);
    };

    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const run = () => {
      stop();
      if (!measure()) return;
      if (reduced.matches || document.hidden) {
        // A frozen field is the reduced-motion result, not a blank screen.
        draw(0);
        return;
      }
      frame = requestAnimationFrame(loop);
    };

    repaint.current = run;
    run();
    const observer = new ResizeObserver(run);
    observer.observe(host);
    document.addEventListener("visibilitychange", run);
    reduced.addEventListener("change", run);

    return () => {
      stop();
      repaint.current = null;
      observer.disconnect();
      document.removeEventListener("visibilitychange", run);
      reduced.removeEventListener("change", run);
    };
  }, []);

  // A running field picks the new palette up on its next frame. A parked one
  // — reduced motion, or a hidden tab — has to be told.
  React.useEffect(() => {
    repaint.current?.();
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 size-full"
      style={{ opacity: FIELD_OPACITY }}
    />
  );
}
