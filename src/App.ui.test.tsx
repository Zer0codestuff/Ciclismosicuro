import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import published from "../public/data/ranking.json";
import type { City, RankedCity, Weights } from "./types";
import { parseRankingPayload } from "./lib/payload";
import { encodeWeights } from "./lib/urlState";
import App, { DEFAULT_TITLE, Dashboard } from "./App";

vi.mock("./components/SiteChrome", () => ({ SiteHeader: () => null, SiteFooter: () => null }));
vi.mock("./components/AnalysisSection", () => ({ AnalysisSection: () => null }));
vi.mock("./components/MapSection", () => ({ MapSection: () => null }));
vi.mock("./components/MethodSection", () => ({ MethodSection: () => null }));
vi.mock("./components/Hero", () => ({
  Hero: ({ cities, onSelectCity }: { cities: City[]; onSelectCity: (id: string) => void }) => <button onClick={() => onSelectCity(cities[1].id)}>Select second city</button>
}));
vi.mock("./components/RankingSection", () => ({
  RankingSection: ({ weights, onWeightsChange }: { weights: Weights; onWeightsChange: (weights: Weights) => void }) => <>
    <output data-testid="weights">{encodeWeights(weights)}</output>
    <button onClick={() => onWeightsChange({ safety: 60, infrastructure: 0, traffic: 0, usage: 0, transit: 0, environment: 0 })}>Safety only</button>
  </>
}));
vi.mock("./components/CityProfile", () => ({
  CityProfile: ({ city }: { city: RankedCity }) => <section id="citta"><h2 id="city-title" tabIndex={-1}>{city.name}</h2></section>
}));

const payload = parseRankingPayload(published);
const safetyOnly: Weights = { safety: 60, infrastructure: 0, traffic: 0, usage: 0, transit: 0, environment: 0 };

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("dashboard navigation", () => {
  it("retries a failed dataset load through the visible recovery control", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => published }));
    render(<App />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Dataset non caricato"));
    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: payload.cities[0].name })).toBeVisible());
  });
  it("loads legacy city links with custom weights and updates the title", () => {
    const city = payload.cities.find((entry) => entry.name === "Forlì")!;
    window.history.replaceState(null, "", `/?city=forli&pesi=${encodeWeights(safetyOnly)}`);
    render(<Dashboard payload={payload} />);
    expect(screen.getByRole("heading", { name: city.name })).toBeVisible();
    expect(screen.getByTestId("weights")).toHaveTextContent(encodeWeights(safetyOnly));
    expect(document.title).toBe(`${city.name} · ${DEFAULT_TITLE}`);
    expect(new URLSearchParams(window.location.search).get("city")).toBe(city.id);
  });

  it("uses defaults for invalid deep links and malformed weights", () => {
    window.history.replaceState(null, "", "/?city=unknown&pesi=0-0-0-0-0-0");
    render(<Dashboard payload={payload} />);
    expect(screen.getByRole("heading", { name: payload.cities[0].name })).toBeVisible();
    expect(screen.getByTestId("weights")).toHaveTextContent(encodeWeights(payload.defaultWeights));
    expect(new URLSearchParams(window.location.search).get("pesi")).toBeNull();
  });

  it("pushes explicit city changes and replaces weight changes", () => {
    render(<Dashboard payload={payload} />);
    const push = vi.spyOn(window.history, "pushState");
    fireEvent.click(screen.getByRole("button", { name: "Select second city" }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: payload.cities[1].name })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Safety only" }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(new URLSearchParams(window.location.search).get("pesi")).toBe(encodeWeights(safetyOnly));
  });

  it("restores city, weights and title when browser history changes", async () => {
    render(<Dashboard payload={payload} />);
    const city = payload.cities[2];
    window.history.replaceState(null, "", `/?city=${city.id}&pesi=${encodeWeights(safetyOnly)}`);
    fireEvent(window, new PopStateEvent("popstate"));
    await waitFor(() => expect(screen.getByRole("heading", { name: city.name })).toBeVisible());
    expect(screen.getByTestId("weights")).toHaveTextContent(encodeWeights(safetyOnly));
    expect(document.title).toBe(`${city.name} · ${DEFAULT_TITLE}`);
    window.history.replaceState(null, "", `/?city=${payload.cities[0].id}`);
    fireEvent(window, new PopStateEvent("popstate"));
    expect(screen.getByTestId("weights")).toHaveTextContent(encodeWeights(payload.defaultWeights));
  });
});
