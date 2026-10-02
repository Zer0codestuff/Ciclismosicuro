import { Download, ExternalLink } from "lucide-react";
import { withBase } from "../lib/assets";
import { formatNumber } from "../lib/format";
import { PILLAR_COLORS } from "../lib/scoring";
import type { RankingPayload } from "../types";

export function MethodSection({ payload }: { payload: RankingPayload }) {
  const sourceById = new Map(payload.sources.map((source) => [source.id, source]));
  const { model } = payload;
  return (
    <section className="section method-section" id="metodo" aria-labelledby="method-title">
      <div className="section-heading">
        <p className="eyebrow">Metodo e fonti</p>
        <h2 id="method-title">Come è costruito l'indice</h2>
        <p className="section-lead">
          Tutti i dati sono pubblici e la pipeline che li scarica e li elabora è nel repository: chiunque può rifare il
          calcolo con <code>npm run data</code>.
        </p>
      </div>

      <div className="method-steps">
        <article>
          <span className="step-number">1</span>
          <h3>Gli incidenti veri dei ciclisti</h3>
          <p>
            Dai microdati ISTAT (un record per ogni incidente con feriti, 2015–2024) contiamo per ogni comune i
            conducenti e passeggeri di biciclette ed e-bike morti entro 30 giorni o feriti. I codici di esito di
            conducenti e passeggeri sono letti separatamente. Il file pubblico descrive al massimo tre veicoli per
            incidente: confrontiamo anche i totali con le tavole ufficiali.
          </p>
        </article>
        <article>
          <span className="step-number">2</span>
          <h3>Il confronto con l'esposizione</h3>
          <p>
            Più gente pedala, più incidenti ci saranno. Un modello di Poisson stima quanti ciclisti colpiti aspettarsi
            in base agli abitanti e alla quota di pendolari in bici del 2011 (esponente {formatNumber(model.injury.exponent, 2)}
            ). Il rapporto osservati/attesi è stimato con un metodo empirical-Bayes che riconduce verso 1 le città con
            pochi casi. L'intervallo al 90% è condizionato al modello stimato e al proxy storico; non include
            l'incertezza sull'esposizione attuale né tutti gli errori di rilevazione.
          </p>
        </article>
        <article>
          <span className="step-number">3</span>
          <h3>Dal dato al punteggio</h3>
          <p>
            Il rapporto r diventa un punteggio 100/(1+r²): 50 significa “come atteso”, 80 corrisponde a r = 0,5,
            20 a r = 2.
            Gli altri indicatori sono scalati 0–100 tra il 5° e il 95° percentile dei capoluoghi (in scala logaritmica
            quelli molto asimmetrici), invertendoli dove un valore basso è meglio.
          </p>
        </article>
        <article>
          <span className="step-number">4</span>
          <h3>Pilastri, pesi e sensibilità</h3>
          <p>
            Ogni pilastro è la media pesata dei suoi indicatori disponibili; l'indice è la media pesata dei pilastri.
            Per mostrare quanto la classifica dipende dai pesi, la ricalcoliamo con{" "}
            {formatNumber(model.sensitivity.draws)} combinazioni casuali di pesi attorno a quelli standard e riportiamo
            l'intervallo che contiene il 90% delle posizioni.
          </p>
        </article>
      </div>

      <h3 className="subheading">Pilastri e indicatori</h3>
      <div className="pillar-definitions">
        {payload.pillars.map((pillar) => (
          <details key={pillar.id} className="pillar-definition">
            <summary>
              <span className="pillar-dot" style={{ background: PILLAR_COLORS[pillar.id] }} aria-hidden="true" />
              <strong>{pillar.label}</strong>
              <span className="tag">{pillar.defaultWeight ? `peso ${pillar.defaultWeight}%` : "contesto, peso 0"}</span>
            </summary>
            <p>{pillar.description}</p>
            <ul>
              {payload.metrics
                .filter((metric) => metric.pillar === pillar.id)
                .map((metric) => (
                  <li key={metric.id}>
                    <strong>{metric.label}</strong>{" "}
                    <span className="muted">
                      ({Math.round(metric.weight * 100)}% del pilastro · {metric.period} ·{" "}
                      {metric.sourceIds.map((id) => sourceById.get(id)?.publisher ?? id).filter((v, i, a) => a.indexOf(v) === i).join(", ")})
                    </span>
                    <br />
                    {metric.description}
                  </li>
                ))}
            </ul>
          </details>
        ))}
      </div>

      <div className="method-columns">
        <div className="panel">
          <h3>Limiti da tenere a mente</h3>
          <ul className="limit-list">
            {payload.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <h3>Scarica i dati</h3>
          <p>ISTAT e ACI: CC BY 4.0 con attribuzione. Le componenti derivate da OpenStreetMap sono soggette a ODbL 1.0.</p>
          <div className="download-list">
            <a className="button button-primary" href={withBase("data/ranking.csv")} download>
              <Download aria-hidden="true" />
              Classifica (CSV)
            </a>
            <a className="button button-ghost" href={withBase("data/ranking.json")} download>
              <Download aria-hidden="true" />
              Dataset completo (JSON)
            </a>
          </div>
          <h4>Dettagli del modello</h4>
          <dl className="model-facts">
            <div>
              <dt>Morti e feriti ({model.injury.period})</dt>
              <dd>
                esponente {formatNumber(model.injury.exponent, 3)} ± {formatNumber(model.injury.exponentSe, 3)} ·
                sovradispersione {formatNumber(model.injury.dispersion, 1)} · prior α {formatNumber(model.injury.priorAlpha, 1)}
              </dd>
            </div>
            <div>
              <dt>Morti ({model.fatality.period})</dt>
              <dd>
                esponente {formatNumber(model.fatality.exponent, 3)} ± {formatNumber(model.fatality.exponentSe, 3)} ·
                sovradispersione {formatNumber(model.fatality.dispersion, 1)} · prior α{" "}
                {formatNumber(model.fatality.priorAlpha, 1)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <h3 className="subheading">Fonti</h3>
      <div className="source-grid">
        {payload.sources.map((source) => (
          <article key={source.id} className="source-card">
            <span className="source-publisher">{source.publisher}</span>
            <h4>{source.title}</h4>
            <p>{source.notes}</p>
            <p className="muted">
              Periodo {source.period} · {source.license}
            </p>
            <a href={source.url} target="_blank" rel="noreferrer">
              Apri la fonte
              <ExternalLink aria-hidden="true" />
              <span className="sr-only"> (si apre in una nuova scheda)</span>
            </a>
          </article>
        ))}
      </div>
    </section>
  );
}
