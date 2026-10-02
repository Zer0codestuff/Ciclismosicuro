import { lazy, Suspense } from "react";
import { formatChange, formatNumber, formatPercent } from "../lib/format";
import type { RankedCity, RankingPayload } from "../types";

const charts = () => import("../charts/AnalysisCharts");
const NationalBars = lazy(() => charts().then((m) => ({ default: m.NationalBars })));
const SafetyInNumbersChart = lazy(() => charts().then((m) => ({ default: m.SafetyInNumbersChart })));
const InfrastructureRiskChart = lazy(() => charts().then((m) => ({ default: m.InfrastructureRiskChart })));
const OpponentBars = lazy(() => charts().then((m) => ({ default: m.OpponentBars })));
const HourChart = lazy(() => charts().then((m) => ({ default: m.HourChart })));

function Loading({ height }: { height: number }) {
  return (
    <div className="chart-loading" style={{ minHeight: height }}>
      Caricamento grafico…
    </div>
  );
}

function correlationWord(rho: number): string {
  const magnitude = Math.abs(rho);
  if (magnitude < 0.15) return "nessuna relazione apprezzabile";
  if (magnitude < 0.35) return "una relazione debole";
  if (magnitude < 0.6) return "una relazione moderata";
  return "una relazione forte";
}

