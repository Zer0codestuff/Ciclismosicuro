/// <reference types="vite/client" />
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { formatRankingRestoredAnnouncement, formatRankingUpdatedAnnouncement } from "./rankingWeightAnnouncement";
import { minimalRankingPayload, sampleCity } from "./fixtures/minimal-ranking";
import { buildCityComparison, formatRankDelta, formatScoreDelta } from "./cityComparison";
import { normalizeWeights, rankCities, DEFAULT_WEIGHTS } from "./scoring";
import { DEFAULT_DOCUMENT_TITLE } from "./pageTitle";
import type { RankingPayload } from "./types";

vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Bar: ({
    name,
    dataKey,
    onClick,
    "data-testid": testId,
    children
  }: {
    name?: string;
    dataKey?: string;
    onClick?: (data: { payload?: { city?: string } }, index: number, event: unknown) => void;
    "data-testid"?: string;
    children?: React.ReactNode;
  }) => (
    <div
      data-testid={testId ?? "bar-series"}
      data-series-name={name ?? ""}
      data-series-key={String(dataKey ?? "")}
    >
      {testId === "prime-12-bars" && onClick ? (
        <button
          type="button"
          data-testid="prime-12-bar-activate"
          onClick={() => onClick({ payload: { city: "Beta" } }, 1, {})}
        >
          Mock prime 12 bar
        </button>
      ) : null}
      {children}
    </div>
  ),
  Cell: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  XAxis: () => null,
  YAxis: () => null
}));

function resetCityUrlParam() {
  window.history.replaceState({}, "", window.location.pathname);
}

vi.mock("./CityMapPanel", () => ({
  CityMapPanel: ({
    cityName,
    onClose,
    returnFocusRef
  }: {
    cityName: string;
    onClose: () => void;
    returnFocusRef?: React.RefObject<HTMLElement | null>;
  }) => (
    <section
      className="city-map-section scroll-anchor"
      id="city-map"
      role="dialog"
      aria-modal="true"
      aria-labelledby="city-map-title"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        onClose();
        returnFocusRef?.current?.focus();
      }}
    >
      <h2 id="city-map-title">Infrastruttura ciclabile · {cityName}</h2>
      <button type="button" onClick={onClose}>
        Chiudi mappa
      </button>
    </section>
  )
}));

import { PREFERS_REDUCED_MOTION_QUERY } from "./motion";
import * as scrollSelectedRanking from "./scrollSelectedRanking";

const RANKING_COMPACT_MEDIA = "(max-width: 1180px)";

type MatchMediaPreferences = {
  compactRanking?: boolean;
  reducedMotion?: boolean;
};

function mockMatchMedia({
  compactRanking = false,
  reducedMotion = false
}: MatchMediaPreferences = {}) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches:
        (query === PREFERS_REDUCED_MOTION_QUERY && reducedMotion) ||
        (query === RANKING_COMPACT_MEDIA && compactRanking),
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

function mockCompactRankingViewport() {
  mockMatchMedia({ compactRanking: true });
}

function mockDesktopRankingViewport() {
  mockMatchMedia();
}

function mockReducedMotionPreference() {
  mockMatchMedia({ reducedMotion: true });
}

function mockRankingFetch(payload: RankingPayload = minimalRankingPayload) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("data/ranking.json")) {
        return {
          ok: true,
          json: async () => payload
        } as Response;
      }
      throw new Error(`Unexpected fetch: ${url}`);
    })
  );
}

