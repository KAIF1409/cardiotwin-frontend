import { useEffect, useState } from 'react'

/**
 * useIsMobile.js — reactive mobile detection for layout morphing.
 * One breakpoint (≤900px) drives the whole mobile shell: stacked layout,
 * slide-over sheets and the bottom navigation bar. Listens to live
 * media-query changes so rotating a tablet/desktop window re-syncs.
 */
const QUERY = '(max-width: 900px)'

export default function useIsMobile() {
  const [mobile, setMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches
  )

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = e => setMobile(e.matches)
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else mq.addListener(onChange) // legacy Safari
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange)
      else mq.removeListener(onChange)
    }
  }, [])

  return mobile
}

/** Non-reactive check (lazy useState initialisers). */
export const isMobileNow = () => typeof window !== 'undefined' && window.matchMedia(QUERY).matches
