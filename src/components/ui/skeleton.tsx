import { cn } from "@/lib/utils"

/**
 * Skeleton — state-of-the-art loading placeholder with a shimmer sweep effect.
 * A light gradient sweeps across the element (premium, Linear/Stripe-style).
 * Uses the `.skeleton-shimmer` class defined in globals.css.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("skeleton-shimmer rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
