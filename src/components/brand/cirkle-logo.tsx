import * as React from "react";
import { cn } from "@/lib/utils";

interface CirkleLogoProps {
  size?: number;
  className?: string;
  withWordmark?: boolean;
  animated?: boolean;
  wordmarkClassName?: string;
  wordmarkText?: string;
  subText?: string;
}

/**
 * Cirkle (دواير) animated brand mark — the canonical logo.
 *
 * Three overlapping rings arranged in a triangle (top, bottom-left,
 * bottom-right) around a small filled center dot, stroked with a
 * sand-gold → rose → deep-teal gradient. The whole mark rotates a
 * full 360° over 30s on an infinite linear loop.
 */
export function CirkleLogo({
  size = 40,
  className,
  withWordmark = false,
  animated = true,
  wordmarkClassName,
  wordmarkText = "Cirkle",
  subText = "your connected world",
}: CirkleLogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className={cn("relative shrink-0", animated && "cirkle-rotate")}
        style={{ width: size, height: size }}
        aria-label="Cirkle logo"
        role="img"
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 100 100"
          fill="none"
          className="block"
        >
          <circle cx="50" cy="32" r="22" stroke="url(#cirkle-brand-grad)" strokeWidth="1.5" opacity="0.9" />
          <circle cx="32" cy="60" r="22" stroke="url(#cirkle-brand-grad)" strokeWidth="1.5" opacity="0.9" />
          <circle cx="68" cy="60" r="22" stroke="url(#cirkle-brand-grad)" strokeWidth="1.5" opacity="0.9" />
          <circle cx="50" cy="50" r="6" fill="url(#cirkle-brand-grad)" />
        </svg>
      </div>

      {withWordmark && (
        <div className={cn("flex flex-col leading-none", wordmarkClassName)}>
          <span className="font-display text-[1.05em] font-semibold tracking-tight gradient-text-gold">
            {wordmarkText}
          </span>
          <span className="text-[0.65em] text-muted-foreground -mt-0.5">{subText}</span>
        </div>
      )}
    </div>
  );
}

/** Compact static mark (no rotation) for tight spaces like the footer. */
export function CirkleMark({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className={className} aria-hidden>
      <circle cx="50" cy="32" r="22" stroke="url(#cirkle-brand-grad)" strokeWidth="1.5" opacity="0.9" />
      <circle cx="32" cy="60" r="22" stroke="url(#cirkle-brand-grad)" strokeWidth="1.5" opacity="0.9" />
      <circle cx="68" cy="60" r="22" stroke="url(#cirkle-brand-grad)" strokeWidth="1.5" opacity="0.9" />
      <circle cx="50" cy="50" r="6" fill="url(#cirkle-brand-grad)" />
    </svg>
  );
}

/**
 * Renders the shared SVG gradient defs ONCE for the whole app.
 * Uses `gradientUnits="userSpaceOnUse"` spanning 0,0 → 100,100 so the
 * gold→rose→teal sweep is global to every logo instance — making the
 * rotation visibly obvious (the gradient sweeps around with the mark).
 */
export function CirkleBrandDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden focusable="false" style={{ pointerEvents: "none" }}>
      <defs>
        <linearGradient
          id="cirkle-brand-grad"
          gradientUnits="userSpaceOnUse"
          x1="0"
          y1="0"
          x2="100"
          y2="100"
        >
          <stop offset="0%" stopColor="hsl(39 45% 57%)" />
          <stop offset="50%" stopColor="hsl(351 41% 56%)" />
          <stop offset="100%" stopColor="hsl(195 56% 23%)" />
        </linearGradient>
      </defs>
    </svg>
  );
}
