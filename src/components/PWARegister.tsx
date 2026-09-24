/**
 * PWARegister.tsx
 * -----------------------------------------------------------------------------
 * Tiny client-only component that registers the service worker (`/sw.js`) on
 * mount. Renders nothing — it's a side-effect component. Included by
 * SearchHome + SearchResults so the SW is active in every user-visible view.
 *
 * - Skips registration on environments without service worker support (SSR,
 *   old browsers).
 * - Failures are logged as a console.warn but never crash the app — the SW is
 *   an enhancement, not a requirement.
 */

'use client'

import { useEffect } from 'react'

export function PWARegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    // Register on idle to avoid competing with first-paint network requests.
    const register = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.info('[pwa] service worker registered', {
            scope: reg.scope,
            updateViaCache: reg.updateViaCache,
          })
        })
        .catch((err) => {
          console.warn('[pwa] service worker registration failed', err)
        })
    }
    if ('requestIdleCallback' in window) {
      ;(window as any).requestIdleCallback(register, { timeout: 2000 })
    } else {
      setTimeout(register, 1000)
    }
  }, [])
  return null
}

export default PWARegister
