import { Moon, Sun } from "lucide-react";
import type { Theme } from "@/hooks/use-theme";

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

/** Both halves are the same width, so the knob is a fixed slide. */
const SEGMENT = 80;

/**
 * Theme switch as a labelled segmented pill.
 *
 * Both states are on show — icon and word — with a knob sliding between them,
 * so the control says what it does and what it will do next without needing
 * to be discovered by tapping.
 */
export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const dark = theme === "dark";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={!dark}
      className="relative flex h-10 items-center rounded-full bg-chip p-1 shadow-[inset_0_0_0_1px_var(--hairline)] backdrop-blur-[2px] outline-none transition-transform duration-200 ease-[var(--ease-pass)] active:scale-[0.97]"
    >
      <span
        aria-hidden="true"
        className="absolute left-1 top-1 h-8 rounded-full bg-ink/[0.10] transition-transform duration-[420ms] ease-[var(--ease-pass)]"
        style={{
          width: SEGMENT,
          transform: dark ? "translateX(0px)" : `translateX(${SEGMENT}px)`,
        }}
      />
      <span
        className="relative z-10 flex h-8 items-center justify-center gap-2 transition-colors duration-[420ms] ease-[var(--ease-pass)]"
        style={{ width: SEGMENT, color: dark ? "var(--ink)" : "var(--ink-3)" }}
      >
        <Moon aria-hidden="true" className="size-3.5" />
        <span className="text-[13px] font-medium tracking-[-0.01em]">Dark</span>
      </span>
      <span
        className="relative z-10 flex h-8 items-center justify-center gap-2 transition-colors duration-[420ms] ease-[var(--ease-pass)]"
        style={{ width: SEGMENT, color: dark ? "var(--ink-3)" : "var(--ink)" }}
      >
        <Sun aria-hidden="true" className="size-3.5" />
        <span className="text-[13px] font-medium tracking-[-0.01em]">
          Light
        </span>
      </span>
    </button>
  );
}
