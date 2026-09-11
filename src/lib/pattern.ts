/**
 * QR pattern model.
 *
 * The screen renders a *visual prototype*: a field of circular modules that is
 * QR-inspired but carries no payload and is not scannable.
 *
 * Everything downstream (QRGrid, QRTile, the modal, the refresh transition)
 * consumes the `PassPattern` shape below and nothing else. Swapping in real
 * encoding later means adding a second provider that fills the same shape —
 * no UI is rebuilt.
 *
 *   import QRCode from "some-qr-lib";
 *
 *   export const encodedProvider: PatternProvider = {
 *     id: "qr-v1",
 *     create(seed) {
 *       const qr = QRCode.create(seed, { errorCorrectionLevel: "M" });
 *       return { size: qr.modules.size, modules: [...], token: seed, ... };
 *     },
 *   };
 *
 * The renderer already draws an arbitrary `size`, so a real symbol drops
 * straight in. Only `GRID_SIZE` below is prototype-specific — and at 32 it
 * sits between a real version 3 (29) and version 4 (33), which is why the
 * function patterns here follow the real layout rather than being decorative.
 */

export const GRID_SIZE = 32;

/** Side of a finder pattern, in modules. Same as a real symbol. */
const FINDER = 7;
/** Side of the alignment pattern. */
const ALIGNMENT = 5;
/** Row and column carrying the timing pattern, as in a real symbol. */
const TIMING = 6;

export interface PassPattern {
  /** Modules per side. */
  readonly size: number;
  /** Row-major `size * size` booleans; true = filled module. */
  readonly modules: readonly boolean[];
  /** Human-readable credential shown on the card. */
  readonly token: string;
  /** Stable key so React can diff one pattern against the next. */
  readonly id: string;
  /** True once these modules actually encode something scannable. */
  readonly scannable: boolean;
}

export interface PatternProvider {
  readonly id: string;
  create(seed: number): PassPattern;
}

/** Small deterministic PRNG — same seed, same pattern. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOKEN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function makeToken(rand: () => number) {
  const block = (n: number) =>
    Array.from(
      { length: n },
      () => TOKEN_ALPHABET[Math.floor(rand() * TOKEN_ALPHABET.length)],
    ).join("");
  return `${block(4)}-${block(4)}`;
}

/** Top-left corner of each finder. */
function finderOrigins(size: number): ReadonlyArray<readonly [number, number]> {
  return [
    [0, 0],
    [0, size - FINDER],
    [size - FINDER, 0],
  ];
}

/**
 * Concentric square ring: solid outer ring, one clear ring, solid core. This is
 * what a real finder looks like, and drawn in circles it reads as a ring of
 * dots around a dot — the detail that makes the field legible as a code rather
 * than as noise.
 */
function concentric(row: number, col: number, side: number) {
  const edge = side - 1;
  const onOuter = row === 0 || col === 0 || row === edge || col === edge;
  // The clear ring is always exactly one module wide, so the core is inset by
  // two on every side: 3x3 inside a 7 finder, a single module inside a 5
  // alignment block.
  const inCore = row >= 2 && row <= edge - 2 && col >= 2 && col <= edge - 2;
  return onOuter || inCore;
}

type Reserved = Uint8Array;

const FREE = 0;
const SET = 1;
const BLANK = 2;

/**
 * Lays down everything that is structural rather than data: finders, their
 * quiet separators, the timing runs and the alignment block. The body is only
 * allowed into whatever is left, so the structure always survives a refresh.
 */
function layFunctionPatterns(size: number): Reserved {
  const cells: Reserved = new Uint8Array(size * size);
  const at = (row: number, col: number) => row * size + col;

  for (const [originRow, originCol] of finderOrigins(size)) {
    // Separator: a one-module quiet band around the finder.
    for (let row = originRow - 1; row <= originRow + FINDER; row++) {
      for (let col = originCol - 1; col <= originCol + FINDER; col++) {
        if (row < 0 || col < 0 || row >= size || col >= size) continue;
        cells[at(row, col)] = BLANK;
      }
    }
    for (let row = 0; row < FINDER; row++) {
      for (let col = 0; col < FINDER; col++) {
        cells[at(originRow + row, originCol + col)] = concentric(
          row,
          col,
          FINDER,
        )
          ? SET
          : BLANK;
      }
    }
  }

  // Timing: alternating modules running between the finders.
  for (let i = FINDER + 1; i < size - FINDER - 1; i++) {
    const on = i % 2 === 0;
    cells[at(TIMING, i)] = on ? SET : BLANK;
    cells[at(i, TIMING)] = on ? SET : BLANK;
  }

  // Alignment block, positioned as a real symbol places its last one.
  const centre = size - FINDER;
  const half = (ALIGNMENT - 1) / 2;
  for (let row = 0; row < ALIGNMENT; row++) {
    for (let col = 0; col < ALIGNMENT; col++) {
      const r = centre - half + row;
      const c = centre - half + col;
      if (r < 0 || c < 0 || r >= size || c >= size) continue;
      cells[at(r, c)] = concentric(row, col, ALIGNMENT) ? SET : BLANK;
    }
  }

  return cells;
}

/**
 * Prototype provider. Real function patterns, pseudo-random body.
 */
export const prototypeProvider: PatternProvider = {
  id: `prototype-${GRID_SIZE}x${GRID_SIZE}`,
  create(seed: number): PassPattern {
    const size = GRID_SIZE;
    const rand = mulberry32(seed);
    const cells = layFunctionPatterns(size);

    const modules = new Array<boolean>(size * size).fill(false);
    const free: number[] = [];
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === SET) modules[i] = true;
      else if (cells[i] === FREE) free.push(i);
    }

    // Density is measured against the cells actually available to the body, so
    // the field never collapses to sparse or reads as a solid block.
    let remaining = Math.round(free.length * (0.44 + rand() * 0.1));

    // Fisher-Yates over the free cells, then take the first `remaining`.
    for (let i = free.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [free[i], free[j]] = [free[j], free[i]];
    }
    for (const index of free) {
      if (remaining <= 0) break;
      modules[index] = true;
      remaining--;
    }

    return {
      size,
      modules,
      token: makeToken(rand),
      id: `${seed}`,
      scannable: false,
    };
  },
};

export function createPattern(
  seed: number = Math.floor(Math.random() * 0xffffffff),
  provider: PatternProvider = prototypeProvider,
): PassPattern {
  return provider.create(seed);
}
