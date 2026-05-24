import { describe, expect, it } from "vitest";
import {
  pickActiveSectionFromIntersections,
  resolveActiveNavSection,
  sectionIdFromHash,
  topNavLinksForPage
} from "./sectionNav";

describe("sectionNav", () => {
  it("maps known hashes to section ids", () => {
    expect(sectionIdFromHash("#ranking")).toBe("ranking");
    expect(sectionIdFromHash("#detail")).toBe("detail");
    expect(sectionIdFromHash("#contesto")).toBe("contesto");
    expect(sectionIdFromHash("methodology")).toBe("methodology");
    expect(sectionIdFromHash("#dashboard")).toBeNull();
    expect(sectionIdFromHash("")).toBeNull();
  });

  it("omits map link unless the map panel is open", () => {
    const closed = topNavLinksForPage(false).map((link) => link.sectionId);
    const open = topNavLinksForPage(true).map((link) => link.sectionId);

    expect(closed).not.toContain("city-map");
    expect(open).toContain("city-map");
    expect(closed.indexOf("detail")).toBeLessThan(closed.indexOf("contesto"));
  });

  it("picks the lowest visible section in document order", () => {
    const order = ["ranking", "detail", "contesto"];
    const intersections = new Map([
      ["ranking", { isIntersecting: true }],
      ["detail", { isIntersecting: true }],
      ["contesto", { isIntersecting: false }]
    ]);

    expect(pickActiveSectionFromIntersections(order, intersections)).toBe("detail");
  });

  it("prefers a pinned hash until scroll spy updates", () => {
    const order = ["ranking", "detail", "contesto"];
    const intersections = new Map([
      ["ranking", { isIntersecting: true }],
      ["detail", { isIntersecting: false }],
      ["contesto", { isIntersecting: false }]
    ]);

    expect(
      resolveActiveNavSection(order, intersections, {
        hashSectionId: "contesto",
        hashPinned: true
      })
    ).toBe("contesto");

    expect(
      resolveActiveNavSection(order, intersections, {
        hashSectionId: "contesto",
        hashPinned: false
      })
    ).toBe("ranking");
  });
});
