import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { QRTile } from "@/components/qr/qr-tile";
import { QRModal } from "@/components/qr-modal";
import { RefreshAction } from "@/components/refresh-action";
import { ThemeToggle } from "@/components/theme-toggle";
import { PassMark } from "@/components/pass-mark";
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
      <main className="relative z-10 flex h-full flex-col px-6 pb-6 pt-6">
        <header className="flex h-10 shrink-0 items-center justify-between">
          <div className="flex items-center gap-2">
            <PassMark />
            <span className="eyebrow text-ink-2">Meridian</span>
          </div>
          <ThemeToggle theme={theme} onToggle={toggle} />
        </header>

        {/* Optically centred: less air above the hero than below it. */}
        <div className="min-h-6 flex-[0.85]" />

        <section>
          <p className="eyebrow text-ink-3">Identity</p>
          <h1 className="mt-2 text-[34px] font-semibold leading-[38px] tracking-[-0.035em] text-ink">
            Access{" "}
            <span className="font-light italic tracking-[-0.02em]">Pass</span>
          </h1>
          <p className="mt-2 max-w-[280px] text-[13px] font-light italic leading-5 text-ink-2">
            One credential, one entry.
          </p>
        </section>

        {/* Tile plus a meta spine: 136 + 24 + 167 = the full 327 column.
            The same two fields reappear inside the card, so opening the pass
            reads as the information reflowing rather than being replaced. */}
        <div className="mt-12 flex items-stretch gap-6">
          <QRTile
            ref={tileRef}
            pattern={pattern}
            theme={theme}
            qrRef={tileQrRef}
            qrHidden={sharedActive}
            onOpen={handleOpen}
          />
          <dl className="flex min-w-0 flex-1 flex-col justify-between">
            <div>
              <dt className="eyebrow text-ink-3">Tier</dt>
              <dd className="mt-2 text-[15px] font-semibold leading-5 tracking-[-0.01em] text-ink">
                Founding Member
              </dd>
            </div>
            <div>
              <dt className="eyebrow text-ink-3">Credential</dt>
              <dd
                key={pattern.id}
                className="mt-2 text-[15px] font-semibold leading-5 tabular-nums tracking-[0.06em] text-ink [animation:token-in_460ms_var(--ease-pass)]"
              >
                {pattern.token}
              </dd>
            </div>
          </dl>
        </div>

        <div className="mt-6">
          <RefreshAction onRefresh={refresh} />
        </div>

        <div className="min-h-12 flex-1" />

        <footer className="flex shrink-0 items-center justify-between border-t border-hairline pt-4">
          <span className="flex items-center gap-2 text-[12px] font-light text-ink-3">
            <ShieldCheck aria-hidden="true" className="size-3.5" />
            Verified device
          </span>
          <span className="eyebrow text-ink-3">Visual prototype</span>
        </footer>
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
