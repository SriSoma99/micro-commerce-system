import { useCallback, useEffect, useState } from "react";
import { parseRoute, type Route } from "../utils/route";

/** Current hash route, re-rendering on navigation (including the browser's back/forward buttons). */
export function useRoute(): { route: Route; navigate: (path: string, options?: { replace?: boolean }) => void } {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useCallback((path: string, options?: { replace?: boolean }) => {
    const target = `#${path.startsWith("/") ? path : `/${path}`}`;
    if (options?.replace) {
      // replaceState doesn't fire `hashchange`, so keep our own state in step.
      window.history.replaceState(null, "", target);
      setHash(target);
    } else {
      window.location.hash = target;
    }
  }, []);

  return { route: parseRoute(hash), navigate };
}
