import { Link2, RotateCcw } from "lucide-react";
import { useState } from "react";
import { formatPercent } from "../lib/format";
import {
  MAX_WEIGHT,
  PILLAR_COLORS,
  PILLAR_ORDER,
  totalWeight,
  WEIGHT_PRESETS,
  weightsEqual,
  weightShares
} from "../lib/scoring";
import { encodeWeights, shareUrl } from "../lib/urlState";
import type { Pillar, Weights } from "../types";

export function WeightsPanel({
  pillars,
  weights,
  defaultWeights,
  onChange
}: {
  pillars: Pillar[];
  weights: Weights;
  defaultWeights: Weights;
  onChange: (weights: Weights) => void;
}) {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const shares = weightShares(weights);
  const pillarById = new Map(pillars.map((pillar) => [pillar.id, pillar]));
  const activePreset = WEIGHT_PRESETS.find((preset) => weightsEqual(preset.weights, weights))?.id ?? null;

  function update(pillar: keyof Weights, value: number) {
    const next = { ...weights, [pillar]: value };
    if (totalWeight(next) <= 0) return;
    onChange(next);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl(null, encodeWeights(weights)));
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
    window.setTimeout(() => setCopied("idle"), 3000);
  }

  return (
    <div className="weights-panel">
      <div className="weights-head">
        <h3>Quanto conta ogni aspetto?</h3>
        <p>Scegli un'impostazione o regola i cursori: la classifica si ricalcola subito.</p>
      </div>
      <div className="preset-row" role="group" aria-label="Impostazioni rapide dei pesi">
        {WEIGHT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={activePreset === preset.id ? "chip is-active" : "chip"}
            aria-pressed={activePreset === preset.id}
            title={preset.description}
            onClick={() => onChange(preset.weights)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="weight-share-bar" aria-hidden="true">
        {PILLAR_ORDER.filter((pillar) => shares[pillar] > 0).map((pillar) => (
          <span key={pillar} style={{ flexGrow: shares[pillar], background: PILLAR_COLORS[pillar] }} />
        ))}
      </div>
      <div className="weight-sliders">
        {PILLAR_ORDER.map((pillarId) => {
          const pillar = pillarById.get(pillarId);
          if (!pillar) return null;
          const inputId = `weight-${pillarId}`;
          return (
            <div className="weight-slider" key={pillarId}>
              <label htmlFor={inputId}>
                <span className="pillar-dot" style={{ background: PILLAR_COLORS[pillarId] }} aria-hidden="true" />
                <strong>{pillar.label}</strong>
                <small>{pillar.description}</small>
              </label>
              <input
                id={inputId}
                type="range"
                min={0}
                max={MAX_WEIGHT}
                step={5}
                value={weights[pillarId]}
                aria-valuetext={`${weights[pillarId]}, ${formatPercent(shares[pillarId])} del totale`}
                onChange={(event) => update(pillarId, Number(event.target.value))}
              />
              <output htmlFor={inputId}>{formatPercent(shares[pillarId])}</output>
            </div>
          );
        })}
      </div>
      <div className="weights-actions">
        <button
          type="button"
          className="button button-ghost"
          onClick={() => onChange(defaultWeights)}
          disabled={weightsEqual(weights, defaultWeights)}
        >
          <RotateCcw aria-hidden="true" />
          Ripristina
        </button>
        <button type="button" className="button button-ghost" onClick={() => void copyLink()}>
          <Link2 aria-hidden="true" />
          Copia link con questi pesi
        </button>
        <span className="weights-status" role="status">
          {copied === "ok" ? "Link copiato." : copied === "fail" ? "Copia non disponibile: usa l'indirizzo della pagina." : ""}
        </span>
      </div>
    </div>
  );
}
