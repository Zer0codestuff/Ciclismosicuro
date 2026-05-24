import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PREFERS_REDUCED_MOTION_QUERY,
  prefersReducedMotion,
  scrollIntoViewOptions,
  scrollMotionBehavior
} from "./motion";

function stubReducedMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === PREFERS_REDUCED_MOTION_QUERY ? matches : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  );
}

describe("motion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses smooth scroll when reduced motion is not preferred", () => {
    stubReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollMotionBehavior()).toBe("smooth");
    expect(scrollIntoViewOptions()).toEqual({ block: "start", behavior: "smooth" });
  });

  it("uses instant scroll when reduced motion is preferred", () => {
    stubReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollMotionBehavior()).toBe("auto");
    expect(scrollIntoViewOptions({ block: "nearest" })).toEqual({
      block: "nearest",
      behavior: "auto"
    });
  });

  it("respects an explicit behavior override", () => {
    stubReducedMotion(true);
    expect(scrollIntoViewOptions({ behavior: "smooth" })).toEqual({
      block: "start",
      behavior: "smooth"
    });
  });

  describe("without matchMedia", () => {
    beforeEach(() => {
      vi.stubGlobal("matchMedia", undefined as unknown as typeof window.matchMedia);
    });

    it("defaults to smooth scroll behavior", () => {
      expect(prefersReducedMotion()).toBe(false);
      expect(scrollMotionBehavior()).toBe("smooth");
    });
  });
});
