import type { MetricDefinition, PillarId, RankedCity } from "../types";
import { formatNumber } from "./format";
import { CORE_PILLARS } from "./scoring";

const PILLAR_PHRASES: Record<PillarId, { strong: string; weak: string }> = {
  safety: { strong: "meno vittime cicliste registrate rispetto all'atteso dal modello", weak: "più vittime cicliste registrate rispetto all'atteso dal modello" },
  infrastructure: { strong: "una rete ciclabile estesa", weak: "una rete ciclabile scarsa" },
  traffic: { strong: "traffico relativamente moderato", weak: "molta pressione del traffico" },
  usage: { strong: "un pendolarismo in bici storicamente diffuso", weak: "un pendolarismo in bici storicamente limitato" },
  transit: { strong: "un trasporto pubblico forte", weak: "un trasporto pubblico debole" },
  environment: { strong: "aria relativamente pulita", weak: "aria inquinata" }
};

function joinItalian(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items.at(-1)}`;
}

/** One-paragraph plain-language summary of a city's profile. */
export function citySummary(city: RankedCity, total: number): string {
  const scored = CORE_PILLARS.map((pillar) => ({ pillar, value: city.pillarScores[pillar] })).filter(
    (entry): entry is { pillar: PillarId; value: number } => typeof entry.value === "number" && Number.isFinite(entry.value)
  );
  const strong = scored.filter((entry) => entry.value >= 65).sort((a, b) => b.value - a.value);
  const weak = scored.filter((entry) => entry.value < 35).sort((a, b) => a.value - b.value);
  const position =
    city.liveRank === null
      ? "non è classificabile con i pesi scelti"
      : city.liveRank <= Math.ceil(total * 0.2)
      ? "è tra i capoluoghi meglio piazzati"
      : city.liveRank > Math.floor(total * 0.8)
        ? "è tra i capoluoghi in fondo alla classifica"
        : "si colloca nella fascia intermedia della classifica";
  const rank = city.liveRank === null ? "" : ` (${city.liveRank}ª su ${total})`;
  const parts = [`${city.name} ${position}${rank}.`];
  if (strong.length) parts.push(`Punti di forza: ${joinItalian(strong.map((entry) => PILLAR_PHRASES[entry.pillar].strong))}.`);
  if (weak.length) parts.push(`Punti deboli: ${joinItalian(weak.map((entry) => PILLAR_PHRASES[entry.pillar].weak))}.`);
  if (!strong.length && !weak.length) parts.push("Nessun pilastro spicca nettamente, in positivo o in negativo.");
  return parts.join(" ");
}

export function riskSentence(city: RankedCity): string {
  const { safety } = city;
  const perYear = formatNumber(safety.casualtiesPerYear, 0);
  const expectedPerYear = formatNumber(safety.expected / 3, 0);
  const base = `Nel ${safety.period} sono stati registrati in media ${perYear} ciclisti morti o feriti l'anno, contro circa ${expectedPerYear} attesi dal modello per popolazione e quota di pendolari in bici rilevata nel 2011.`;
  if (safety.ratioHigh < 1) return `${base} L'intervallo del rapporto osservati/attesi è interamente sotto 1, condizionato alla proxy storica di esposizione usata nel modello.`;
  if (safety.ratioLow > 1) return `${base} L'intervallo del rapporto osservati/attesi è interamente sopra 1, condizionato alla proxy storica di esposizione usata nel modello.`;
  return `${base} L'intervallo del rapporto osservati/attesi comprende 1. È condizionato alla proxy storica di esposizione e non misura il rischio del singolo viaggio.`;
}

/** The two best and two worst metrics (by normalized score) among those with weight in core pillars. */
export function metricHighlights(city: RankedCity, metrics: MetricDefinition[]) {
  const scored = metrics
    .filter((metric) => CORE_PILLARS.includes(metric.pillar) && metric.weight > 0)
    .map((metric) => ({ metric, score: city.metricScores[metric.id] }))
    .filter((entry): entry is { metric: MetricDefinition; score: number } => typeof entry.score === "number" && Number.isFinite(entry.score));
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  return { best: sorted.slice(0, 2), worst: sorted.slice(-2).reverse() };
}
