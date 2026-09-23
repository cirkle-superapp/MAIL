/**
 * CirkleLogo.tsx
 * -----------------------------------------------------------------------------
 * The CIRKLE brand mark — three Arabic-inspired interlocking cirkles arranged
 * in a triangle (Venn / triquetra pattern), with a small center seed dot.
 * The entire mark rotates 360° as a single unit over 30 seconds.
 *
 * Geometry (viewBox 0 0 100 100):
 *   top        circle  cx=50 cy=32 r=22
 *   bottom-l   circle  cx=32 cy=60 r=22
 *   bottom-r   circle  cx=68 cy=60 r=22
 *   center     dot     cx=50 cy=50 r=6  (filled)
 *
 * The three circles overlap each other (intersecting rings) — this is the
 * brand's signature: the name "CIRKLE" (دواير, "circles") is the visual.
 *
 * Gradient: gold → rose → teal (the three CIRKLE brand colors), applied to
 * both the ring strokes and the center dot fill.
 *
 * Animation: the whole <svg> rotates 360° over 30s (linear, infinite) via
 * framer-motion. Respects prefers-reduced-motion (framer-motion auto-disables
 * the animation).
 *
 * Source: github.com/fortleem/cirkle-ac8fabe4 — src/components/brand/CircleMark.tsx
 */

'use client'

import * as React from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface CirkleLogoProps {
  size?: number
  withText?: boolean
  className?: string
  textClassName?: string
  /** When false, the rotation is disabled (for static contexts). */
  animated?: boolean
}

export function CirkleLogo({
  size = 40,
  withText = false,
  className,
  textClassName,
  animated = true,
}: CirkleLogoProps) {
  // Each CirkleLogo instance gets a unique gradient-id suffix so multiple
  // logos on the same page don't clash on `url(#...)` references.
  const uid = React.useId().replace(/[:]/g, '')
  const gradId = `cirkle-grad-${uid}`

  const svg = (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="CIRKLE"
      className="shrink-0"
      style={{ filter: 'drop-shadow(0 2px 6px hsl(195 56% 23% / 0.15))' }}
      animate={animated ? { rotate: 360 } : false}
      transition={animated ? { duration: 30, repeat: Infinity, ease: 'linear' } : undefined}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(var(--gold))" />
          <stop offset="50%" stopColor="hsl(var(--rose))" />
          <stop offset="100%" stopColor="hsl(var(--teal))" />
        </linearGradient>
      </defs>
      {/* Three interlocking cirkles — the brand's signature triquetra pattern. */}
      <circle cx="50" cy="32" r="22" stroke={`url(#${gradId})`} strokeWidth="1.5" opacity="0.9" />
      <circle cx="32" cy="60" r="22" stroke={`url(#${gradId})`} strokeWidth="1.5" opacity="0.9" />
      <circle cx="68" cy="60" r="22" stroke={`url(#${gradId})`} strokeWidth="1.5" opacity="0.9" />
      {/* Center seed dot */}
      <circle cx="50" cy="50" r="6" fill={`url(#${gradId})`} />
    </motion.svg>
  )

  if (!withText) {
    return <span className={cn('inline-flex', className)}>{svg}</span>
  }

  return (
    <span
      className={cn('inline-flex items-center gap-2', className)}
      aria-label="CIRKLE"
      role="img"
    >
      {svg}
      <span
        className={cn(
          'font-display font-semibold tracking-tight',
          textClassName,
        )}
        style={{ fontSize: size * 0.5 }}
      >
        <span className="gradient-text-gold">CIRKLE</span>
      </span>
    </span>
  )
}

export default CirkleLogo
