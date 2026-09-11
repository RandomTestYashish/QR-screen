import * as React from "react";
import { QRTile } from "@/components/qr/qr-tile";
import { QRModal } from "@/components/qr-modal";
import { RefreshAction } from "@/components/refresh-action";
import { ThemeToggle } from "@/components/theme-toggle";
import { useTheme } from "@/hooks/use-theme";
import { createPattern } from "@/lib/pattern";
import { TiltEngine } from "@/lib/tilt";

export default function App() {
  const { theme, toggle } = useTheme();
  const [pattern, setPattern] = React.useState(() => createPattern());
  const [open, setOpen] = React.useState(false);
  const [sharedActive, setSharedActive] = React.useState(false);
  const [device, setDevice] = React.useState<HTMLDivElement | null>(null);

  const tileQrRef = React.useRef<HTMLDivElement>(null);
  const tileRef = React.useRef<HTMLButtonElement>(null);

  const refresh = React.useCallback(() => setPattern(createPattern()), []);

  const handleOpen = React.useCallback(() => {
    // Must ride the tap itself: iOS only grants the motion sensor from inside
    // a user gesture. A refusal is fine — the card falls back to pointer.
    void TiltEngine.requestSensorAccess();
    setOpen(true);
  }, []);

  return (
    <div ref={setDevice} className="device">
      {/* The whole screen is the pass. No wordmark, no headline, no metadata —
          the only text anywhere is inside the card you open. */}
      <main className="relative z-10 h-full">
        <div className="absolute right-6 top-6 z-20">
          <ThemeToggle theme={theme} onToggle={toggle} />
        </div>

        <div className="absolute inset-0 grid place-items-center">
          {/* This wrapper is exactly the tile's box, so the QR sits on the
              true centre of the screen and the refresh control hangs off it
              without pulling it off-centre. */}
          <div className="relative">
            <QRTile
              ref={tileRef}
              pattern={pattern}
              theme={theme}
              qrRef={tileQrRef}
              qrHidden={sharedActive}
              onOpen={handleOpen}
            />
            <div className="absolute left-1/2 top-full mt-6 -translate-x-1/2">
              <RefreshAction onRefresh={refresh} compact />
            </div>
          </div>
        </div>
      </main>

      <QRModal
        open={open}
        onOpenChange={setOpen}
        sourceRef={tileQrRef}
        triggerRef={tileRef}
        container={device}
        pattern={pattern}
        theme={theme}
        onRefresh={refresh}
        onSharedElementActive={setSharedActive}
      />
    </div>
  );
}
