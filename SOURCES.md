# Sources And Methodology Notes

Access date for generated data: see `public/data/ranking.json`.

## Primary Tabular Source

The core comparable city metrics come from Il Sole 24 Ore Lab24 / Legambiente / Ambiente Italia, Ecosistema Urbano 2024 tables:

- Piste ciclabili: https://lab24.ilsole24ore.com/ecosistema-urbano/tabelle/2024/piste-ciclabili
- Isole pedonali: https://lab24.ilsole24ore.com/ecosistema-urbano/tabelle/2024/isole-pedonali
- Vittime della strada: https://lab24.ilsole24ore.com/ecosistema-urbano/tabelle/2024/vittime-della-strada
- Tasso di motorizzazione: https://lab24.ilsole24ore.com/ecosistema-urbano/tabelle/2024/tasso-di-motorizzazione
- Passeggeri trasporto pubblico: https://lab24.ilsole24ore.com/ecosistema-urbano/tabelle/2024/passeggeri-trasporto-pubblico
- Offerta trasporto pubblico: https://lab24.ilsole24ore.com/ecosistema-urbano/tabelle/2024/offerta-trasporto-pubblico
- ZTL: https://lab24.ilsole24ore.com/ecosistema-urbano/tabelle/2024/ztl
- Biossido di azoto: https://lab24.ilsole24ore.com/ecosistema-urbano/tabelle/2024/biossido-di-azoto
- PM10: https://lab24.ilsole24ore.com/ecosistema-urbano/tabelle/2024/pm-10
- PM2.5: https://lab24.ilsole24ore.com/ecosistema-urbano/tabelle/2024/pm-25
- Ozono: https://lab24.ilsole24ore.com/ecosistema-urbano/tabelle/2024/ozono

Transform: the pipeline extracts the published city value from `datiTabella.righe[].punti`, keeps the raw value, and creates a 0-100 normalized value. Lower-is-better metrics are inverted.

Publication note: these pages are publicly reachable, but the project does not claim the underlying tables are open data or freely redistributable raw datasets. The HTML snapshots in `data/raw/` are local research artifacts with source attribution, not a substitute for the publisher's terms of use. The public UI omits a raw-indicators download; use ranking/normalized exports and source links instead.

## Official Context Sources

- ISTAT, Ambiente urbano - Anno 2023: https://www.istat.it/comunicato-stampa/ambiente-urbano-anno-2023/
- ISTAT, Questionario 2024 - Mobilita: https://www.istat.it/fascicoloSidi/1720/Questionario%202024%20-%20Mobilit%C3%A0.pdf
- ISTAT / ACI, Incidenti stradali in Italia - Anno 2024: https://www.istat.it/comunicato-stampa/incidenti-stradali-in-italia-2024/
- ACI / ISTAT, Incidenti stradali 2024 nelle 107 province: https://aci.gov.it/comunicati-stampa/aci-istat-gli-incidenti-stradali-2024-nelle-107-province-italiane/
- ISFORT, XXII Rapporto Audimob (sintesi Regione Puglia): https://protezionecivile.regione.puglia.it/web/ufficio-statistico/-/isfort.-xxii-rapporto-sulla-mobilita-degli-italiani
- FIAB, Indagine sui furti di biciclette: https://fiabitalia.it/indagine-furti-bici/

These sources define the public-data context and relevant variables such as TPL, bike sharing, cycle lanes, ZTL and Zone 30. The current pipeline uses Lab24/Legambiente tables where city values are already published in a comparable format.

## National Context Layer (Not Scored)

`public/data/ranking.json` includes a `nationalContext` object separate from city ranking scores. It groups national-level cards on:

- road safety (ISTAT/ACI 2024 injury crashes, cyclist/e-bike incidents and deaths)
- cycling and e-bike market (ISTAT 2024 sales and e-bike share trends)
- capoluogo cycle-lane network stock (ISTAT Ambiente urbano 2023)
- modal trend (ISFORT/Audimob H1 2025 interim summary)
- bicycle thefts (FIAB survey estimate)

Each card and timeline point carries `sourceId`, `label`, `value`, `unit`, `period`, `reliability`, `interpretation`, and `caveat`. `nationalContext.notUsedInRanking` is always true: these facts inform the dashboard but do not change default weights or city scores.

Limitations:

