export type TopNavLink = {
  sectionId: string;
  hash: `#${string}`;
  label: string;
  mapOnly?: boolean;
};

/** Document order of primary in-page nav targets (excludes hero `#dashboard`). */
export const TOP_NAV_LINKS: readonly TopNavLink[] = [
  { sectionId: "ranking", hash: "#ranking", label: "Ranking" },
  { sectionId: "detail", hash: "#detail", label: "Dettaglio" },
  { sectionId: "city-map", hash: "#city-map", label: "Mappa", mapOnly: true },
  { sectionId: "contesto", hash: "#contesto", label: "Contesto" },
  { sectionId: "methodology", hash: "#methodology", label: "Metodo" },
  { sectionId: "coverage", hash: "#coverage", label: "Copertura" },
  { sectionId: "data", hash: "#data", label: "Dati" }
] as const;

export function topNavLinksForPage(mapPanelOpen: boolean): TopNavLink[] {
  return TOP_NAV_LINKS.filter((link) => !link.mapOnly || mapPanelOpen);
}

export function sectionIdFromHash(hash: string): string | null {
  const trimmed = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!trimmed) return null;
  return TOP_NAV_LINKS.some((link) => link.sectionId === trimmed) ? trimmed : null;
}

export function pickActiveSectionFromIntersections(
  sectionOrder: readonly string[],
  intersectionById: ReadonlyMap<string, { isIntersecting: boolean }>
): string | null {
  let active: string | null = null;
  for (const sectionId of sectionOrder) {
    if (intersectionById.get(sectionId)?.isIntersecting) {
      active = sectionId;
    }
  }
  return active;
}

export function resolveActiveNavSection(
  sectionOrder: readonly string[],
  intersectionById: ReadonlyMap<string, { isIntersecting: boolean }>,
  options: { hashSectionId: string | null; hashPinned: boolean }
): string | null {
  const fromSpy = pickActiveSectionFromIntersections(sectionOrder, intersectionById);
  if (options.hashPinned && options.hashSectionId) {
    return options.hashSectionId;
  }
  return fromSpy ?? options.hashSectionId;
}
