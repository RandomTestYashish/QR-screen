/**
 * Shared-element (FLIP) transition between the compact tile and the pass card.
 *
 * The transform is solved from the two *QR* boxes rather than from the two
 * card boxes. That is the whole trick: the QR is the object the eye tracks, so
 * pinning it to a pixel-exact match at t=0 makes the card read as the same
 * physical thing expanding. Because both boxes are square the scale stays
 * uniform — no non-uniform stretch, no counter-scaling of text.
 *
 * Only transform, opacity and border-radius are animated. Nothing here
 * touches layout.
 */

export const EASE_PASS = "cubic-bezier(0.2, 0, 0, 1)";
export const OPEN_DURATION = 560;
export const CLOSE_DURATION = 440;
const REDUCED_DURATION = 160;

/** Radius of the compact tile, matched at the start of the growth. */
const TILE_RADIUS = 24;
const CARD_RADIUS = 28;

export interface FlipTargets {
  /** Wrapper that carries the translate/scale. Same box as the card. */
  flip: HTMLElement;
  /** The painted card surface — gradient, glitter, edge. Fades in. */
  backdrop: HTMLElement;
  /** The modal's QR box. Measured, never animated. */
  qr: HTMLElement;
  overlay: HTMLElement;
  /** Content that settles in behind the QR, in stagger order. */
  sections: HTMLElement[];
  /** Nodes the tilt engine writes to. Zeroed before any measurement. */
  tiltNodes: HTMLElement[];
}

interface Geometry {
  scale: number;
  dx: number;
  dy: number;
}

/**
 * Put the card back into its resting layout before measuring. A half-finished
 * transition or a live tilt rotation would otherwise poison the geometry,
 * since both affect the descendant QR's client rect.
 */
function reset(targets: FlipTargets) {
  const { flip, backdrop, overlay, sections, tiltNodes } = targets;
  for (const node of [flip, backdrop, overlay, ...sections]) {
    for (const animation of node.getAnimations()) animation.cancel();
  }
  flip.style.transform = "";
  for (const node of tiltNodes) node.style.transform = "";
}

function solve(flip: HTMLElement, qr: HTMLElement, source: DOMRect): Geometry {
  const flipRect = flip.getBoundingClientRect();
  const qrRect = qr.getBoundingClientRect();

  const scale = source.width / qrRect.width;

  const originX = flipRect.left + flipRect.width / 2;
  const originY = flipRect.top + flipRect.height / 2;
  const qrX = qrRect.left + qrRect.width / 2;
  const qrY = qrRect.top + qrRect.height / 2;
  const targetX = source.left + source.width / 2;
  const targetY = source.top + source.height / 2;

  // `translate(d) scale(s)` about the centre maps a local point p to
  // d + s*p, so solve d such that the QR centre lands on the tile's.
  return {
    scale,
    dx: targetX - originX - scale * (qrX - originX),
    dy: targetY - originY - scale * (qrY - originY),
  };
}

const transformOf = ({ scale, dx, dy }: Geometry) =>
  `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${scale.toFixed(4)})`;

function play(
  element: HTMLElement,
  keyframes: Keyframe[],
  options: KeyframeAnimationOptions,
) {
  return element.animate(keyframes, {
    easing: EASE_PASS,
    fill: "both",
    ...options,
  });
}

/**
 * Waits for every animation to settle, commits whatever the resting state
 * should be, then releases the held values. Anything whose rest state differs
 * from its declared CSS — the overlay starts at opacity 0 inline — has to be
 * committed here, or cancelling would snap it back to the entry state.
 */
async function settle(animations: Animation[], commit?: () => void) {
  await Promise.allSettled(animations.map((a) => a.finished));
  commit?.();
  for (const animation of animations) {
    if (animation.playState !== "idle") animation.cancel();
  }
}

export function animateOpen(
  targets: FlipTargets,
  sourceRect: DOMRect,
  reducedMotion: boolean,
): Promise<void> {
  const { flip, backdrop, qr, overlay, sections } = targets;

  reset(targets);

  const settled = () => {
    overlay.style.opacity = "1";
  };

  if (reducedMotion) {
    return settle(
      [
        play(overlay, [{ opacity: 0 }, { opacity: 1 }], {
          duration: REDUCED_DURATION,
        }),
        play(flip, [{ opacity: 0 }, { opacity: 1 }], {
          duration: REDUCED_DURATION,
        }),
      ],
      settled,
    );
  }

  const geometry = solve(flip, qr, sourceRect);
  const startRadius = TILE_RADIUS / geometry.scale;

  const animations = [
    play(overlay, [{ opacity: 0 }, { opacity: 1 }], { duration: 400 }),
    play(
      flip,
      [{ transform: transformOf(geometry) }, { transform: "none" }],
      { duration: OPEN_DURATION },
    ),
    play(
      backdrop,
      [
        { opacity: 0, borderRadius: `${startRadius.toFixed(1)}px` },
        { opacity: 1, borderRadius: `${CARD_RADIUS}px`, offset: 0.46 },
        { opacity: 1, borderRadius: `${CARD_RADIUS}px` },
      ],
      { duration: OPEN_DURATION },
    ),
    ...sections.map((section, index) =>
      play(
        section,
        [
          { opacity: 0, transform: "translateY(10px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 360, delay: 140 + index * 40 },
      ),
    ),
  ];

  return settle(animations, settled);
}

export function animateClose(
  targets: FlipTargets,
  sourceRect: DOMRect,
  reducedMotion: boolean,
): Promise<void> {
  const { flip, backdrop, qr, overlay, sections } = targets;

  reset(targets);

  if (reducedMotion) {
    return settle([
      play(overlay, [{ opacity: 1 }, { opacity: 0 }], {
        duration: REDUCED_DURATION,
      }),
      play(flip, [{ opacity: 1 }, { opacity: 0 }], {
        duration: REDUCED_DURATION,
      }),
    ]);
  }

  const geometry = solve(flip, qr, sourceRect);
  const endRadius = TILE_RADIUS / geometry.scale;

  const animations = [
    play(overlay, [{ opacity: 1 }, { opacity: 0 }], {
      duration: CLOSE_DURATION,
    }),
    play(
      flip,
      [{ transform: "none" }, { transform: transformOf(geometry) }],
      { duration: CLOSE_DURATION },
    ),
    play(
      backdrop,
      [
        { opacity: 1, borderRadius: `${CARD_RADIUS}px` },
        { opacity: 1, borderRadius: `${CARD_RADIUS}px`, offset: 0.4 },
        { opacity: 0, borderRadius: `${endRadius.toFixed(1)}px` },
      ],
      { duration: CLOSE_DURATION },
    ),
    // Content leaves first and fast, so the card is a clean surface by the
    // time it has shrunk back into the tile.
    ...sections.map((section) =>
      play(
        section,
        [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: "translateY(6px)" },
        ],
        { duration: 180 },
      ),
    ),
  ];

  return settle(animations);
}
