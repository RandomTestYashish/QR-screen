/**
 * QR pattern model.
 *
 * The screen currently renders a *visual prototype*: an 8x8 field of circular
 * modules that is QR-inspired but carries no payload and is not scannable.
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
 * The renderer already draws an arbitrary `size`, so a 21x21 version-1 symbol
 * drops straight in. Only `GRID_SIZE` below is prototype-specific.
 */

export const GRID_SIZE = 8;

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

/**
 * Anchors sit in three corners the way a real symbol's finder patterns do —
 * 2x2 at this scale — which is what makes the field read as "QR" at a glance.
 * The fourth corner is deliberately left open so the mark stays asymmetric.
 */
const ANCHORS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0, GRID_SIZE - 2],
  [GRID_SIZE - 2, 0],
];

function isAnchor(row: number, col: number) {
  return ANCHORS.some(
    ([r, c]) => row >= r && row < r + 2 && col >= c && col < c + 2,
  );
}

/**
 * A real symbol keeps a one-module quiet band around every finder. Reserving
 * the same band here stops the random body from growing into the anchors,
 * which is what lets them stay legible as anchors at 88px.
 */
function isSeparator(row: number, col: number) {
  if (isAnchor(row, col)) return false;
  return ANCHORS.some(
    ([r, c]) =>
      row >= r - 1 && row <= r + 2 && col >= c - 1 && col <= c + 2,
  );
}

/**
 * Prototype provider. Produces a balanced, legible field:
 * fixed corner anchors, an alignment accent near the open corner, and a
 * pseudo-random body held to ~46-56% density so it never reads as noise
 * or as a solid block.
 */
export const prototypeProvider: PatternProvider = {
  id: "prototype-8x8",
  create(seed: number): PassPattern {
    const rand = mulberry32(seed);
    const total = GRID_SIZE * GRID_SIZE;
    const modules = new Array<boolean>(total).fill(false);

    const free: number[] = [];
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const index = row * GRID_SIZE + col;
        if (isAnchor(row, col)) {
          modules[index] = true;
        } else if (!isSeparator(row, col)) {
          free.push(index);
        }
      }
    }

    // Alignment accent in the open corner: one module, inset by one.
    const accent = (GRID_SIZE - 2) * GRID_SIZE + (GRID_SIZE - 2);
    modules[accent] = true;

    // Density is measured against the cells actually available to the body,
    // so the field never collapses to sparse or reads as a solid block.
    let remaining = Math.round(free.length * (0.44 + rand() * 0.14));

    // Fisher-Yates over the free cells, then take the first `remaining`.
    for (let i = free.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [free[i], free[j]] = [free[j], free[i]];
    }
    for (const index of free) {
      if (remaining <= 0) break;
      if (modules[index]) continue;
      modules[index] = true;
      remaining--;
    }

    return {
      size: GRID_SIZE,
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
