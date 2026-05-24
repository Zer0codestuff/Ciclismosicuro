// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findSelectedRankingElement, scrollSelectedRankingIntoView } from "./scrollSelectedRanking";

describe("scrollSelectedRanking", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <section id="ranking">
        <div class="table-wrap">
          <table>
            <tbody>
              <tr><td>Alpha</td></tr>
              <tr class="selected-row"><td>Beta</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    `;
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("finds the desktop selected row", () => {
    expect(findSelectedRankingElement()?.textContent).toContain("Beta");
  });

  it("prefers the compact mobile card when present", () => {
    const ranking = document.getElementById("ranking")!;
    ranking.innerHTML = `
      <ol class="ranking-mobile-list">
        <li class="ranking-mobile-card">Alpha</li>
        <li class="ranking-mobile-card selected">Beta</li>
      </ol>
    `;

    expect(findSelectedRankingElement()?.textContent).toContain("Beta");
  });

  it("returns null when ranking section is missing", () => {
    document.getElementById("ranking")?.remove();
    expect(findSelectedRankingElement()).toBeNull();
    expect(scrollSelectedRankingIntoView()).toBe(false);
  });

  it("scrolls the selected element with nearest block and motion-safe behavior", () => {
    const row = findSelectedRankingElement()!;
    const scrollIntoView = vi.fn();
    row.scrollIntoView = scrollIntoView;

    expect(scrollSelectedRankingIntoView()).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth"
    });
  });
});
