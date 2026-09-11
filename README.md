# Access Pass

A premium mobile QR identity-card experience, built as a polished prototype.
Primary canvas is **375 × 812**.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

## Stack

React 19 · TypeScript · Vite · Tailwind CSS v4 · shadcn/ui (Radix) primitives ·
Lucide icons · self-hosted Sora. No animation or 3D library — the motion is
Web Animations API and CSS transforms throughout.

## What's here

```
src/
  lib/
    pattern.ts      QR pattern model + the prototype 8x8 provider
    flip.ts         shared-element (FLIP) transition between tile and card
    tilt.ts         device-orientation engine with smoothing + pointer fallback
  components/
    qr/qr-grid.tsx  circular-module renderer (size-agnostic)
    qr/qr-tile.tsx  the compact pass on the home screen
    pass-card.tsx   the expanded pass
    qr-modal.tsx    phase machine wiring Radix Dialog to the FLIP
    surface/glitter-surface.tsx   tilt-reactive iridescent glitter
    ui/             shadcn/ui button + dialog
```

## Bands, not modules

A 32x32 symbol is 1024 modules. Giving each one an SVG element was the obvious
build and the wrong one: it cost ~200ms of dead time between tapping the tile
and the card starting to grow, and ~130ms of style recalculation on every
refresh.

The modules are bucketed into six radial bands instead, and a band is the unit
of both geometry and animation. Each band is three `<path>` elements — the
modules staying put, the ones leaving, the ones arriving — so the whole field
is **eighteen nodes at any size**. An unchanged module is never re-animated and
never double-drawn: it sits in the `keep` layer at full opacity while the other
two carry the exchange.

Measured at 32x32, before and after: tap-to-growth 215ms -> ~49ms, worst frame
during a refresh 138ms -> 19ms, worst frame during a tilt sweep 83ms -> 35ms.

(An earlier attempt kept the card's DOM mounted between openings to dodge the
mount cost. It worked — 9ms — but Radix's modal semantics are mount-scoped, so
the home screen stayed permanently `aria-hidden`, focus never entered the
dialog and Tab escaped it. Reverted; the fix belongs in the node count.)

## QR motion

Four things move, none of them running at rest:

- **Assemble.** On first paint the tile's bands bloom outward from the centre
  over ~600ms. The card's QR deliberately has no assemble: it is carried in by
  the shared-element transition and must land whole on the frame the growth
  starts, or it would visibly fill in underneath it.
- **Two-phase refresh.** What is leaving clears out first and what is arriving
  lands behind it, each rippling from the centre — a regeneration rather than a
  crossfade. This runs on the home tile too, which previously swapped with no
  animation at all.
- **Specular sweep.** One radial gradient spans the whole grid in user space, so
  every module samples the same light and moving its centre is two attribute
  writes per frame rather than 64 recalculations. The highlight travels against
  the tilt the way a reflection does on foil. Driven by the same gated tilt
  engine, so it costs nothing when the card is still.
- **Ambient breath.** A slow swell travels out from the centre while nothing
  else is happening — six composited opacity animations, one per band, phase
  offset so it reads as a swell rather than the code blinking as one block.
  The trough is shallow (0.94) because it multiplies with the specular falloff;
  both dim, and stacked too deep they wash the modules out.
- **Credential.** The token fades and lifts as it regenerates.

The pass **rotates itself every 20 seconds**, the way a real single-use
credential would. A manual refresh resets the clock rather than being followed
moments later by an automatic one, and rotation pauses while the tab is hidden
so it neither burns cycles nor banks up a burst to replay on return.

## The QR is a visual prototype

It encodes nothing and is not scannable. The field is QR-*inspired*: three 2×2
corner anchors with a one-module quiet band around each (the way real finder
patterns are separated), one alignment accent in the open corner, and a
pseudo-random body held to 44–58% density. Every module is a circle; there are
no squares anywhere.

Real encoding drops in without touching the UI. Everything downstream consumes
`PassPattern` and nothing else, and `QRGrid` draws an arbitrary `size` from its
viewBox — so a 21×21 version-1 symbol renders at the same proportions. Add a
second `PatternProvider` (see the worked sketch at the top of `lib/pattern.ts`)
and pass it to `createPattern`.

## The tile → card transition

