import type { RefObject } from "react";
import { useEffect, useState } from "react";

interface ElementInViewportOptions {
  enabled: boolean;
  targetRef: RefObject<Element | null>;
}

/** Returns true while any part of the target element is inside the viewport. */
export const useElementInViewport = ({
  enabled,
  targetRef,
}: ElementInViewportOptions): boolean => {
  const [inViewport, setInViewport] = useState(false);

  useEffect(() => {
    setInViewport(false);
    if (!enabled) return;

    const target = targetRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      ([entry]) => setInViewport(Boolean(entry?.isIntersecting)),
      { threshold: 0.01 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [enabled, targetRef]);

  return inViewport;
};