describe("App dataset loading", () => {
  beforeEach(() => {
    mockDesktopRankingViewport();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    resetCityUrlParam();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows loading status before ranking data resolves", async () => {
    let resolveFetch!: () => void;
    const fetchDeferred = new Promise<Response>((resolve) => {
      resolveFetch = () =>
        resolve({
          ok: true,
          json: async () => minimalRankingPayload
        } as Response);
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(() => fetchDeferred)
    );

    render(<App />);

    const loading = screen.getByRole("status", { name: /Caricamento dati/i });
    expect(loading).toHaveAttribute("aria-busy", "true");
    expect(loading).toHaveTextContent(/Sto leggendo ranking/i);

    resolveFetch();

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });
  });

  it("shows alert with retry when fetch fails, then loads on retry", async () => {
    let attempt = 0;
    const fetchMock = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) {
        return { ok: false, status: 503 } as Response;
      }
      return {
        ok: true,
        json: async () => minimalRankingPayload
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/HTTP 503/i);
    });
    expect(screen.getByRole("button", { name: "Riprova" })).toBeInTheDocument();
    expect(screen.getByText(/npm run data/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Riprova" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("App city selection vs map", () => {
  beforeEach(() => {
    mockRankingFetch();
    mockDesktopRankingViewport();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    resetCityUrlParam();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("selects a city from the table without opening the map", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const rankingTable = document.getElementById("ranking")!;
    fireEvent.click(within(rankingTable).getByRole("button", { name: "Beta" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toHaveFocus();
    expect(document.getElementById("detail-selection-status")).toHaveTextContent(
      /Scheda aggiornata: Beta, posizione \d+ nel ranking/i
    );
    expect(screen.queryByRole("heading", { name: /Infrastruttura ciclabile · Beta/i })).not.toBeInTheDocument();
  });

  it("opens the map from the detail panel action", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const rankingTable = document.getElementById("ranking")!;
    fireEvent.click(within(rankingTable).getByRole("button", { name: "Beta" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Apri mappa" }));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: /Infrastruttura ciclabile · Beta/i })).toBeInTheDocument();
    });
  });

  it("closes the map on Escape and returns focus to Apri mappa", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const rankingTable = document.getElementById("ranking")!;
    fireEvent.click(within(rankingTable).getByRole("button", { name: "Beta" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });

    const openMapButton = screen.getByRole("button", { name: "Apri mappa" });
    fireEvent.click(openMapButton);

    const dialog = await screen.findByRole("dialog", { name: /Infrastruttura ciclabile · Beta/i });
    fireEvent.keyDown(dialog, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /Infrastruttura ciclabile · Beta/i })).not.toBeInTheDocument();
    });
    expect(openMapButton).toHaveFocus();
  });

  it("selects a city from top cards without opening the map", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const topCards = document.querySelector(".city-card-grid")!;
    const alphaCard = within(topCards as HTMLElement).getByRole("button", {
      name: /Seleziona Alpha, posizione 1/i
    });
    const betaCard = within(topCards as HTMLElement).getByRole("button", {
      name: /Seleziona Beta, posizione 2/i
    });

    expect(alphaCard).toHaveAttribute("aria-pressed", "true");
    expect(alphaCard).toHaveClass("selected");
    expect(betaCard).toHaveAttribute("aria-pressed", "false");
    expect(betaCard).not.toHaveClass("selected");

    fireEvent.click(betaCard);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });
    expect(betaCard).toHaveAttribute("aria-pressed", "true");
    expect(betaCard).toHaveClass("selected");
    expect(alphaCard).toHaveAttribute("aria-pressed", "false");
    expect(alphaCard).not.toHaveClass("selected");
    expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toHaveFocus();
    expect(screen.queryByRole("heading", { name: /Infrastruttura ciclabile · Beta/i })).not.toBeInTheDocument();
  });

  it("selects a city from the Prime 12 screen-reader list and updates detail", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    document.title = DEFAULT_DOCUMENT_TITLE;

    fireEvent.click(
      screen.getByRole("button", { name: /Seleziona Beta dal grafico Prime 12/i })
    );

    const detailSection = document.getElementById("detail")!;
    await waitFor(() => {
      expect(within(detailSection).getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });
    expect(document.title).toMatch(/Beta/);

    const topCards = document.querySelector(".city-card-grid")!;
    expect(
      within(topCards as HTMLElement).getByRole("button", { name: /Seleziona Beta, posizione 2/i })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("selects a city when clicking a Prime 12 chart bar", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    document.title = DEFAULT_DOCUMENT_TITLE;

    fireEvent.click(screen.getByTestId("prime-12-bar-activate"));

    const detailSection = document.getElementById("detail")!;
    await waitFor(() => {
      expect(within(detailSection).getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });
    expect(document.title).toMatch(/Beta/);
    expect(screen.getByTestId("prime-12-chart")).toBeInTheDocument();
  });

  it("does not move focus to the detail heading while the map dialog is open", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const openMapButton = screen.getByRole("button", { name: "Apri mappa" });
    fireEvent.click(openMapButton);

    await screen.findByRole("dialog", { name: /Infrastruttura ciclabile · Alpha/i });

    const rankingTable = document.getElementById("ranking")!;
    fireEvent.click(within(rankingTable).getByRole("button", { name: "Beta" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { level: 2, name: "Beta" })).not.toHaveFocus();
  });
});

describe("App ranking selection scroll", () => {
  beforeEach(() => {
    mockRankingFetch();
    mockDesktopRankingViewport();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    resetCityUrlParam();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("scrolls the selected desktop row into view when selecting from top cards", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const rankingSection = document.getElementById("ranking")!;
    const betaRow = within(rankingSection).getByRole("button", { name: "Beta" }).closest("tr")!;
    const rowScroll = vi.spyOn(betaRow, "scrollIntoView");

    const topCards = document.querySelector(".city-card-grid")!;
    fireEvent.click(
      within(topCards as HTMLElement).getByRole("button", {
        name: /Seleziona Beta, posizione 2/i
      })
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });

    expect(rowScroll).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth"
    });
  });

  it("scrolls the selected compact card into view on narrow viewports", async () => {
    mockCompactRankingViewport();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const rankingSection = document.getElementById("ranking")!;
    const mobileList = within(rankingSection).getByRole("list", { name: /ranking capoluoghi/i });
    const betaCard = within(mobileList).getByRole("button", { name: "Beta" }).closest("li")!;
    const cardScroll = vi.spyOn(betaCard, "scrollIntoView");

    const topCards = document.querySelector(".city-card-grid")!;
    fireEvent.click(
      within(topCards as HTMLElement).getByRole("button", {
        name: /Seleziona Beta, posizione 2/i
      })
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });

    expect(cardScroll).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth"
    });
  });

  it("uses instant ranking scroll when reduced motion is preferred", async () => {
    mockReducedMotionPreference();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const rankingSection = document.getElementById("ranking")!;
    const betaRow = within(rankingSection).getByRole("button", { name: "Beta" }).closest("tr")!;
    const rowScroll = vi.spyOn(betaRow, "scrollIntoView");

    const topCards = document.querySelector(".city-card-grid")!;
    fireEvent.click(
      within(topCards as HTMLElement).getByRole("button", {
        name: /Seleziona Beta, posizione 2/i
      })
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });

    expect(rowScroll).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
      behavior: "auto"
    });
  });

  it("does not scroll the ranking list when the selected city is hidden by filters", async () => {
    const scrollRanking = vi.spyOn(scrollSelectedRanking, "scrollSelectedRankingIntoView");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const rankingSection = document.getElementById("ranking")!;
    fireEvent.click(within(rankingSection).getByRole("button", { name: "Beta" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Cerca una città"), { target: { value: "zzz" } });

    await waitFor(() => {
      expect(
        within(document.getElementById("detail")!).getByText("Beta non è visibile con i filtri attuali.")
      ).toBeInTheDocument();
    });

    scrollRanking.mockClear();

    const topCards = document.querySelector(".city-card-grid")!;
    fireEvent.click(
      within(topCards as HTMLElement).getByRole("button", {
        name: /Seleziona Beta, posizione 2/i
      })
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toHaveFocus();
    });

    expect(scrollRanking).not.toHaveBeenCalled();
  });

  it("scrolls the ranking row after revealing a filter-hidden city in the table", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const rankingSection = document.getElementById("ranking")!;
    fireEvent.click(within(rankingSection).getByRole("button", { name: "Beta" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Cerca una città"), { target: { value: "zzz" } });

    const detail = document.getElementById("detail")!;
    await waitFor(() => {
      expect(within(detail).getByText("Beta non è visibile con i filtri attuali.")).toBeInTheDocument();
    });

    const rowScroll = vi.fn();
    vi.spyOn(scrollSelectedRanking, "scrollSelectedRankingIntoView").mockImplementation(() => {
      rowScroll();
      return true;
    });

    fireEvent.click(within(detail).getByRole("button", { name: "Mostra in tabella" }));

    await waitFor(() => {
      expect(within(rankingSection).getByRole("button", { name: "Beta" })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(rowScroll).toHaveBeenCalled();
    });
  });
});

describe("App accessible labels", () => {
  beforeEach(() => {
    mockRankingFetch();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    resetCityUrlParam();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exposes descriptive names on top city cards", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const topCards = document.querySelector(".city-card-grid")!;
    expect(
      within(topCards as HTMLElement).getByRole("button", { name: /Seleziona Alpha, posizione 1, punteggio/i })
    ).toBeInTheDocument();
    expect(
      within(topCards as HTMLElement).getByRole("button", { name: /Seleziona Beta, posizione 2, punteggio/i })
    ).toBeInTheDocument();
  });

  it("labels national context source links with publisher and card label", async () => {
    const contextPayload: RankingPayload = {
      ...minimalRankingPayload,
      nationalContext: {
        ...minimalRankingPayload.nationalContext,
        sections: [
          {
            id: "roadSafety",
            title: "Sicurezza test",
            description: "Sezione fixture per link contesto.",
            cards: [
              {
                id: "injuryCrashes2024",
                label: "Incidenti con feriti",
                value: 100,
                unit: "incidenti",
                period: "2024",
                sourceId: "lab24-piste-ciclabili-2024",
                reliability: "high",
                interpretation: "Valore di test.",
                caveat: "Solo fixture."
              }
            ]
          }
        ]
      }
    };
    mockRankingFetch(contextPayload);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Panorama Italia per i ciclisti" })).toBeInTheDocument();
    });

    const contesto = document.getElementById("contesto")!;
    expect(
      within(contesto).getByRole("link", { name: "Apri fonte: Lab24 — Incidenti con feriti" })
    ).toHaveAttribute("href", "https://example.com/piste");
  });
});

describe("App score reading legend", () => {
  beforeEach(() => {
    mockRankingFetch();
    mockDesktopRankingViewport();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    resetCityUrlParam();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens and closes the score reading legend with keyboard and lists key terms", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const rankingSection = document.getElementById("ranking")!;
    const toggle = within(rankingSection).getByRole("button", {
      name: /come si legge il punteggio/i
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    const panelId = toggle.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    const panel = document.getElementById(panelId!)!;
    expect(panel).toHaveAttribute("hidden");

    toggle.focus();
    fireEvent.keyDown(toggle, { key: "Enter" });

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(panel).not.toHaveAttribute("hidden");
    expect(within(panel).getByText(/20\*/)).toBeInTheDocument();
    expect(within(panel).getByText(/^contestuale:/)).toBeVisible();
    expect(within(panel).getByText(/^Confidenza:/)).toBeVisible();
    expect(within(panel).getByRole("link", { name: /metodologia e formula/i })).toHaveAttribute(
      "href",
      "#methodology"
    );
    expect(within(panel).getByRole("link", { name: /copertura per categoria/i })).toHaveAttribute(
      "href",
      "#coverage"
    );

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(panel).toHaveAttribute("hidden");
  });
});

describe("App ranking filters", () => {
  beforeEach(() => {
    mockRankingFetch();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    resetCityUrlParam();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lists ranked cities in the search datalist and selects on exact match", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const searchInput = screen.getByRole("combobox", { name: "Cerca città" });
    expect(searchInput).toHaveAttribute("list");
    expect(searchInput).toHaveAttribute("aria-autocomplete", "list");

    const datalistId = searchInput.getAttribute("list");
    expect(datalistId).toBeTruthy();
    const datalist = document.getElementById(datalistId!) as HTMLDataListElement;
    expect(datalist?.tagName).toBe("DATALIST");
    const optionValues = [...datalist.querySelectorAll("option")].map((node) => node.value);
    expect(optionValues).toEqual(expect.arrayContaining(["Alpha", "Beta"]));
    expect(optionValues).toHaveLength(2);

    fireEvent.change(searchInput, { target: { value: "Beta" } });

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });

    const rankingSection = document.getElementById("ranking")!;
    expect(within(rankingSection).getByText("1 di 2 città")).toBeInTheDocument();
    expect(within(rankingSection).getByRole("button", { name: "Beta" })).toBeInTheDocument();
    expect(within(rankingSection).queryByRole("button", { name: "Alpha" })).not.toBeInTheDocument();
  });

  it("finds cities when the search query omits accents", async () => {
    const accentSearchPayload: RankingPayload = {
      ...minimalRankingPayload,
      coverageAudit: {
        ...minimalRankingPayload.coverageAudit,
        cityCount: 3
      },
      cities: [
        sampleCity("Alpha", 1, 80),
        sampleCity("Forlì", 2, 72),
        sampleCity("Foggia", 3, 68)
      ]
    };
    mockRankingFetch(accentSearchPayload);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const rankingSection = document.getElementById("ranking")!;
    expect(within(rankingSection).getByText("3 di 3 città")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Cerca una città"), { target: { value: "forli" } });

    await waitFor(() => {
      expect(within(rankingSection).getByText("1 di 3 città")).toBeInTheDocument();
    });
    expect(within(rankingSection).getByRole("button", { name: "Forlì" })).toBeInTheDocument();
    expect(within(rankingSection).queryByRole("button", { name: "Alpha" })).not.toBeInTheDocument();
    expect(within(rankingSection).queryByRole("button", { name: "Foggia" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Cerca una città"), { target: { value: "FORLI" } });

    await waitFor(() => {
      expect(within(rankingSection).getByRole("button", { name: "Forlì" })).toBeInTheDocument();
    });
  });

  it("shows result count, empty filter state, and clears filters on reset", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const rankingSection = document.getElementById("ranking")!;
    expect(within(rankingSection).getByText("2 di 2 città")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Cerca una città"), { target: { value: "zzz" } });

    await waitFor(() => {
      expect(
        within(rankingSection).getByText("Nessun capoluogo corrisponde ai filtri selezionati.")
      ).toBeInTheDocument();
    });
    expect(within(rankingSection).getByText("0 di 2 città")).toBeInTheDocument();
    expect(within(rankingSection).queryByRole("button", { name: "Beta" })).not.toBeInTheDocument();

    const emptyPanel = within(rankingSection)
      .getByText("Nessun capoluogo corrisponde ai filtri selezionati.")
      .closest(".filter-empty-panel") as HTMLElement;
    fireEvent.click(within(emptyPanel).getByRole("button", { name: "Azzera filtri" }));

    await waitFor(() => {
      expect(within(rankingSection).getByRole("button", { name: "Beta" })).toBeInTheDocument();
    });
    expect(within(rankingSection).getByText("2 di 2 città")).toBeInTheDocument();
    expect(
      within(rankingSection).queryByText("Nessun capoluogo corrisponde ai filtri selezionati.")
    ).not.toBeInTheDocument();
  });

  it("shows removable filter chips and clears one dimension at a time", async () => {
    const chipFilterPayload: RankingPayload = {
      ...minimalRankingPayload,
      coverageAudit: {
        ...minimalRankingPayload.coverageAudit,
        cityCount: 2
      },
      cities: [
        sampleCity("Alpha", 1, 80, { sizeClass: 1 }),
        sampleCity("Beta", 2, 70, { sizeClass: 2 })
      ]
    };
    mockRankingFetch(chipFilterPayload);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const rankingSection = document.getElementById("ranking")!;
    const sizeSelect = within(rankingSection).getByRole("combobox", { name: "Filtra per taglia" });

    fireEvent.change(sizeSelect, { target: { value: "1" } });

    await waitFor(() => {
      expect(within(rankingSection).getByText("1 di 2 città")).toBeInTheDocument();
    });
    expect(within(rankingSection).queryByRole("button", { name: "Beta" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Cerca una città"), { target: { value: "zzz" } });

    await waitFor(() => {
      expect(within(rankingSection).getByText("0 di 2 città")).toBeInTheDocument();
    });
    expect(within(rankingSection).getByText("Ricerca: zzz")).toBeInTheDocument();
    expect(within(rankingSection).getByText("Taglia: Grandi")).toBeInTheDocument();

    fireEvent.click(within(rankingSection).getByRole("button", { name: "Rimuovi filtro ricerca" }));

    await waitFor(() => {
      expect(within(rankingSection).getByRole("button", { name: "Alpha" })).toBeInTheDocument();
    });
    expect(within(rankingSection).getByText("1 di 2 città")).toBeInTheDocument();
    expect(within(rankingSection).queryByText("Ricerca: zzz")).not.toBeInTheDocument();
    expect(within(rankingSection).getByText("Taglia: Grandi")).toBeInTheDocument();
  });

  it("shows a detail banner when the selected city is hidden by filters", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const rankingSection = document.getElementById("ranking")!;
    fireEvent.click(within(rankingSection).getByRole("button", { name: "Beta" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Cerca una città"), { target: { value: "zzz" } });

    const detail = document.getElementById("detail")!;

    await waitFor(() => {
      expect(
        within(detail).getByText("Beta non è visibile con i filtri attuali.")
      ).toBeInTheDocument();
    });
    expect(within(detail).getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    expect(within(rankingSection).queryByRole("button", { name: "Beta" })).not.toBeInTheDocument();

    fireEvent.click(within(detail).getByRole("button", { name: "Mostra in tabella" }));

    await waitFor(() => {
      expect(within(rankingSection).getByRole("button", { name: "Beta" })).toBeInTheDocument();
    });
    expect(
      within(detail).queryByText("Beta non è visibile con i filtri attuali.")
    ).not.toBeInTheDocument();
    expect(within(detail).getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
  });

  it("clears filters from the detail banner when the selected city is hidden", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const rankingSection = document.getElementById("ranking")!;
    fireEvent.click(within(rankingSection).getByRole("button", { name: "Beta" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText("Cerca una città"), { target: { value: "zzz" } });

    const detail = document.getElementById("detail")!;
    const clearButtons = within(detail).getAllByRole("button", { name: "Azzera filtri" });
    fireEvent.click(clearButtons[0]!);

    await waitFor(() => {
      expect(within(rankingSection).getByRole("button", { name: "Beta" })).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText("Cerca una città")).toHaveValue("");
    expect(
      within(detail).queryByText("Beta non è visibile con i filtri attuali.")
    ).not.toBeInTheDocument();
  });
});

describe("App ranking compact cards", () => {
  beforeEach(() => {
    mockRankingFetch();
    mockCompactRankingViewport();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    resetCityUrlParam();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses compact layout for the 1180px media query", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    expect(window.matchMedia).toHaveBeenCalledWith(RANKING_COMPACT_MEDIA);
  });

  it("shows card layout with city actions, metrics, and result count", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const rankingSection = document.getElementById("ranking")!;
    expect(within(rankingSection).getByText("2 di 2 città")).toBeInTheDocument();
    expect(within(rankingSection).queryByRole("columnheader")).not.toBeInTheDocument();

    const mobileList = within(rankingSection).getByRole("list", { name: /ranking capoluoghi/i });
    expect(within(mobileList).getByRole("button", { name: "Alpha" })).toBeInTheDocument();
    expect(within(mobileList).getByRole("button", { name: "Beta" })).toBeInTheDocument();
    const alphaCard = within(mobileList).getByRole("button", { name: "Alpha" }).closest("li")!;
    expect(within(alphaCard).getByText("Infrastruttura")).toBeInTheDocument();
    expect(within(alphaCard).getByText("Sicurezza")).toBeInTheDocument();
    expect(within(alphaCard).getByText("Uso")).toBeInTheDocument();
    expect(within(alphaCard).getByText("Policy")).toBeInTheDocument();
    expect(within(alphaCard).getAllByText("contestuale")).toHaveLength(2);

    fireEvent.click(within(mobileList).getByRole("button", { name: "Beta" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });
    const betaCard = within(mobileList).getByRole("button", { name: "Beta" }).closest("li")!;
    expect(betaCard).toHaveClass("selected");
    expect(within(betaCard).getByRole("button", { name: "Beta" })).toHaveAttribute("aria-current", "true");
  });

  it("toggles 20* imputation disclosure in compact ranking cards", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("slider", { name: /^Policy$/i }), {
      target: { value: "10" }
    });

    const rankingSection = document.getElementById("ranking")!;
    const mobileList = within(rankingSection).getByRole("list", { name: /ranking capoluoghi/i });
    const betaCard = () =>
      within(mobileList).getByRole("button", { name: "Beta" }).closest("li")!;

    await waitFor(() => {
      expect(
        within(betaCard()).getByRole("button", { name: /imputazione prudente/i })
      ).toBeInTheDocument();
    });

    const helpButton = within(betaCard()).getByRole("button", { name: /imputazione prudente/i });
    expect(helpButton).toHaveAttribute("aria-expanded", "false");
    expect(helpButton).toHaveAttribute("aria-describedby");
    expect(within(betaCard()).queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.click(helpButton);
    expect(helpButton).toHaveAttribute("aria-expanded", "true");
    expect(within(betaCard()).getByRole("region", { name: /imputazione prudente/i })).toBeVisible();
  });

  it("labels mobile sort score option as Punteggio", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const rankingSection = document.getElementById("ranking")!;
    const sortSelect = within(rankingSection).getByRole("combobox", { name: /ordina per/i });
    expect(within(sortSelect).getByRole("option", { name: "Punteggio" })).toBeInTheDocument();
    expect(within(sortSelect).queryByRole("option", { name: "Score" })).not.toBeInTheDocument();
  });

  it("keeps filter empty state without mobile cards", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const rankingSection = document.getElementById("ranking")!;
    fireEvent.change(screen.getByPlaceholderText("Cerca una città"), { target: { value: "zzz" } });

    await waitFor(() => {
      expect(
        within(rankingSection).getByText("Nessun capoluogo corrisponde ai filtri selezionati.")
      ).toBeInTheDocument();
    });
    expect(within(rankingSection).queryByRole("list", { name: /ranking capoluoghi/i })).not.toBeInTheDocument();
    expect(within(rankingSection).getByText("0 di 2 città")).toBeInTheDocument();
  });
});

describe("App ranking table categories", () => {
  beforeEach(() => {
    mockRankingFetch();
    mockDesktopRankingViewport();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    resetCityUrlParam();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses correct Italian diacritics in search placeholder and ranking headers", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    expect(screen.getByPlaceholderText("Cerca una città")).toBeInTheDocument();

    const rankingSection = document.getElementById("ranking")!;
    expect(
      within(rankingSection).getByRole("columnheader", { name: /^Città ordina per città$/i })
    ).toBeInTheDocument();
    expect(
      within(rankingSection).getByRole("columnheader", { name: /^Punteggio ordina per punteggio/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Cerca città" })).toBeInTheDocument();
    expect(
      within(rankingSection).getByRole("link", { name: /Scarica CSV/i })
    ).toBeInTheDocument();
    expect(within(rankingSection).queryByText(/^CSV$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Score$/)).not.toBeInTheDocument();
  });

  it("labels chart bar series in Italian, not Score", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const seriesNames = [
      ...screen.getAllByTestId("bar-series"),
      ...screen.getAllByTestId("prime-12-bars")
    ].map((node) => node.getAttribute("data-series-name"));
    expect(seriesNames.every((name) => name !== "Score")).toBe(true);
    expect(seriesNames.filter((name) => name === "Punteggio").length).toBeGreaterThanOrEqual(2);
  });

  it("shows default-weight category columns, n.d. for zero-weight nulls, and ciclabili km label", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const rankingSection = document.getElementById("ranking")!;
    expect(
      within(rankingSection).getByRole("columnheader", { name: /Ciclabili \(km\)/i })
    ).toBeInTheDocument();
    expect(
      within(rankingSection).getByRole("columnheader", { name: /Infrastruttura/i })
    ).toBeInTheDocument();
    expect(
      within(rankingSection).getByRole("columnheader", { name: /Connessioni/i })
    ).toBeInTheDocument();
    expect(
      within(rankingSection).getByRole("columnheader", { name: /Comfort/i })
    ).toBeInTheDocument();
    expect(
      within(rankingSection).getByRole("columnheader", { name: /Uso.*contestuale/i })
    ).toBeInTheDocument();
    expect(
      within(rankingSection).getByRole("columnheader", { name: /Policy.*contestuale/i })
    ).toBeInTheDocument();

    const betaRow = within(rankingSection).getByRole("button", { name: "Beta" }).closest("tr")!;
    expect(within(betaRow).getAllByText("n.d.")).toHaveLength(2);
    expect(within(betaRow).getAllByText("contestuale")).toHaveLength(2);
    expect(
      within(betaRow).queryByRole("button", { name: /imputazione prudente/i })
    ).not.toBeInTheDocument();

    const infraHeader = within(rankingSection)
      .getByRole("button", { name: /ordina per infrastruttura/i })
      .closest("th")!;
    fireEvent.click(within(infraHeader).getByRole("button"));
    expect(infraHeader).toHaveAttribute("aria-sort", "descending");
  });

  it("shows 20* imputation for null policy only when policy weight is greater than zero", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const rankingSection = document.getElementById("ranking")!;
    const betaRow = () =>
      within(rankingSection).getByRole("button", { name: "Beta" }).closest("tr")!;

    fireEvent.change(screen.getByRole("slider", { name: /^Policy$/i }), {
      target: { value: "10" }
    });

    await waitFor(() => {
      expect(within(betaRow()).getAllByRole("button", { name: /imputazione prudente/i })).toHaveLength(
        1
      );
    });

    const policyImputation = within(betaRow()).getByRole("button", {
      name: /imputazione prudente/i
    });
    expect(policyImputation).toHaveAttribute("aria-expanded", "false");
    expect(policyImputation).toHaveAttribute("aria-describedby");
    expect(within(betaRow()).queryByRole("tooltip")).not.toBeInTheDocument();
    expect(within(betaRow()).queryByRole("region", { name: /imputazione prudente/i })).not.toBeInTheDocument();

    fireEvent.click(policyImputation);
    expect(policyImputation).toHaveAttribute("aria-expanded", "true");
    expect(policyImputation).not.toHaveAttribute("aria-describedby");
    const explainerRegion = within(betaRow()).getByRole("region", { name: /imputazione prudente/i });
    expect(explainerRegion).toBeVisible();
    expect(explainerRegion).toHaveTextContent(/valore prudente/i);
    expect(explainerRegion).not.toHaveAttribute("role", "tooltip");

    fireEvent.click(policyImputation);
    expect(policyImputation).toHaveAttribute("aria-expanded", "false");
    expect(policyImputation).toHaveAttribute("aria-describedby");
    const describedBy = policyImputation.getAttribute("aria-describedby")!;
    expect(document.getElementById(describedBy)).toHaveTextContent(/valore prudente/i);

    expect(within(betaRow()).getAllByText("n.d.")).toHaveLength(1);
  });
});

describe("App Italian download labels", () => {
  beforeEach(() => {
    mockRankingFetch();
    mockDesktopRankingViewport();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    resetCityUrlParam();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows Italian labels in the data download grid", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const dataSection = document.getElementById("data")!;
    expect(
      within(dataSection).getByRole("link", { name: /Ranking JSON/i })
    ).toBeInTheDocument();
    expect(
      within(dataSection).getByRole("link", { name: /Scarica ranking CSV/i })
    ).toBeInTheDocument();
    expect(
      within(dataSection).getByRole("link", { name: /Dati normalizzati/i })
    ).toBeInTheDocument();
    expect(within(dataSection).queryByText(/Normalized data/i)).not.toBeInTheDocument();
    expect(within(dataSection).queryByText(/^Ranking CSV$/)).not.toBeInTheDocument();
  });
});

describe("App custom weights", () => {
  beforeEach(() => {
    mockRankingFetch();
    mockDesktopRankingViewport();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    resetCityUrlParam();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows a banner when weights differ from default and restores ranking on reset", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const bannerText =
      "Ranking ricalcolato con pesi personalizzati; i download restano sui pesi default.";
    const resetButton = screen.getByRole("button", { name: "Ripristina pesi default" });

    expect(screen.queryByText(bannerText)).not.toBeInTheDocument();
    expect(resetButton).toBeDisabled();
    expect(screen.getByText("Somma pesi:").closest("p")).toHaveTextContent("Somma pesi: 100");
    expect(screen.getByText(/Contano solo i rapporti tra i pesi/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Vedi formula" })).toHaveAttribute("href", "#methodology");

    const rankingSection = document.getElementById("ranking")!;
    expect(within(rankingSection).getAllByRole("button", { name: "Alpha" })[0]).toBeInTheDocument();

    const infraSlider = screen.getByLabelText("Infrastruttura");
    const safetySlider = screen.getByLabelText("Sicurezza");
    fireEvent.change(infraSlider, { target: { value: "0" } });

    await waitFor(() => {
      expect(screen.getByText("Somma pesi:").closest("p")).toHaveTextContent("Somma pesi: 50");
    });
    expect(screen.getByText(/Contano solo i rapporti tra i pesi/i)).toBeVisible();

    fireEvent.change(safetySlider, { target: { value: "75" } });

    await waitFor(() => {
      expect(screen.getByText(bannerText)).toBeInTheDocument();
    });
    expect(resetButton).toBeEnabled();

    await waitFor(() => {
      const firstDataRow = within(rankingSection).getAllByRole("row")[1];
      expect(within(firstDataRow).getByRole("button", { name: "Beta" })).toBeInTheDocument();
    });
    const detailSection = document.getElementById("detail")!;
    expect(within(detailSection).getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    expect(detailSection.querySelector(".rank-pill.large")).toHaveTextContent("#2");

    fireEvent.click(resetButton);

    await waitFor(() => {
      expect(screen.queryByText(bannerText)).not.toBeInTheDocument();
    });
    expect(resetButton).toBeDisabled();
    expect(infraSlider).toHaveValue("50");
    expect(safetySlider).toHaveValue("25");
    expect(screen.getByText("Somma pesi:").closest("p")).toHaveTextContent("Somma pesi: 100");
    await waitFor(() => {
      const firstDataRow = within(rankingSection).getAllByRole("row")[1];
      expect(within(firstDataRow).getByRole("button", { name: "Alpha" })).toBeInTheDocument();
    });
    expect(detailSection.querySelector(".rank-pill.large")).toHaveTextContent("#1");
  });

  it("announces debounced ranking updates for screen readers when custom weights change", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const announcement = screen.getByRole("status", {
      name: "Aggiornamento ranking da pesi personalizzati"
    });
    expect(announcement).toHaveTextContent("");

    const customWeights = normalizeWeights({
      ...DEFAULT_WEIGHTS,
      infrastructure: 0,
      safety: 75
    });
    const alphaCustom = rankCities(minimalRankingPayload.cities, customWeights).find(
      (city) => city.city === "Alpha"
    )!;
    const alphaDefault = rankCities(minimalRankingPayload.cities, DEFAULT_WEIGHTS).find(
      (city) => city.city === "Alpha"
    )!;
    const expectedUpdate = formatRankingUpdatedAnnouncement(
      alphaCustom.city,
      alphaCustom.adjustedRank,
      alphaCustom.adjustedScore
    );
    const expectedRestore = formatRankingRestoredAnnouncement(
      alphaDefault.city,
      alphaDefault.adjustedRank,
      alphaDefault.adjustedScore
    );

    const infraSlider = screen.getByLabelText("Infrastruttura");
    const safetySlider = screen.getByLabelText("Sicurezza");
    fireEvent.change(infraSlider, { target: { value: "0" } });
    fireEvent.change(safetySlider, { target: { value: "75" } });

    await waitFor(
      () => {
        expect(announcement).toHaveTextContent(expectedUpdate);
      },
      { timeout: 2000 }
    );

    fireEvent.click(screen.getByRole("button", { name: "Ripristina pesi default" }));

    await waitFor(
      () => {
        expect(announcement).toHaveTextContent(expectedRestore);
      },
      { timeout: 2000 }
    );
  });
});

describe("App skip link and landmarks", () => {
  beforeEach(() => {
    mockRankingFetch();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    resetCityUrlParam();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("exposes a skip link that targets the main content landmark", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Cerca, filtra, ordina" })).toBeInTheDocument();
    });

    const skipLink = screen.getByRole("link", { name: "Salta al contenuto" });
    expect(skipLink).toHaveAttribute("href", "#main-content");
    const mainLandmark = document.getElementById("main-content");
    expect(mainLandmark).toBeInTheDocument();
    expect(mainLandmark?.tagName).toBe("MAIN");
  });

  it("keeps the site header outside the main landmark", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Cerca, filtra, ordina" })).toBeInTheDocument();
    });

    const mainLandmark = document.getElementById("main-content");
    const header = document.querySelector(".site-header");
    expect(mainLandmark).toBeTruthy();
    expect(header).toBeTruthy();
    expect(mainLandmark?.contains(header)).toBe(false);
  });

  it("moves focus to main content when the skip link is activated", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Cerca, filtra, ordina" })).toBeInTheDocument();
    });

    const skipLink = screen.getByRole("link", { name: "Salta al contenuto" });
    fireEvent.click(skipLink);

    expect(document.activeElement).toHaveAttribute("id", "main-content");
  });

  it("skip link scrolls instantly when reduced motion is preferred", async () => {
    mockReducedMotionPreference();
    Element.prototype.scrollIntoView = vi.fn();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Cerca, filtra, ordina" })).toBeInTheDocument();
    });

    const mainContent = document.getElementById("main-content")!;
    fireEvent.click(screen.getByRole("link", { name: "Salta al contenuto" }));

    expect(mainContent.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
  });
});

describe("App document title", () => {
  beforeEach(() => {
    document.title = DEFAULT_DOCUMENT_TITLE;
    mockRankingFetch();
    mockDesktopRankingViewport();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    document.title = DEFAULT_DOCUMENT_TITLE;
    resetCityUrlParam();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses the default title while ranking data is loading", async () => {
    let resolveFetch!: () => void;
    const fetchDeferred = new Promise<Response>((resolve) => {
      resolveFetch = () =>
        resolve({
          ok: true,
          json: async () => minimalRankingPayload
        } as Response);
    });

    vi.stubGlobal("fetch", vi.fn(() => fetchDeferred));

    render(<App />);

    expect(document.title).toBe(DEFAULT_DOCUMENT_TITLE);

    resolveFetch();

    await waitFor(() => {
      expect(document.title).toMatch(/Alpha/);
    });
  });

  it("uses the default title when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 503 }) as Response)
    );

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(document.title).toBe(DEFAULT_DOCUMENT_TITLE);
  });

  it("updates the tab title when the user selects another city", async () => {
    render(<App />);

    await waitFor(() => {
      expect(document.title).toMatch(/Alpha/);
    });

    const rankingSection = document.getElementById("ranking")!;
    fireEvent.click(within(rankingSection).getByRole("button", { name: "Beta" }));

    await waitFor(() => {
      expect(document.title).toMatch(/Beta/);
    });
    expect(document.title).toBe("Beta | Ciclismo Sicuro");
  });

  it("sets the title from a valid ?city= deep link", async () => {
    window.history.replaceState({}, "", `${window.location.pathname}?city=Beta`);

    render(<App />);

    await waitFor(() => {
      expect(document.title).toMatch(/Beta/);
    });
  });

  it("titles the shown fallback city when ?city= is unknown", async () => {
    window.history.replaceState({}, "", `${window.location.pathname}?city=Gamma`);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
      expect(document.title).toMatch(/Alpha/);
    });
    expect(document.title).not.toMatch(/Gamma/);
  });
});

describe("App city deep link", () => {
  beforeEach(() => {
    mockRankingFetch();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    resetCityUrlParam();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("selects the city from ?city= on load and highlights the ranking row", async () => {
    window.history.replaceState({}, "", `${window.location.pathname}?city=Beta`);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });

    const rankingSection = document.getElementById("ranking")!;
    const betaButton = within(rankingSection).getByRole("button", { name: "Beta" });
    expect(betaButton).toHaveAttribute("aria-current", "true");
    expect(within(rankingSection).getByRole("button", { name: "Alpha" })).not.toHaveAttribute(
      "aria-current",
      "true"
    );
  });

  it("scrolls to city detail when opening a valid ?city= deep link", async () => {
    window.history.replaceState({}, "", `${window.location.pathname}?city=Beta`);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });

    const detail = document.getElementById("detail")!;
    expect(detail.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toHaveFocus();

    const rankingSection = document.getElementById("ranking")!;
    const betaRow = within(rankingSection).getByRole("button", { name: "Beta" }).closest("tr")!;
    expect(betaRow.scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth"
    });
  });

  it("scrolls to city detail without smooth motion when reduced motion is preferred", async () => {
    mockReducedMotionPreference();
    window.history.replaceState({}, "", `${window.location.pathname}?city=Beta`);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });

    const detail = document.getElementById("detail")!;
    expect(detail.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toHaveFocus();
  });

  it("selecting a city scrolls without smooth motion when reduced motion is preferred", async () => {
    mockReducedMotionPreference();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const detail = document.getElementById("detail")!;
    vi.mocked(detail.scrollIntoView).mockClear();

    const rankingSection = document.getElementById("ranking")!;
    fireEvent.click(within(rankingSection).getByRole("button", { name: "Beta" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });

    expect(detail.scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start" });
    expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toHaveFocus();
  });

  it("updates the URL when the user selects another city", async () => {
    window.history.replaceState({}, "", `${window.location.pathname}?city=Beta`);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });

    const rankingSection = document.getElementById("ranking")!;
    fireEvent.click(within(rankingSection).getByRole("button", { name: "Alpha" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });
    expect(new URL(window.location.href).searchParams.get("city")).toBe("Alpha");
  });

  it("falls back with a visible message when the deep-linked city is unknown", async () => {
    window.history.replaceState({}, "", `${window.location.pathname}?city=Gamma`);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const detail = document.getElementById("detail")!;
    expect(
      within(detail).getByText(/«Gamma» non è nel ranking: mostriamo Alpha\./i)
    ).toBeInTheDocument();
    expect(new URL(window.location.href).searchParams.get("city")).toBe("Alpha");
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("App city share link", () => {
  beforeEach(() => {
    mockRankingFetch();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    resetCityUrlParam();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("copies the full city deep link and shows success feedback", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", {
      ...navigator,
      clipboard: { writeText }
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const rankingSection = document.getElementById("ranking")!;
    fireEvent.click(within(rankingSection).getByRole("button", { name: "Beta" }));

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Copia link" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });

    const copiedUrl = String(writeText.mock.calls[0]?.[0]);
    expect(copiedUrl).toContain("?city=Beta");
    expect(new URL(copiedUrl).searchParams.get("city")).toBe("Beta");

    const detail = document.getElementById("detail")!;
    expect(within(detail).getByText(/Link copiato negli appunti/i)).toBeInTheDocument();
  });
});

describe("Copertura per metrica", () => {
  beforeEach(() => {
    mockRankingFetch();
    mockDesktopRankingViewport();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    resetCityUrlParam();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows per-metric coverage table with Italian headers and sparse fixture row", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: /Perché uso e policy/i })).toBeInTheDocument();
    });

    expect(screen.queryByText(/coverageAudit/i)).not.toBeInTheDocument();

    const metricsTable = screen.getByRole("table", {
      name: /copertura per metrica su 2 capoluoghi/i
    });

    expect(within(metricsTable).getByRole("columnheader", { name: /^Metrica/i })).toBeInTheDocument();
    expect(within(metricsTable).getByRole("columnheader", { name: /^Categoria/i })).toBeInTheDocument();
    expect(within(metricsTable).getByRole("columnheader", { name: /^Copertura/i })).toBeInTheDocument();
    expect(within(metricsTable).getByRole("columnheader", { name: /^Tipo segnale/i })).toBeInTheDocument();

    expect(within(metricsTable).getByText("Piste ciclabili equivalenti")).toBeInTheDocument();
    const sparseRow = within(metricsTable).getByText("FIAB bike-smile").closest("tr");
    expect(sparseRow).toHaveClass("coverage-metric-row--sparse");
    expect(within(metricsTable).getByText("Copertura bassa")).toBeInTheDocument();
    expect(within(metricsTable).getByText("Manuale")).toBeInTheDocument();
    expect(within(metricsTable).getByRole("link", { name: /Vedi gap fonti/i })).toHaveAttribute("href", "#data");
  });
});

describe("city detail metric matrix", () => {
  beforeEach(() => {
    mockRankingFetch();
    mockDesktopRankingViewport();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    resetCityUrlParam();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows Italian labels and an accessible source link per metric", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const detail = document.getElementById("detail")!;
    const matrix = within(detail).getByRole("table", { name: /metriche comparabili per alpha/i });

    expect(within(matrix).queryByText(/^raw$/i)).not.toBeInTheDocument();
    expect(within(matrix).queryByRole("link", { name: /^fonte$/i })).not.toBeInTheDocument();
    expect(within(matrix).getByRole("columnheader", { name: "Originale" })).toBeInTheDocument();
    expect(within(matrix).getByRole("columnheader", { name: "Normalizzato" })).toBeInTheDocument();
    expect(matrix.querySelector('[data-label="Valore originale"]')).toBeInTheDocument();
    expect(matrix.querySelector('[data-label="Normalizzato 0–100"]')).toBeInTheDocument();

    const sourceLink = within(matrix).getByRole("link", {
      name: /Apri fonte: Lab24 — Piste ciclabili equivalenti/i
    });
    expect(sourceLink).toHaveAttribute("href", "https://example.com/piste");
    expect(sourceLink).toHaveAccessibleName(/Apri fonte: Lab24 — Piste ciclabili equivalenti/i);
  });
});

describe("City detail comparison", () => {
  beforeEach(() => {
    mockRankingFetch();
    mockDesktopRankingViewport();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    resetCityUrlParam();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows rank and score deltas when comparing Alpha with Beta", async () => {
    const ranked = rankCities(minimalRankingPayload.cities, DEFAULT_WEIGHTS);
    const alpha = ranked.find((city) => city.city === "Alpha")!;
    const beta = ranked.find((city) => city.city === "Beta")!;
    const expected = buildCityComparison(alpha, beta, DEFAULT_WEIGHTS);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const detail = document.getElementById("detail")!;
    fireEvent.change(within(detail).getByLabelText("Confronta con…"), {
      target: { value: "Beta" }
    });

    const panel = await within(detail).findByTestId("city-comparison-panel");
    expect(within(panel).getByRole("heading", { name: "Confronto con Beta" })).toBeInTheDocument();
    expect(within(panel).getByText(formatRankDelta(expected.rankDelta))).toBeInTheDocument();
    expect(within(panel).getByText(formatScoreDelta(expected.scoreDelta))).toBeInTheDocument();
    expect(within(panel).getByText(/Sicurezza:/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Infrastruttura:/i)).toBeInTheDocument();
  });

  it("clears the comparison block and resets when the selected city changes", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const detail = document.getElementById("detail")!;
    fireEvent.change(within(detail).getByLabelText("Confronta con…"), {
      target: { value: "Beta" }
    });
    expect(await within(detail).findByTestId("city-comparison-panel")).toBeInTheDocument();

    fireEvent.click(within(detail).getByRole("button", { name: "Rimuovi confronto" }));
    expect(within(detail).queryByTestId("city-comparison-panel")).not.toBeInTheDocument();

    fireEvent.change(within(detail).getByLabelText("Confronta con…"), {
      target: { value: "Beta" }
    });
    expect(await within(detail).findByTestId("city-comparison-panel")).toBeInTheDocument();

    const ranking = document.getElementById("ranking")!;
    fireEvent.click(within(ranking).getByRole("button", { name: "Beta" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });
    expect(within(detail).queryByTestId("city-comparison-panel")).not.toBeInTheDocument();
    expect(within(detail).getByLabelText("Confronta con…")).toHaveValue("");
  });
});

describe("Data explorer source links", () => {
  beforeEach(() => {
    mockRankingFetch();
    mockDesktopRankingViewport();
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    resetCityUrlParam();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("names registry source links for screen readers with publisher and title", async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: /Download, fonti, gap/i })).toBeInTheDocument();
    });

    const dataSection = document.getElementById("data")!;
    const sourceLink = within(dataSection).getByRole("link", {
      name: /Apri fonte: Lab24 — Lab24 piste ciclabili/i
    });

    expect(sourceLink).toHaveAttribute("href", "https://example.com/piste");
    expect(sourceLink).toHaveAccessibleName(/Apri fonte: Lab24 — Lab24 piste ciclabili/i);
    expect(within(dataSection).queryByRole("link", { name: /^apri fonte$/i })).not.toBeInTheDocument();
  });
});

