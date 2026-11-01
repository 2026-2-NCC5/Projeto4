import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router';

/** Starts each new route at the top; in-page hash navigation keeps its native behavior. */
export function RouteScrollReset() {
  const { pathname, search, hash } = useLocation();
  useLayoutEffect(() => {
    // Let the browser keep native anchor navigation, but disable its history
    // restoration so a route transition cannot reopen at the previous scroll.
    if (hash) return undefined;
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

    const reset = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    reset();
    // React Router and the browser may apply their own restoration after the
    // layout effect; repeat on the next frame to make the new page start at 0.
    const frame = window.requestAnimationFrame(reset);
    return () => window.cancelAnimationFrame(frame);
  }, [pathname, search, hash]);
  return null;
}
