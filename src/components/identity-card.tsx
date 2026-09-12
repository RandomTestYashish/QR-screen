import * as React from "react";
import { QRTile } from "@/components/qr/qr-tile";
import { GlitterSurface } from "@/components/surface/glitter-surface";
import avatarUrl from "@/assets/avatar.jpg";
import type { PassPattern } from "@/lib/pattern";
import type { Theme } from "@/hooks/use-theme";

interface IdentityCardProps {
  pattern: PassPattern;
  theme: Theme;
  qrRef: React.RefObject<HTMLDivElement | null>;
  qrHidden: boolean;
  onOpen: () => void;
}

/**
 * Card box, on the 8pt grid. 327 is the 375 viewport less a 24 margin either
 * side — the same width the modal card uses.
 */
export const CARD_WIDTH = 327;
export const CARD_HEIGHT = 160;
const AVATAR = 64;

/**
 * The pass as a landscape credential: holder on the left, code on the right.
 *
 * Only the QR panel is tappable. The card itself is a surface, not a control,
 * so the tap target and the shared element the modal grows from stay exactly
 * what they were.
 */
export const IdentityCard = React.forwardRef<
  HTMLButtonElement,
  IdentityCardProps
>(({ pattern, theme, qrRef, qrHidden, onOpen }, ref) => (
  <div
    className="pass-surface relative flex items-center rounded-[24px] p-4"
    style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
  >
    <GlitterSurface theme={theme} intensity={0.7} />

    <img
      src={avatarUrl}
      // Decorative: the holder's name sits immediately beside it, so
      // announcing the photo as well would just repeat the identity.
      alt=""
      width={AVATAR}
      height={AVATAR}
      className="relative z-10 shrink-0 rounded-full object-cover"
      style={{ width: AVATAR, height: AVATAR }}
    />

    <div className="relative z-10 ml-4 min-w-0 flex-1">
      <p className="text-[17px] font-semibold leading-[22px] tracking-[-0.02em] text-ink">
        Yashish Kapoor
      </p>
      <p className="mt-2 text-[13px] tabular-nums tracking-[0.04em] text-ink-2">
        99XXXXX37
      </p>
    </div>

    <QRTile
      ref={ref}
      className="ml-4"
      pattern={pattern}
      theme={theme}
      qrRef={qrRef}
      qrHidden={qrHidden}
      onOpen={onOpen}
    />
  </div>
));
IdentityCard.displayName = "IdentityCard";
