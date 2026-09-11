import { Moon, Sun } from "lucide-react";
import type { Theme } from "@/hooks/use-theme";

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

/**
 * Theme switch as a segmented pill.
 *
 * Both states are on show with a knob sliding between them, so the control
 * says what it does without a label — which matters on a screen that carries
 * almost no text. A lone icon in secondary ink was getting lost against the
 * near-black ground; the chip, the hairline edge and the knob give it
 * somewhere to sit in either theme.
 */
export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={!dark}
      className="relative flex h-8 w-14 items-center rounded-full bg-chip p-1 shadow-[inset_0_0_0_1px_var(--hairline)] backdrop-blur-[2px] outline-none transition-transform duration-200 ease-[var(--ease-pass)] active:scale-[0.96]"
    >
      <span
        aria-hidden="true"
        className="absolute left-1 top-1 size-6 rounded-full bg-ink/15 transition-transform duration-[420ms] ease-[var(--ease-pass)]"
        style={{ transform: dark ? "translateX(0px)" : "translateX(24px)" }}
      />
      <span className="relative z-10 grid size-6 place-items-center">
        <Moon
          aria-hidden="true"
          className="size-3.5 transition-colors duration-[420ms] ease-[var(--ease-pass)]"
          style={{ color: dark ? "var(--ink)" : "var(--ink-3)" }}
        />
      </span>
      <span className="relative z-10 grid size-6 place-items-center">
        <Sun
          aria-hidden="true"
          className="size-3.5 transition-colors duration-[420ms] ease-[var(--ease-pass)]"
          style={{ color: dark ? "var(--ink-3)" : "var(--ink)" }}
        />
      </span>
    </button>
  );
}
