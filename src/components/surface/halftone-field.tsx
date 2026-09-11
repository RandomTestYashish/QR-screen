import * as React from "react";
import { clamp } from "@/lib/utils";
import type { Theme } from "@/hooks/use-theme";

interface HalftoneFieldProps {
  theme: Theme;
}

/**
 * Opacity of the whole field. Applied on the element rather than folded into
 * the per-dot alphas: those are what decide which dots clear ALPHA_CUTOFF, so
 * scaling them would thin the texture out instead of just dimming it.
 */
const FIELD_OPACITY = 0.2;

/** Grid pitch in CSS px, and the ceiling that keeps the count sane. */
const PITCH = 9;
const MAX_DOTS = 4400;

/** Dot radius in CSS px, floor to peak. */
const MIN_R = 0.42;
const MAX_R = 2.45;

/** How far a dot may wander from its cell, in CSS px. */
const DRIFT = 3.2;

/**
 * Alpha is quantised into this many levels so the whole field draws in a
 * handful of fills instead of one per dot. Radius can vary freely inside a
 * level — a single path can hold arcs of any size.
 */
const LEVELS = 8;

/** Below this a dot is invisible; skipping it is free contrast. */
const ALPHA_CUTOFF = 0.02;

interface Palette {
  dot: string;
  floor: number;
  peak: number;
  /** Where the surface starts to catch the light. Higher = more black. */
  threshold: number;
}

const PALETTE: Record<Theme, Palette> = {
  // Bright ridges on near-black, with most of the field sitting at the floor.
  dark: { dot: "255,255,255", floor: 0.11, peak: 1, threshold: 0.34 },
  // Graphite on paper. Lower peak: the same contrast would be shouting here.
  light: { dot: "10,10,13", floor: 0.07, peak: 0.5, threshold: 0.37 },
};

/**
 * The height of the invisible surface the dots sit on, at (u, v) and time t.
 *
 * Layered sines rather than an imported noise library: a handful of waves at
 * incommensurable frequencies never visibly repeats, costs a few trig calls
 * per dot, and adds no dependency. Two slow-drifting ripple centres on top
 * stop the result reading as a plain interference pattern.
 *
 * u and v are both in units of the field's WIDTH, so v runs past 1 on a tall
 * screen. That matters: normalising each axis by its own dimension squashes
 * every wave into horizontal banding on a 375x812 frame.
 */
function surface(u: number, v: number, t: number) {
  let n =
    Math.sin(u * 11.3 + v * 5.7 + t * 0.19) +
    Math.sin(v * 13.1 - u * 4.3 - t * 0.13) * 0.85 +
    Math.sin((u + v) * 9.4 + t * 0.11) * 0.7 +
    Math.sin((u - v) * 15.2 - t * 0.16) * 0.5;

  const ax = 0.5 + Math.sin(t * 0.07) * 0.42;
  const ay = 0.8 + Math.cos(t * 0.05) * 0.7;
  const da = Math.hypot(u - ax, v - ay);
  n += Math.sin(da * 19 - t * 0.42) * Math.exp(-da * 0.85) * 1.05;

  const bx = 0.5 + Math.cos(t * 0.043) * 0.46;
  const by = 1.5 + Math.sin(t * 0.061) * 0.6;
  const db = Math.hypot(u - bx, v - by);
  n += Math.sin(db * 15 - t * 0.31) * Math.exp(-db * 0.8) * 0.9;

  // Divided by rather less than the sum of the amplitudes: the sines are
  // independent, so the sum behaves like a random walk and dividing by the
  // worst case would flatten the field into grey.
  return n / 2.35;
}

/**
 * A very low-frequency swell over the top, so whole regions of the field sit
 * closer to the viewer than others rather than the brightness being evenly
 * scattered. This is what gives the surface depth.
 */
function depth(u: number, v: number, t: number) {
  const d =
    Math.sin(u * 2.1 - v * 1.3 + t * 0.045) * 0.6 +
    Math.sin(v * 1.7 + t * 0.031) * 0.4;
  return 0.88 + d * 0.14;
}

/**
 * Animated halftone field.
 *
 * Thousands of dots on an underlying grid, each one sized and lit by the
 * height of a slowly deforming surface beneath it. Ridges bloom into large
 * bright dots, troughs fall away to near-invisible specks, and the ridges
 * travel — so the field reads as one breathing object rather than as
 * particles moving independently.
 *
 * One canvas, no DOM per dot, one rAF loop, parked whenever the tab is hidden
 * or the viewer has asked for reduced motion.
 */
