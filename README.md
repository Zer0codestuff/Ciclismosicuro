# Ciclismo Sicuro

Dashboard locale per classificare i capoluoghi italiani piu promettenti per chi si muove in bicicletta. Il ranking default usa solo metriche Lab24 comparabili su tutti i capoluoghi; segnali manuali restano contestuali e attivabili con pesi opzionali.

## Cosa include

- Dashboard React/TypeScript con ranking, ricerca, filtri, tabella ordinabile e grafici.
- Scheda citta con score, rank, punti forti, debolezze, metriche, fonti e incertezza.
- Metodologia con formula, pesi regolabili, normalizzazione 0-100, missing-data policy e audit di copertura in UI.
- Data explorer con download ranking CSV/JSON e dati normalizzati (senza raw indicators pubblici).
- Pipeline rerunnable per scaricare e trasformare tabelle Lab24/Legambiente 2024.
- Layer `nationalContext` in `ranking.json` con fatti nazionali su sicurezza stradale, mercato bici/e-bike, rete ciclabile capoluoghi, trend modale e furti (non usati nel ranking).
- Asset logo PNG trasparente generato con la skill `imagegen`.

## Avvio

```bash
npm install
npm run data
npm run dev
```

Apri il sito all'URL stampato da Vite, normalmente:

```text
http://127.0.0.1:5173/
```

## Deploy sotto subpath

Per GitHub Pages o altri host con prefisso (es. `/Ciclismosicuro/`), imposta la base Vite prima del build:

```bash
VITE_BASE_PATH=/Ciclismosicuro/ npm run build
```

L'app usa `import.meta.env.BASE_URL` per fetch JSON, logo e link di download, quindi funziona anche fuori dalla root del dominio.

## Validazione

```bash
npm run data:validate
npm run lint
npm run typecheck
npm test
npm run build
```

## Pipeline dati

La pipeline principale e `scripts/build-data.mjs`.

Output principali:

- `public/data/ranking.json`
- `public/data/ranking.csv`
- `public/data/normalized-indicators.json`
- `data/processed/ranking.json`
- `data/processed/ranking.csv`
- `data/processed/raw-indicators.json`
- `data/raw/*.html`

I dati Lab24/Legambiente sono scaricati dalle pagine tabellari 2024. I segnali manuali, come FIAB, Copenhagenize o quote modali storiche, sono in `data/manual/city-enrichment.json`: restano nel dataset per contesto e pesi opzionali, ma non entrano nel ranking default perche hanno copertura molto bassa e non sono comparabili su tutti i capoluoghi.

## Score

Le metriche sono normalizzate 0-100. Per metriche dove valori bassi sono migliori, come incidentalita, motorizzazione e inquinanti, la scala viene invertita.

Pesi default (solo categorie con copertura ampia sui 106 capoluoghi):

- Infrastruttura: 50
- Sicurezza: 25
- Connessioni: 15
- Comfort: 5
- Confidenza dati: 5
- Uso bici: 0 (contestuale, attivabile manualmente)
- Policy: 0 (contestuale, attivabile manualmente)

Se una categoria con peso non nullo non ha dati per una citta, la categoria riceve un valore prudente pari a 20 invece di essere esclusa dal denominatore. Questo penalizza lacune di copertura senza inventare dati.

Il payload `coverageAudit` in `ranking.json` espone copertura per metrica/categoria, segnali sparsi e quali categorie entrano nel ranking default. La sezione Copertura in UI riassume categorie default, categorie contestuali e segnali sparsi.

Il payload `nationalContext` espone invece contesto nazionale (incidenti, mercato bici/e-bike, rete ciclabile capoluoghi, trend modale provvisorio, stime furti FIAB) con fonti, periodi, affidabilita e caveat. Non modifica pesi o score cittadini.

## Limiti dichiarati

- I valori tabellari Lab24/Legambiente sono pubblicati online ma non sono trattati come dataset raw aperti o ridistribuibili: la pipeline li estrae per ricerca locale e documenta le fonti. L'UI non offre download dei raw indicators per ridurre il rischio di ripubblicazione; ranking e normalizzazioni restano scaricabili con attribuzione.
- FIAB, Copenhagenize e quote modali storiche coprono solo una minoranza di citta; sono segnali contestuali, non pilastri del ranking default.
- Il contesto nazionale (`nationalContext`) include stime FIAB sui furti e dati provvisori Audimob H1 2025: utili informativamente, non comparabili con il ranking cittadino.
- Protected lanes, bike parking, bike/e-bike sharing, PNRR/local investment, meteo e pendenze non sono nello score default perche richiedono un audit comparabile per tutti i capoluoghi. Sono registrati come gap in `SOURCES.md` e nel dataset.
- Il ranking e uno strumento informativo locale: non e una certificazione ufficiale ne un parere legale sulla sicurezza stradale o sulla qualita ciclabile.
