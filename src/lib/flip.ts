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

/**
 * A balanced S-curve. Deliberately not one of the heavily front-loaded
 * "expressive" curves: those spend the back half of the duration covering the
 * last few percent of the distance, which the eye reads as the card sticking
 * on the way in rather than as a long elegant settle.
 */
export const EASE_PASS = "cubic-bezier(0.4, 0, 0.2, 1)";

/**
 * Overshoot for the growth. Carried only by the card's transform: the scale
 * runs a few percent past its final size and settles back, which is the pop.
 * Opacity and radius stay on the smooth curve — an overshoot there has nothing
 * to overshoot into.
 */
const EASE_POP = "cubic-bezier(0.34, 1.4, 0.64, 1)";

export const OPEN_DURATION = 5000;
/** Leaving is always quicker than arriving — the card is already understood. */
export const CLOSE_DURATION = 240;

/**
 * The rest of the entrance is scaled against OPEN_DURATION rather than fixed,
 * so the scrim and the content stay choreographed with the growth instead of
 * snapping in while the card is still on its way.
 */
const OVERLAY_FADE = Math.round(OPEN_DURATION * 0.64);
const SECTION_DURATION = Math.round(OPEN_DURATION * 0.58);
const SECTION_DELAY = Math.round(OPEN_DURATION * 0.18);
const SECTION_STAGGER = Math.round(OPEN_DURATION * 0.076);
const REDUCED_DURATION = 140;
/** How long a live tilt takes to flatten out as the card leaves. */
const TILT_RELEASE = 240;

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
 * Everything the close transition needs to start from wherever the card
 * actually is right now, rather than from where a finished open would have
 * left it. Without this, closing mid-open snaps the card out to full size for
 * a frame before it starts shrinking.
 */
interface Snapshot {
  flip: string;
  backdropOpacity: string;
  backdropRadius: string;
  overlayOpacity: string;
  sections: Array<{ opacity: string; transform: string }>;
  tilt: string[];
}

function snapshot(targets: FlipTargets): Snapshot {
  const read = (el: HTMLElement) => getComputedStyle(el);
  const backdrop = read(targets.backdrop);
  return {
    flip: read(targets.flip).transform,
    backdropOpacity: backdrop.opacity,
    backdropRadius: backdrop.borderRadius,
    overlayOpacity: read(targets.overlay).opacity,
    sections: targets.sections.map((section) => {
      const style = read(section);
      return { opacity: style.opacity, transform: style.transform };
    }),
    tilt: targets.tiltNodes.map((node) => read(node).transform),
  };
}

/**
 * Put the card back into its resting layout before measuring. A half-finished
 * transition or a live tilt rotation would otherwise poison the geometry,
 * since both affect the descendant QR's client rect.
 */
function reset(targets: FlipTargets) {
  const { flip, backdrop, overlay, sections, tiltNodes } = targets;
  for (const node of [flip, backdrop, overlay, ...sections, ...tiltNodes]) {
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

interface SettleOptions {
  /** Resting state that differs from the element's declared CSS. */
  commit?: () => void;
  /**
   * Whether to drop the animations' held values once they finish. Only safe
   * when the resting state matches the declared CSS — on the way out it does
   * not, and releasing would flash the fully open card for however many frames
   * it takes React to unmount the tree.
   */
  release?: boolean;
}

async function settle(
  animations: Animation[],
  { commit, release = true }: SettleOptions = {},
) {
  await Promise.allSettled(animations.map((a) => a.finished));
  commit?.();
  if (!release) return;
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

  const commit = () => {
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
      { commit },
    );
  }

  const geometry = solve(flip, qr, sourceRect);
  const startRadius = TILE_RADIUS / geometry.scale;

  const animations = [
    play(overlay, [{ opacity: 0 }, { opacity: 1 }], {
      duration: OVERLAY_FADE,
    }),
    play(flip, [{ transform: transformOf(geometry) }, { transform: "none" }], {
      duration: OPEN_DURATION,
      easing: EASE_POP,
    }),
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
        {
          duration: SECTION_DURATION,
          delay: SECTION_DELAY + index * SECTION_STAGGER,
        },
      ),
    ),
  ];

  return settle(animations, { commit });
}

export function animateClose(
  targets: FlipTargets,
  sourceRect: DOMRect,
  reducedMotion: boolean,
): Promise<void> {
  const { flip, backdrop, qr, overlay, sections, tiltNodes } = targets;

  // Read where the card is before reset() erases it.
  const from = snapshot(targets);
  reset(targets);

  if (reducedMotion) {
    return settle(
      [
        play(overlay, [{ opacity: from.overlayOpacity }, { opacity: 0 }], {
          duration: REDUCED_DURATION,
        }),
        play(flip, [{ opacity: 1 }, { opacity: 0 }], {
          duration: REDUCED_DURATION,
        }),
      ],
      { release: false },
    );
  }

  const geometry = solve(flip, qr, sourceRect);
  const endRadius = TILE_RADIUS / geometry.scale;

  const animations = [
    play(overlay, [{ opacity: from.overlayOpacity }, { opacity: 0 }], {
      duration: CLOSE_DURATION,
    }),
    play(
      flip,
      [{ transform: from.flip }, { transform: transformOf(geometry) }],
      { duration: CLOSE_DURATION },
    ),
    play(
      backdrop,
      [
        { opacity: from.backdropOpacity, borderRadius: from.backdropRadius },
        {
          opacity: from.backdropOpacity,
          borderRadius: from.backdropRadius,
          offset: 0.4,
        },
        { opacity: 0, borderRadius: `${endRadius.toFixed(1)}px` },
      ],
      { duration: CLOSE_DURATION },
    ),
    // Content leaves first and fast, so the card is a clean surface by the
    // time it has shrunk back into the tile.
    ...sections.map((section, index) =>
      play(
        section,
        [
          { opacity: from.sections[index].opacity, transform: from.sections[index].transform },
          { opacity: 0, transform: "translateY(6px)" },
        ],
        { duration: 150 },
      ),
    ),
    // Ease any live tilt back to flat instead of letting the engine's stop
    // snap it, which pops the card square in a single frame.
    ...tiltNodes.flatMap((node, index) =>
      from.tilt[index] && from.tilt[index] !== "none"
        ? [
            play(node, [{ transform: from.tilt[index] }, { transform: "none" }], {
              duration: TILT_RELEASE,
            }),
          ]
        : [],
    ),
  ];

  return settle(animations, { release: false });
}