export function HalftoneField({ theme }: HalftoneFieldProps) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const themeRef = React.useRef(theme);
  themeRef.current = theme;
  const repaint = React.useRef<() => void>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let cols = 0;
    let rows = 0;
    let pitch = PITCH;

    // Preallocated per level: x, y, r triples, plus a live count. Reusing
    // these each frame keeps the loop allocation-free.
    let xs: Float32Array[] = [];
    let counts = new Int32Array(LEVELS);

    const allocate = () => {
      const perLevel = cols * rows;
      xs = Array.from({ length: LEVELS }, () => new Float32Array(perLevel * 3));
    };

    const measure = () => {
      const w = host.offsetWidth;
      const h = host.offsetHeight;
      if (w === 0 || h === 0) return false;
      const nextDpr = clamp(window.devicePixelRatio || 1, 1, 2.5);
      if (w === width && h === height && nextDpr === dpr) return true;

      width = w;
      height = h;
      dpr = nextDpr;

      pitch = PITCH;
      if (Math.ceil(w / pitch) * Math.ceil(h / pitch) > MAX_DOTS) {
        pitch = Math.sqrt((w * h) / MAX_DOTS);
      }
      cols = Math.ceil(w / pitch) + 1;
      rows = Math.ceil(h / pitch) + 1;

      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      allocate();
      return true;
    };

    const draw = (seconds: number) => {
      const { dot, floor, peak, threshold } = PALETTE[themeRef.current];
      const w = width * dpr;
      const h = height * dpr;
      ctx.clearRect(0, 0, w, h);
      counts.fill(0);

      const span = peak - floor;
      const range = 1 - threshold;
      // Both axes measured in widths, so the waves stay round on a tall frame.
      const scale = 1 / width;
      const halfV = height * scale * 0.5;

      for (let row = 0; row < rows; row++) {
        const by = row * pitch;
        const v = by * scale;
        const wobbleY = Math.cos(v * 6 - seconds * 0.17) * DRIFT;
        const dv = (v - halfV) / halfV;
        const dv2 = dv * dv;
        for (let col = 0; col < cols; col++) {
          const bx = col * pitch;
          const u = bx * scale;

          // Calm the middle. The pass sits there, and the reference keeps
          // large dark areas of its own rather than lighting up evenly.
          const du = (u - 0.5) * 2;
          const dc = Math.sqrt(du * du + dv2);
          const e = clamp((dc - 0.12) / 0.82, 0, 1);
          const vignette = 0.42 + 0.58 * (e * e * (3 - 2 * e));

          const n = surface(u, v, seconds);
          const lit = (n * 0.5 + 0.5) * depth(u, v, seconds) * vignette;

          let alpha = floor;
          let radius = MIN_R;
          let pull = 0;

          if (lit > threshold) {
            const k = (lit - threshold) / range;
            // Steep enough that the troughs stay black while the ridges
            // saturate, rather than the whole field turning to grey wash.
            const bright = k > 1 ? 1 : Math.pow(k, 1.45);
            alpha = floor + bright * span;
            radius = MIN_R + Math.pow(bright, 0.75) * (MAX_R - MIN_R);
            pull = bright;
          }

          if (alpha < ALPHA_CUTOFF) continue;

          // Ridges pull their dots together, which is what makes the grid look
          // draped over something rather than ruled.
          const x =
            bx + Math.sin(v * 7 + seconds * 0.21) * DRIFT + n * pull * 3.4;
          const y = by + wobbleY + n * pull * 3.4;

          const level =
            alpha <= floor
              ? 0
              : clamp(
                  Math.round(((alpha - floor) / span) * (LEVELS - 1)),
                  0,
                  LEVELS - 1,
                );
          const i = counts[level] * 3;
          const store = xs[level];
          store[i] = x * dpr;
          store[i + 1] = y * dpr;
          store[i + 2] = radius * dpr;
          counts[level]++;
        }
      }

      for (let level = 0; level < LEVELS; level++) {
        const n = counts[level];
        if (n === 0) continue;
        const alpha =
          level === 0 ? floor : floor + (level / (LEVELS - 1)) * span;
        ctx.fillStyle = `rgba(${dot},${alpha.toFixed(3)})`;
        ctx.beginPath();
        const store = xs[level];
        for (let d = 0; d < n; d++) {
          const i = d * 3;
          const r = store[i + 2];
          ctx.moveTo(store[i] + r, store[i + 1]);
          ctx.arc(store[i], store[i + 1], r, 0, Math.PI * 2);
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
        // Still render — a frozen field is the reduced-motion result, not a
        // blank screen.
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
