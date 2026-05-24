import { scrollIntoViewOptions } from "./motion";

/** Selected desktop row or compact mobile card inside `#ranking`. */
export function findSelectedRankingElement(): HTMLElement | null {
  const ranking = document.getElementById("ranking");
  if (!ranking) return null;

  return (
    ranking.querySelector<HTMLElement>("tr.selected-row") ??
    ranking.querySelector<HTMLElement>("li.ranking-mobile-card.selected")
  );
}

/** Scroll the current ranking selection into view inside scrollable ancestors. */
export function scrollSelectedRankingIntoView(): boolean {
  const element = findSelectedRankingElement();
  if (!element) return false;

  element.scrollIntoView(
    scrollIntoViewOptions({
      block: "nearest",
      inline: "nearest"
    })
  );
  return true;
}
