import { useEffect, useRef, useState } from "react";

interface ScrollThresholdCartBarOptions {
  enabled: boolean;
  resetKey: string | number;
  revealThresholdVh?: number;
  blocked?: boolean;
  revealKey?: string | number;
}

/**
 * Shows the storefront cart bar after a fixed viewport-based scroll threshold.
 * The bar uses its own CSS transition rather than moving in direct proportion
 * to the scroll distance. Any upward scroll hides it again; scrolling down
 * beyond the threshold reveals it smoothly.
 */
export const useScrollThresholdCartBar = ({
  enabled,
  resetKey,
  revealThresholdVh = 0.5,
  blocked = false,
  revealKey,
}: ScrollThresholdCartBarOptions): boolean => {
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  const revealKeyRef = useRef(revealKey);

  useEffect(() => {
    visibleRef.current = false;
    setVisible(false);

    if (!enabled) return;

    let frame = 0;
    let previousScrollY = Math.max(0, window.scrollY);

    const updateVisibility = (nextVisible: boolean) => {
      if (nextVisible === visibleRef.current) return;
      visibleRef.current = nextVisible;
      setVisible(nextVisible);
    };

    const syncVisibility = () => {
      frame = 0;

      const currentScrollY = Math.max(0, window.scrollY);
      const scrollDelta = currentScrollY - previousScrollY;
      previousScrollY = currentScrollY;
      const revealThreshold = Math.max(1, window.innerHeight * revealThresholdVh);

      if (blocked || currentScrollY < revealThreshold) {
        updateVisibility(false);
        return;
      }

      if (scrollDelta < -2) {
        updateVisibility(false);
      } else if (scrollDelta > 2) {
        updateVisibility(true);
      }
    };

    const queueSync = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(syncVisibility);
    };

    window.addEventListener("scroll", queueSync, { passive: true });
    window.addEventListener("resize", queueSync);

    return () => {
      window.removeEventListener("scroll", queueSync);
      window.removeEventListener("resize", queueSync);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [blocked, enabled, resetKey, revealThresholdVh]);

  useEffect(() => {
    const revealChanged = revealKey !== revealKeyRef.current;
    revealKeyRef.current = revealKey;

    if (!enabled || blocked || !revealChanged) return;

    visibleRef.current = true;
    setVisible(true);
  }, [blocked, enabled, revealKey]);

  return visible;
};
