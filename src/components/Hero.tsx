import { ArrowRight, Search } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { formatChange, formatNumber, formatPercent } from "../lib/format";
import { withBase } from "../lib/assets";
import { cityMatchesQuery, searchKey } from "../lib/urlState";
import type { RankedCity, RankingPayload } from "../types";

export function Hero({
  payload,
  cities,
  onSelectCity
}: {
  payload: RankingPayload;
  cities: RankedCity[];
  onSelectCity: (id: string) => void;
}) {
  const { findings } = payload;
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const alphabetical = [...cities].sort((a, b) => a.name.localeCompare(b.name, "it"));

  function submit(event: FormEvent) {
    event.preventDefault();
    const exact = cities.find((city) => searchKey(city.name) === searchKey(query));
    const partial = cities.filter((city) => cityMatchesQuery(city, query));
    const match = exact ?? (partial.length === 1 ? partial[0] : null);
    if (match) {
      setMessage(null);
      onSelectCity(match.id);
      return;
    }
    setMessage(
      partial.length > 1
        ? `${partial.length} capoluoghi corrispondono: scegli dall'elenco.`
        : `Nessun capoluogo trovato. Sono inclusi ${payload.cityCount} capoluoghi nel dataset.`
    );
  }

  return (
    <section className="hero" id="top" aria-labelledby="hero-title">
      <div className="hero-copy">
        <p className="eyebrow">
          Dati ISTAT {payload.national[0].year}–{findings.lastYear} · {payload.cityCount} capoluoghi · fonti aperte
        </p>
        <h1 id="hero-title">Quanto è sicuro pedalare nei capoluoghi italiani?</h1>
        <p className="hero-lead">
          Dieci anni di incidenti registrati da ISTAT, rete ciclabile e mobilità per leggere le differenze tra
          città. Esplora i dati, confronta i capoluoghi e scopri quanto cambia la classifica con i tuoi pesi.
        </p>
        <p className="hero-caveat">
          Il confronto usa i pendolari in bici del 2011 come proxy storico: non misura il rischio per viaggio
          né certifica la sicurezza di una città.
        </p>
        <form className="hero-search" onSubmit={submit} role="search">
          <label htmlFor={inputId} className="sr-only">
            Cerca la tua città
          </label>
          <Search aria-hidden="true" />
          <input
            id={inputId}
            list={listId}
            value={query}
            autoComplete="off"
            placeholder="Cerca la tua città (es. Bologna)"
            onChange={(event) => {
              setQuery(event.target.value);
              setMessage(null);
            }}
          />
          <datalist id={listId}>
            {alphabetical.map((city) => (
              <option key={city.id} value={city.name} />
            ))}
          </datalist>
          <button type="submit" className="button button-primary">
            Apri scheda
            <ArrowRight aria-hidden="true" />
          </button>
        </form>
        {message ? (
          <p className="hero-search-message" role="status">
            {message}
          </p>
        ) : null}
        <div className="hero-links">
          <a href="#classifica">Vai alla classifica completa</a>
          <a href="#analisi">Leggi cosa emerge dai dati</a>
        </div>
      </div>
      <div className="hero-visual">
        <picture>
          <source srcSet={withBase("assets/cycling-city-hero.webp")} type="image/webp" />
          <img className="hero-illustration" src={withBase("assets/cycling-city-hero.png")} alt=""
            width={1536} height={1024} decoding="async" fetchPriority="high" />
        </picture>
        <dl className="hero-stats" aria-label="Numeri chiave in Italia">
          <div className="stat-tile">
            <dt>Ciclisti morti nel {findings.lastYear}</dt>
            <dd>
              <strong>{formatNumber(findings.cyclistKilledLastYear)}</strong>
              <span>
                {formatChange(findings.cyclistKilledPreAverage, findings.cyclistKilledLastYear)} rispetto alla media
                2015–2019
              </span>
            </dd>
          </div>
          <div className="stat-tile">
            <dt>Ciclisti feriti nel {findings.lastYear}</dt>
            <dd>
              <strong>{formatNumber(findings.cyclistInjuredLastYear)}</strong>
              <span>
                {formatChange(findings.cyclistInjuredPreAverage, findings.cyclistInjuredLastYear)} rispetto alla media
                2015–2019
              </span>
            </dd>
          </div>
          <div className="stat-tile">
            <dt>Vittime in bici coinvolte con un'auto</dt>
            <dd>
              <strong>{formatPercent(findings.profile.carShare)}</strong>
              <span>
                e il {formatPercent(findings.profile.intersectionShare)} agli incroci ({findings.profile.period})
              </span>
            </dd>
          </div>
          <div className="stat-tile">
            <dt>65 anni e oltre tra i ciclisti morti di età nota</dt>
            <dd>
              <strong>{formatPercent(findings.profile.over64ShareOfDeaths)}</strong>
              <span>sono il {formatPercent(findings.profile.over64ShareOfCasualties)} dei morti e feriti di età nota ({findings.profile.period})</span>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
