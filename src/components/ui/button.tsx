import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * shadcn/ui Button, retuned for this surface: no borders or fills by default,
 * 8pt padding steps, and a press response that reads as tactile rather than
 * as a web button.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 shrink-0 select-none whitespace-nowrap font-sans outline-none transition-[transform,color,background-color,opacity] duration-200 ease-[var(--ease-pass)] disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]",
  {
    variants: {
      variant: {
        ghost: "text-ink-2 hover:text-ink",
        quiet: "text-ink-3 hover:text-ink-2",
        surface:
          "bg-chip text-ink hover:bg-chip/80 backdrop-blur-[2px] rounded-full",
        bare: "text-ink",
      },
      size: {
        sm: "h-8 px-2 text-[13px]",
        md: "h-10 px-4 text-[13px]",
        icon: "size-10 rounded-full",
      },
    },
    defaultVariants: { variant: "ghost", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
