/**
 * ThemeToggle.tsx
 * -----------------------------------------------------------------------------
 * Light / dark theme toggle. The CIRKLE theme has a premium dark variant
 * (gold-on-charcoal + glass morphism) that's loaded via the `dark` class on
 * <html>. This component:
 *   - Reads the initial theme from localStorage `cirkle-theme` (set by the
 *     FOUC-prevention script in layout.tsx).
 *   - Toggles the `dark` class on documentElement.
 *   - Persists the choice.
 *   - Animates the icon swap (sun ↔ moon) with a rotation + crossfade via
 *     Framer Motion's AnimatePresence mode="wait" — the old icon rotates
 *     out + fades, the new icon rotates in + fades.
 *   - Subtle scale pulse on hover.
 *   - Respects prefers-reduced-motion (Framer Motion auto-disables
 *     transitions under reduced-motion via the useReducedMotion hook).
 */

'use client'

import * as React from 'react'
import { Moon, Sun } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  // The FOUC script in layout.tsx already applied the `dark` class if needed.
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = React.useState<Theme>('light')
  const [mounted, setMounted] = React.useState(false)
  const prefersReducedMotion = useReducedMotion() ?? false

  React.useEffect(() => {
    setMounted(true)
    setTheme(getInitialTheme())
  }, [])

  const toggle = React.useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark'
      try {
        if (next === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
        localStorage.setItem('cirkle-theme', next)
      } catch {
        // localStorage may be unavailable (private mode / SSR).
      }
      return next
    })
  }, [])

  // Before mount, render a placeholder with the same dimensions to avoid
  // layout shift + hydration mismatch.
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={cn('size-9 shrink-0', className)}
        aria-label="Toggle theme"
        disabled
      >
        <Sun className="size-4" aria-hidden />
      </Button>
    )
  }

  // The visible icon depends on the NEXT theme the user will get when they
  // click — the convention is to show the icon of what you'll switch TO.
  // Dark shown when in light mode (click → switch to dark); sun shown when
  // in dark mode (click → switch to light).
  const nextIsDark = theme !== 'dark'
  const iconKey = nextIsDark ? 'moon' : 'sun'

  // Rotation animations: sun exits by rotating +90deg + fading out; moon
  // enters by rotating from -90deg to 0deg + fading in. Reversed for the
  // other direction. Under reduced-motion, we skip the rotation entirely
  // and just crossfade.
  const enter = prefersReducedMotion
    ? { opacity: 0, scale: 0.7 }
    : { opacity: 0, scale: 0.7, rotate: -90 }
  const center = prefersReducedMotion
    ? { opacity: 1, scale: 1, rotate: 0 }
    : { opacity: 1, scale: 1, rotate: 0 }
  const exit = prefersReducedMotion
    ? { opacity: 0, scale: 0.7 }
    : { opacity: 0, scale: 0.7, rotate: 90 }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className={cn(
        'size-9 shrink-0 overflow-hidden',
        // Hover scale pulse — subtle, on the button itself (the icon
        // crossfade is handled separately so the two transforms don't
        // conflict; Framer Motion composes them via the icon's own
        // motion.div).
        'transition-transform duration-200 hover:scale-110 active:scale-95',
        className,
      )}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={iconKey}
          initial={enter}
          animate={center}
          exit={exit}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="inline-flex"
        >
          {nextIsDark ? (
            <Moon className="size-4" aria-hidden />
          ) : (
            <Sun className="size-4" aria-hidden />
          )}
        </motion.span>
      </AnimatePresence>
    </Button>
  )
}

export default ThemeToggle