The FLIP transform is solved from the two **QR boxes**, not the two card boxes.
That is the whole trick: the QR is what the eye tracks, so pinning it to a
pixel-exact match at t=0 makes the card read as the same physical object
expanding. Both boxes are square, so the scale stays uniform — no stretch, no
counter-scaling of text.

Measured on the first animation frame: the card's QR sits at `x=48, y=372.9,
w=88`, against a tile QR of `x=48, y=372.94, w=88`.

Around that, the card surface fades up and its radius opens from the tile's 24px
(pre-divided by the scale, so it *reads* as 24px throughout), and the header,
details and refresh row settle in on a 34ms stagger. 520ms out, 320ms back, on
`cubic-bezier(0.4, 0, 0.2, 1)` — a balanced S-curve rather than one of the
heavily front-loaded "expressive" ones, which spend the back half of the
duration covering the last few percent of the distance and read as the card
sticking on the way in.

Closing starts from a **snapshot** of where the card actually is, not from where
a finished open would have left it, so interrupting the growth reverses from
that exact point instead of snapping out to full size first. The animations are
also held rather than released when the close ends — their resting state is not
the declared CSS, so dropping them would flash the fully open card for however
many frames React needs to unmount. A live tilt eases back to flat over 240ms
instead of being snapped square by the engine stopping.

Only `transform`, `opacity` and `border-radius` animate. Nothing touches layout.

## Tilt and glitter

`TiltEngine` runs one rAF loop that smooths `deviceorientation` into two
normalised axes, calibrating against however the phone was held when the card
opened. Subscribers write transforms straight to the DOM — no React state per
frame — and the loop **parks itself once the value converges**, so an idle card
costs nothing. Max rotation ±6°, max parallax 9px, exponential damping with a
deadzone. No sensor (or permission refused) falls back to pointer movement over
the card; `prefers-reduced-motion` parks the engine entirely.

The glitter is ~240 micro-flecks painted into the card's own surface, sized in
*device* pixels so the common fleck is a third of a CSS pixel on a 3× screen.
Each has a fixed facet angle; tilting changes which facets face the light, so
the reflected colour redistributes toward the tilt. There is no shimmer beam and
no sparkle loop — the draw is gated on a tilt delta, so nothing runs at rest.
The palette is mostly achromatic silver with a minority of restrained steel,
violet, gold and teal facets. The glitter sits on its own layer behind the QR
and never touches its contrast.

## Screens

The home screen carries no text at all — no wordmark, no headline, no metadata.
Just the pass on the exact centre of the screen, a refresh icon hanging below it
and a theme toggle in the corner. The refresh control is positioned off a
wrapper sized to the tile, so it cannot pull the QR off centre.

The card's dismiss control sits *outside* the card, centred 24px below it. It
has to be a sibling of the element carrying the FLIP transform rather than a
child: it must hold its place while the card scales. Transforms don't affect
layout, so the column stays put while the card grows out of the tile.

## Design system

**8pt grid** throughout — screen padding, card padding, type gaps, button
padding, section spacing. Card 327px wide (375 − 24 either side), modal QR 216,
tile 136 with an 88 QR.

**Sora only**, self-hosted as a variable font, 300–700. Hierarchy comes from
size, weight and italic rather than a second family. Sora ships no true italic,
so the few editorial accents use a synthesised oblique — which is why they're
used sparingly and at small sizes.

**Two hand-tuned themes**, not a mechanical inversion: dark is near-black
gradient with off-white type and white modules; light is warm paper with
graphite type, a cooler card and black modules. Both share one token set and
cross-fade over 420ms. The choice is resolved before first paint, so there is no
flash.

## Accessibility

Every control is labelled. The card is a Radix dialog — focus trap, escape,
outside-press, `aria-labelledby` and `aria-describedby` all come from the
primitive; only the motion is ours. Focus moves to the close button on open and
returns to the tile on close. Reduced motion swaps the FLIP for a 160ms fade and
stops the tilt engine.

## Notes

- Magic UI is deliberately not a dependency. The glitter is a Magic UI–style
  canvas particle surface, but tilt-reactivity and the idle-gating aren't
  something its components do, so it is written here rather than pulled in.
- Sensor permission is requested from inside the tap that opens the card (iOS
  requires a user gesture) and never blocks: a refusal just leaves the pointer
  fallback in play.
