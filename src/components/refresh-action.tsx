import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RefreshActionProps {
  onRefresh: () => void;
  /** Icon only, no label — for the bare home screen. */
  compact?: boolean;
  className?: string;
}

/**
 * One half-turn of the icon per press, accumulated — so repeated taps keep
 * rotating forward instead of snapping back. No spinner, no pending state:
 * the pattern is regenerated instantly, the rotation is just the receipt.
 */
export const RefreshAction = React.forwardRef<
  HTMLButtonElement,
  RefreshActionProps
>(({ onRefresh, compact = false, className }, ref) => {
  const [turns, setTurns] = React.useState(0);

  const handleClick = React.useCallback(() => {
    setTurns((t) => t + 1);
    onRefresh();
  }, [onRefresh]);

  return (
    <Button
      ref={ref}
      variant="ghost"
      size={compact ? "icon" : "md"}
      onClick={handleClick}
      aria-label="Refresh QR code"
      className={cn(compact ? "hover:bg-chip" : "gap-2 px-4 -mx-4", className)}
    >
      <RefreshCw
        aria-hidden="true"
        className="size-4"
        style={{
          transform: `rotate(${turns * 180}deg)`,
          transition: "transform 560ms var(--ease-pass)",
        }}
      />
      {!compact && (
        <span className="text-[13px] font-medium tracking-[-0.01em]">
          Refresh QR Code
        </span>
      )}
    </Button>
  );
});
RefreshAction.displayName = "RefreshAction";
