import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router';

/** Starts each new route at the top; in-page hash navigation keeps its native behavior. */
export function RouteScrollReset() {
  const { pathname, search } = useLocation();
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname, search]);
  return null;
}
