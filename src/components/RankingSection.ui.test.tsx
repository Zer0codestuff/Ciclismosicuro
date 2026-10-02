import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import published from "../../public/data/ranking.json";
import { parseRankingPayload } from "../lib/payload";
import { rankCities } from "../lib/scoring";
import { Hero } from "./Hero";
import { RankingSection } from "./RankingSection";
import { RiskInterval } from "./CityProfile";

const payload = parseRankingPayload(published);
const cities = rankCities(payload.cities, payload.defaultWeights);

function renderRanking() {
  const onSelectCity = vi.fn();
  render(<RankingSection payload={payload} cities={cities} weights={payload.defaultWeights}
    onWeightsChange={vi.fn()} customWeights={false} selectedId={cities[0].id} onSelectCity={onSelectCity} />);
  return onSelectCity;
}

describe("ranking exploration", () => {
  it("paginates and makes all rows available on request", () => {
    renderRanking();
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(21);
    expect(screen.getByRole("button", { name: "Precedenti" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Successivi" }));
    expect(screen.getByRole("navigation", { name: "Pagine della classifica" })).toHaveTextContent("21–40");
    expect(within(table).getByRole("button", { name: cities[20].name })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Mostra tutte" }));
    expect(within(table).getAllByRole("row")).toHaveLength(payload.cityCount + 1);
  });

  it("filters from a later page and opens the exact city", () => {
    const onSelect = renderRanking();
    fireEvent.click(screen.getByRole("button", { name: "Successivi" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Cerca città o regione" }), { target: { value: "Bologna" } });
    expect(screen.getByRole("navigation", { name: "Pagine della classifica" })).toHaveTextContent("1–1 di 1");
    fireEvent.click(within(screen.getByRole("table")).getByRole("button", { name: "Bologna" }));
    expect(onSelect).toHaveBeenCalledWith(cities.find(city => city.name === "Bologna")!.id);
    fireEvent.click(screen.getByRole("button", { name: "Azzera filtri" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(21);
  });

  it("offers sorting without relying on visible table headers", () => {
    renderRanking();
    fireEvent.change(screen.getByRole("combobox", { name: "Ordina classifica" }), { target: { value: "name:asc" } });
    const first = within(screen.getByRole("table")).getAllByRole("row")[1];
    expect(first).toHaveTextContent([...cities].sort((a, b) => a.name.localeCompare(b.name, "it"))[0].name);
    expect(screen.getByRole("link", { name: "CSV (pesi standard)" })).toHaveAttribute("download");
  });
});

describe("city search and model interpretation", () => {
  it("resolves an accent-free city search and discloses the historical proxy", () => {
    const onSelect = vi.fn();
    render(<Hero payload={payload} cities={cities} onSelectCity={onSelect} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Cerca la tua città" }), { target: { value: "Forli" } });
    fireEvent.click(screen.getByRole("button", { name: "Apri scheda" }));
    expect(onSelect).toHaveBeenCalledWith(cities.find(city => city.name === "Forlì")!.id);
    expect(screen.getByText(/proxy storico/)).toHaveTextContent("2011");
  });

  it("does not pick a city for ambiguous regional searches", () => {
    const onSelect = vi.fn();
    render(<Hero payload={payload} cities={cities} onSelectCity={onSelect} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Cerca la tua città" }), { target: { value: "Lombardia" } });
    fireEvent.click(screen.getByRole("button", { name: "Apri scheda" }));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/capoluoghi corrispondono/);
  });

  it("reports the full interval even when outside the plotted scale", () => {
    render(<RiskInterval ratio={2} low={0.1} high={8} label="Morti e feriti / attesi" />);
    expect(screen.getByText(/intervallo al 90%/)).toHaveTextContent("da 0,10 a 8,00");
  });
});
