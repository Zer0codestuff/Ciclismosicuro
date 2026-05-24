/** Media query for users who request minimal animation (OS / browser setting). */
export const PREFERS_REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Whether the user prefers reduced motion; false when `matchMedia` is unavailable. */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia(PREFERS_REDUCED_MOTION_QUERY).matches;
}

/** Scroll behavior for programmatic scroll: instant when reduced motion is preferred. */
export function scrollMotionBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}

/** `scrollIntoView` options with motion-safe default `behavior`. */
export function scrollIntoViewOptions(
  options: Omit<ScrollIntoViewOptions, "behavior"> & { behavior?: ScrollBehavior } = {}
): ScrollIntoViewOptions {
  return {
    block: "start",
    ...options,
    behavior: options.behavior ?? scrollMotionBehavior()
  };
}
