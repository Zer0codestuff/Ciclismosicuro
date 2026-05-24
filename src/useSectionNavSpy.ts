import { useEffect, useState } from "react";
import { resolveActiveNavSection, sectionIdFromHash } from "./sectionNav";

const SECTION_NAV_ROOT_MARGIN = "-72px 0px -55% 0px";

/**
 * Tracks which in-page section should be marked active in `.top-nav`.
 * Hash navigation pins the target until the next intersection update (scroll spy).
 */
export function useSectionNavSpy(sectionOrder: readonly string[]): string | null {
  const [hashSectionId, setHashSectionId] = useState<string | null>(null);
  const [hashPinned, setHashPinned] = useState(false);
  const [intersectionById, setIntersectionById] = useState(
    () => new Map<string, { isIntersecting: boolean }>()
  );

  useEffect(() => {
    if (sectionOrder.length === 0) return;

    const syncHash = () => {
      const id = sectionIdFromHash(window.location.hash);
      if (!id || !sectionOrder.includes(id)) return;
      setHashSectionId(id);
      setHashPinned(true);
    };

    syncHash();
    window.addEventListener("hashchange", syncHash);
    return () => window.removeEventListener("hashchange", syncHash);
  }, [sectionOrder]);

  useEffect(() => {
    if (sectionOrder.length === 0 || typeof IntersectionObserver === "undefined") {
      return;
    }

    const nextIntersection = new Map<string, { isIntersecting: boolean }>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const sectionId = entry.target.id;
          if (!sectionId) continue;
          nextIntersection.set(sectionId, { isIntersecting: entry.isIntersecting });
        }
        setIntersectionById(new Map(nextIntersection));
        setHashPinned(false);
      },
      {
        root: null,
        rootMargin: SECTION_NAV_ROOT_MARGIN,
        threshold: [0, 0.15, 0.35, 0.55, 0.75, 1]
      }
    );

    for (const sectionId of sectionOrder) {
      const element = document.getElementById(sectionId);
      if (element) observer.observe(element);
    }

    return () => observer.disconnect();
  }, [sectionOrder]);

  return resolveActiveNavSection(sectionOrder, intersectionById, {
    hashSectionId,
    hashPinned
  });
}