- Audimob H1 2025 is interim/contextual, not a complete annual modal series.
- FIAB theft figures are survey estimates; Italy lacks an official national theft registry comparable across cities.
- National crash and market statistics do not substitute for city-level Lab24 proxies in the ranking.
- Social cost and some communicated thresholds are published as rounded or approximate values.

## Policy And Usage Signals (Sparse, Contextual)

- FIAB ComuniCiclabili: https://www.comuniciclabili.it/
- FIAB 2024 overview: https://www.comuniciclabili.it/2024/
- Pesaro 5 bike-smile, Comune di Pesaro: https://www.comune.pesaro.pu.it/novita-in-comune/dettaglio/news/il-risultato-annunciato-durante-la-cerimonia-dei-comuniciclabili-fiab-promossa-dalla-federazione-ita/
- Parma FIAB 4 bike-smile, Comune di Parma: https://www.comune.parma.it/it/novita/notizie/parma-riconfermata-citta-a-misura-di-bicicletta
- Pordenone 4 bike-smile, Il Friuli/FIAB: https://www.ilfriuli.it/cronaca/municipalita-regionali-comuniciclabili-2024-fiab/
- Bologna, Copenhagenize Index 2025: https://copenhagenizeindex.eu/index.php/project/bologna/
- Historical cycling modal shares, Legambiente / Rete Mobilita Nuova via Il Sole 24 Ore: https://st.ilsole24ore.com/art/notizie/2015-04-29/bolzano-pesaro-ferrara-e-treviso-capitali-bici--085335.shtml?uuid=ABbu1fXD

Transform: these sources are used only for explicit city matches in `data/manual/city-enrichment.json`. Missing values are not imputed.

Coverage reality:

- FIAB bike-smile covers 16 of 106 capoluoghi in the current enrichment file.
- Historical modal-share values cover only a handful of cities and are dated (2015-era reporting).
- Copenhagenize policy score is available only for Bologna.

Because of that sparsity, usage and policy have default weight 0. They remain visible in city detail, `coverageAudit`, and optional UI weighting, but they do not drive the default ranking.

## Coverage Audit

`public/data/ranking.json` includes a `coverageAudit` object with:

- per-category coverage and default-weight inclusion
- per-metric coverage, manual/sparse flags, and registered source ids
- a list of sparse signals excluded from the default score
- notes on how missing evidence is handled when optional weights are enabled

Validation enforces that every category with non-zero default weight has high coverage across the city set and that processed/public outputs stay in sync. The dashboard surfaces this audit between Metodo and Dati so users can see why usage/policy stay contextual.

## Export null semantics

In `ranking.json`, when `rawMetrics[metricId]` is `null` (no source value for that city), `normalizedMetrics[metricId]` is also `null` — not `0`. A normalized value of `0` means the metric was measured and scored at the bottom of the 0–100 scale (for example FIAB bike-smile `1` on the 1–5 scale). In `ranking.csv`, missing metrics are exported as empty cells.

`ranking.csv` is generated by `scripts/csv-export.mjs` (`buildRankingCsvRows`) from `metricDefinitions`: each metric id maps to a `{id}Normalized` column (for example `pedestrianAreasNormalized`, `externalPolicyScoreNormalized`). Base columns are rank, city, score, dataConfidence, and the six category scores. If you depend on a fixed column order in spreadsheets, re-export after pipeline updates — `scripts/export-contract.test.mjs` guards header parity with JSON.

## Gaps Not Scored By Default

- Protected lanes: OSM/Overpass and local open-data portals can support this, but require a city-boundary audit and tag-quality checks before ranking all 106 capoluoghi.
- Bike parking and velostazioni: local open data is uneven; OSM tagging coverage is useful but not uniformly audited.
- Bike/e-bike sharing: ISTAT questionnaire includes the topic, but city-level comparable output is not in the current ingest.
- Perceived safety: no consistent national city-level series was found during this build.
- PNRR/local investment, PUMS, Biciplan: documents exist city by city, but the pipeline needs a separate document registry before scoring.
- Terrain/slope and weather: omitted until the method uses consistent city-boundary sampling instead of centroid-only proxies.

These gaps are exposed in the UI and `public/data/ranking.json` so users can see what is not claimed.

## Legal And Use Caveats

- The dashboard is a local research tool, not an official mobility ranking, safety certification, or legal advice.
- Reuse of publisher tables, FIAB scores, or Copenhagenize material should respect each source's terms, attribution requirements, and update cadence.
- Do not present sparse manual enrichments as if they were nationally comparable official statistics.