export function AnalysisSection({
  payload,
  cities,
  selectedId,
  onSelectCity
}: {
  payload: RankingPayload;
  cities: RankedCity[];
  selectedId: string;
  onSelectCity: (id: string) => void;
}) {
  const { findings, national, model } = payload;
  const selected = cities.find((city) => city.id === selectedId);
  const doublingCasualties = formatChange(1, findings.casualtiesWhenDoubling);
  const ci = findings.safetyInNumbersCi.map((value) => formatNumber(value, 2)).join("–");

  return (
    <section className="section analysis-section" id="analisi" aria-labelledby="analysis-title">
      <div className="section-heading">
        <p className="eyebrow">Cosa dicono i dati</p>
        <h2 id="analysis-title">Cinque letture dei dati</h2>
        <p className="section-lead">
          Calcolati sugli stessi dati della classifica. Clicca un punto nei grafici per aprire la scheda della città
          {selected ? ` (ora evidenziata: ${selected.name})` : ""}.
        </p>
      </div>

      <article className="finding">
        <div className="finding-text">
          <span className="finding-number">1</span>
          <h3>Meno morti in bici, ma i feriti non calano</h3>
          <p>
            Nel {findings.lastYear} sono morti {formatNumber(findings.cyclistKilledLastYear)} ciclisti, contro una media
            di {formatNumber(findings.cyclistKilledPreAverage, 0)} l'anno nel 2015–2019 (
            {formatChange(findings.cyclistKilledPreAverage, findings.cyclistKilledLastYear)}). I feriti restano invece
            stabili, intorno a {formatNumber(findings.cyclistInjuredRecentAverage)} l'anno. Le e-bike pesano sempre di
            più: dal {formatPercent(findings.ebikeShareFirst)} delle vittime in bici nel 2021 al{" "}
            {formatPercent(findings.ebikeShareLast)} nel {findings.lastYear}. Circa{" "}
            {formatPercent(findings.capitalsShareOfCyclistCasualties)} dei ciclisti morti o feriti si registra nei
            {" "}{payload.cityCount} capoluoghi analizzati.
          </p>
          <p className="fine-print">Il 2020, anno dei lockdown, è in grigio.</p>
        </div>
        <div className="finding-charts two-up">
          <figure>
            <figcaption>Ciclisti morti, Italia</figcaption>
            <Suspense fallback={<Loading height={210} />}>
              <NationalBars data={national} field="cyclistKilled" color="#0b5f54" label="Ciclisti morti" />
            </Suspense>
          </figure>
          <figure>
            <figcaption>Ciclisti feriti, Italia</figcaption>
            <Suspense fallback={<Loading height={210} />}>
              <NationalBars data={national} field="cyclistInjured" color="#33998a" label="Ciclisti feriti" />
            </Suspense>
          </figure>
        </div>
      </article>

      <article className="finding">
        <div className="finding-text">
          <span className="finding-number">2</span>
          <h3>L'uso storico della bici aiuta a leggere i conteggi</h3>
          <p>
            A parità di popolazione, una quota di pendolari in bici del 2011 doppia è associata nel modello a
            conteggi attesi di morti e feriti {doublingCasualties} (esponente{" "}
            {formatNumber(findings.safetyInNumbersExponent, 2)}, intervallo approssimato 95% {ci}). È una
            relazione tra città, compatibile con l'ipotesi “safety in numbers”, non la misura di un effetto causale.
          </p>
          <p>
            I morti e feriti per abitante sono correlati all'uso storico della bici (Spearman{" "}
            {formatNumber(findings.perResidentVsBikeShareCorrelation, 2)}). Il rapporto osservati/attesi serve a
            confrontare i conteggi con il modello; senza chilometri percorsi recenti non stima il rischio per viaggio.
          </p>
        </div>
        <figure className="finding-charts">
          <figcaption>Ogni punto è un capoluogo; la linea è il modello stimato ({model.injury.period})</figcaption>
          <Suspense fallback={<Loading height={340} />}>
            <SafetyInNumbersChart
              cities={cities}
              selectedId={selectedId}
              intercept={model.injury.intercept}
              exponent={model.injury.exponent}
              onSelectCity={onSelectCity}
            />
          </Suspense>
        </figure>
      </article>

      <article className="finding">
        <div className="finding-text">
          <span className="finding-number">3</span>
          <h3>La lunghezza delle piste racconta solo parte della rete</h3>
          <p>
            I km di piste per abitante mostrano {correlationWord(findings.lanesVsBikeShareCorrelation)} con la quota
            di pendolari in bici del 2011 (Spearman {formatNumber(findings.lanesVsBikeShareCorrelation, 2)}). Nel
            confronto con i rapporti osservati/attesi{" "}
            {Math.abs(findings.lanesVsRiskCorrelation) < 0.15
              ? "non mostrano alcuna relazione apprezzabile"
              : `mostrano ${correlationWord(findings.lanesVsRiskCorrelation)}`}{" "}
            (Spearman {formatNumber(findings.lanesVsRiskCorrelation, 2)}). Anche l'incidentalità generale è associata
            al rapporto (Spearman {formatNumber(findings.roadCasualtiesVsRiskCorrelation, 2)}): dati osservazionali
            che non isolano l'effetto della rete ciclabile.
          </p>
          <p className="fine-print">
            I km dichiarati non misurano continuità, protezione e incroci. Una correlazione debole in questo dataset
            non dimostra che costruire ciclabili sia inefficace.
          </p>
        </div>
        <figure className="finding-charts">
          <figcaption>Piste ciclabili per abitante e morti/feriti rispetto all'atteso; riferimento = 1×</figcaption>
          <Suspense fallback={<Loading height={340} />}>
            <InfrastructureRiskChart cities={cities} selectedId={selectedId} onSelectCity={onSelectCity} />
          </Suspense>
        </figure>
      </article>

      <article className="finding">
        <div className="finding-text">
          <span className="finding-number">4</span>
          <h3>Auto, incroci ed età nei casi registrati</h3>
          <p>
            Nel {findings.profile.period}, il {formatPercent(findings.profile.carShare)} dei ciclisti morti o feriti è
            stato coinvolto in un incidente con un'auto e il {formatPercent(findings.profile.intersectionShare)} a un
            incrocio o una rotatoria. I ciclisti di almeno 65 anni sono il{" "}
            {formatPercent(findings.profile.over64ShareOfCasualties)} dei morti e feriti di età nota e il{" "}
            {formatPercent(findings.profile.over64ShareOfDeaths)} dei morti di età nota. Il grafico mostra la
            distribuzione oraria dei casi, non il rischio per ora pedalata.
          </p>
        </div>
        <div className="finding-charts two-up">
          <figure>
            <figcaption>Con chi si scontrano i ciclisti</figcaption>
            <Suspense fallback={<Loading height={200} />}>
              <OpponentBars opponents={findings.profile.opponents} total={findings.profile.casualties} />
            </Suspense>
            <p className="chart-note">Categorie esclusive; “più veicoli” può includere auto. Le quote del testo contano qualsiasi auto coinvolta.</p>
          </figure>
          <figure>
            <figcaption>A che ora (quota dei morti e feriti con ora nota)</figcaption>
            <Suspense fallback={<Loading height={190} />}>
              <HourChart hours={findings.profile.hours} />
            </Suspense>
          </figure>
        </div>
      </article>

      <article className="finding">
        <div className="finding-text">
          <span className="finding-number">5</span>
          <h3>Nord e Sud: due Italie della bici</h3>
          <p>
            Al Nord la quota mediana di pendolari in bici è{" "}
            {formatNumber(findings.macroAreas.find((area) => area.area === "Nord")?.medianBikeShare, 1)}%, nel
            Mezzogiorno {formatNumber(findings.macroAreas.find((area) => area.area === "Mezzogiorno")?.medianBikeShare, 1)}%.
            Il rapporto osservati/attesi varia tra aree. Le differenze di letalità urbana possono dipendere da età,
            gravità e composizione degli incidenti o sottonotifica dei feriti: non consentono di attribuire a una
            regione una maggiore sicurezza.
          </p>
        </div>
        <div className="finding-charts">
          <table className="data-table">
            <caption className="sr-only">Confronto per area geografica (valori mediani)</caption>
            <thead>
              <tr>
                <th scope="col">Area</th>
                <th scope="col">Capoluoghi</th>
                <th scope="col">Pendolari in bici</th>
                <th scope="col">Morti e feriti / attesi</th>
                <th scope="col">Letalità urbana</th>
                <th scope="col">Indice standard</th>
              </tr>
            </thead>
            <tbody>
              {findings.macroAreas.map((area) => (
                <tr key={area.area}>
                  <th scope="row">{area.area}</th>
                  <td>{area.cities}</td>
                  <td>{formatNumber(area.medianBikeShare, 1)}%</td>
                  <td>{formatNumber(area.medianRiskRatio, 2)}×</td>
                  <td>{formatNumber(area.medianLethalityIndex, 2)}×</td>
                  <td>{formatNumber(area.medianScore, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fine-print">
            Valori mediani tra i capoluoghi di ciascuna area. Letalità urbana: morti sul totale di morti e feriti nelle
            strade urbane, rispetto alla media dei capoluoghi.
          </p>
        </div>
      </article>
    </section>
  );
}