function installSectionNavIntersectionObserver() {
  let callback: IntersectionObserverCallback | null = null;
  let options: IntersectionObserverInit | undefined;

  class MockIntersectionObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();

    constructor(nextCallback: IntersectionObserverCallback, nextOptions?: IntersectionObserverInit) {
      callback = nextCallback;
      options = nextOptions;
    }
  }

  vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

  return {
    getOptions() {
      return options;
    },
    emitSectionIntersection(sectionId: string, isIntersecting: boolean) {
      const element = document.getElementById(sectionId);
      if (!element || !callback) return;
      callback(
        [
          {
            target: element,
            isIntersecting,
            intersectionRatio: isIntersecting ? 0.55 : 0
          } as unknown as IntersectionObserverEntry
        ],
        {} as IntersectionObserver
      );
    }
  };
}

function getTopNav() {
  return screen.getByRole("navigation", { name: /Navigazione principale/i });
}

describe("Section nav scroll spy", () => {
  beforeEach(() => {
    mockRankingFetch();
    mockDesktopRankingViewport();
    Element.prototype.scrollIntoView = vi.fn();
    resetCityUrlParam();
    window.history.replaceState({}, "", window.location.pathname);
  });

  afterEach(() => {
    resetCityUrlParam();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("marks the nav link matching the location hash", async () => {
    installSectionNavIntersectionObserver();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    window.history.replaceState({}, "", "#contesto");
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    const nav = getTopNav();
    await waitFor(() => {
      expect(within(nav).getByRole("link", { name: "Contesto" })).toHaveAttribute("aria-current", "page");
    });
    expect(within(nav).getByRole("link", { name: "Contesto" })).toHaveClass("is-active");
    expect(within(nav).getByRole("link", { name: "Ranking" })).not.toHaveAttribute("aria-current");
  });

  it("updates the active nav link from intersection observations", async () => {
    const { emitSectionIntersection, getOptions } = installSectionNavIntersectionObserver();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });
    expect(getOptions()?.rootMargin).toBe("-72px 0px -55% 0px");

    emitSectionIntersection("ranking", true);
    emitSectionIntersection("detail", false);
    emitSectionIntersection("contesto", false);

    const nav = getTopNav();
    await waitFor(() => {
      expect(within(nav).getByRole("link", { name: "Ranking" })).toHaveAttribute("aria-current", "page");
    });

    emitSectionIntersection("ranking", false);
    emitSectionIntersection("detail", true);

    await waitFor(() => {
      expect(within(nav).getByRole("link", { name: "Dettaglio" })).toHaveAttribute("aria-current", "page");
    });
    expect(within(nav).getByRole("link", { name: "Ranking" })).not.toHaveAttribute("aria-current");
  });

  it("shows the map nav link only when the map panel is open", async () => {
    installSectionNavIntersectionObserver();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Alpha" })).toBeInTheDocument();
    });

    const nav = getTopNav();
    expect(within(nav).queryByRole("link", { name: "Mappa" })).not.toBeInTheDocument();

    const rankingTable = document.getElementById("ranking")!;
    fireEvent.click(within(rankingTable).getByRole("button", { name: "Beta" }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 2, name: "Beta" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Apri mappa" }));

    await waitFor(() => {
      expect(within(nav).getByRole("link", { name: "Mappa" })).toBeInTheDocument();
    });

    window.history.replaceState({}, "", "#city-map");
    window.dispatchEvent(new HashChangeEvent("hashchange"));

    await waitFor(() => {
      expect(within(nav).getByRole("link", { name: "Mappa" })).toHaveAttribute("aria-current", "page");
    });
  });
});
