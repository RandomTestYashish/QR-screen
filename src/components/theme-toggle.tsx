import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/hooks/use-theme";

interface ThemeToggleProps {
  theme: Theme;
  onToggle: () => void;
}

/**
 * The two glyphs are stacked and cross-faded with a short counter-rotation, so
 * the switch itself reads as one object turning over rather than as an icon
 * being replaced.
 */
export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  const dark = theme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onToggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={!dark}
      className="relative -mr-2 overflow-hidden hover:bg-chip"
    >
      <span className="relative block size-4">
        <Moon
          aria-hidden="true"
          className="absolute inset-0 size-4 transition-[opacity,transform] duration-[420ms] ease-[var(--ease-pass)]"
          style={{
            opacity: dark ? 1 : 0,
            transform: dark ? "rotate(0deg) scale(1)" : "rotate(-60deg) scale(0.6)",
          }}
        />
        <Sun
          aria-hidden="true"
          className="absolute inset-0 size-4 transition-[opacity,transform] duration-[420ms] ease-[var(--ease-pass)]"
          style={{
            opacity: dark ? 0 : 1,
            transform: dark ? "rotate(60deg) scale(0.6)" : "rotate(0deg) scale(1)",
          }}
        />
      </span>
    </Button>
  );
}
