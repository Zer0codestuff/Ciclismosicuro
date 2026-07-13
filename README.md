# Ciclismo Sicuro

Dashboard locale per esplorare proxy urbani rilevanti per la ciclabilita nei capoluoghi italiani. L'indice default non misura direttamente la sicurezza di chi pedala: combina dotazione ciclabile equivalente, incidentalita stradale generale, motorizzazione e TPL. I pesi sono editoriali e regolabili, non coefficienti validati statisticamente.

## Cosa include

- Dashboard React/TypeScript con indice esplorativo, ricerca, filtri, tabella ordinabile e grafici.
- Scheda citta con score, rank, punti forti, debolezze, metriche, fonti e incertezza.
- Metodologia con formula, periodi osservati, pesi regolabili, normalizzazione robusta 0-100, missing-data policy e audit di copertura in UI.
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

I dati Lab24/Legambiente sono scaricati dalle pagine tabellari 2024 e riguardano soprattutto il 2023; l'incidentalita stradale e del 2022. La pipeline verifica l'ID dell'indicatore remoto e tratta le righe `ndSN=1` come mancanti, anche quando il sito inserisce un placeholder numerico pari a zero. In caso di errore di rete puo riusare gli snapshot locali gia validati.

I segnali manuali, come FIAB, Copenhagenize o quote modali storiche, sono in `data/manual/city-enrichment.json`: restano nel dataset per contesto e pesi opzionali, ma non entrano nell'indice default perche hanno copertura molto bassa e non sono comparabili su tutti i capoluoghi.

## Indice default

Le metriche sono normalizzate 0-100 limitando gli estremi tramite percentili, per evitare che pochi outlier comprimano tutte le altre citta. I due indicatori TPL sono normalizzati separatamente per citta piccole, medie e grandi. Per metriche dove valori bassi sono migliori la scala viene invertita.

Pesi default (solo categorie con copertura ampia sui 106 capoluoghi):

- Infrastruttura: 30
- Sicurezza stradale (proxy): 30
- Connessioni: 30
- Comfort: 0 (contestuale: copertura insufficiente)
- Confidenza dati: 0 (mostrata separatamente, non deve migliorare il punteggio)
- Uso bici: 0 (contestuale, attivabile manualmente)
- Policy: 0 (contestuale, attivabile manualmente)

Se una categoria con peso non nullo non ha dati per una citta, la categoria riceve un valore prudente pari a 20 invece di essere esclusa dal denominatore. Questo penalizza lacune di copertura senza inventare dati.

La somma dei pesi default e 90: contano i rapporti tra i pesi. Infrastruttura usa nel default solo le piste equivalenti; aree pedonali e ZTL restano contestuali per copertura o comparabilita insufficiente.

Il payload `coverageAudit` in `ranking.json` espone copertura per metrica/categoria, segnali sparsi e quali categorie entrano nell'indice default. `methodologyCaveats` espone invece i limiti che impediscono di interpretarlo come misura diretta della sicurezza ciclistica.

Il payload `nationalContext` espone invece contesto nazionale (incidenti, mercato bici/e-bike, rete ciclabile capoluoghi, trend modale provvisorio, stime furti FIAB) con fonti, periodi, affidabilita e caveat. Non modifica pesi o score cittadini.

## Limiti dichiarati

- I valori tabellari Lab24/Legambiente sono pubblicati online ma non sono trattati come dataset raw aperti o ridistribuibili: la pipeline li estrae per ricerca locale e documenta le fonti. L'UI non offre download dei raw indicators per ridurre il rischio di ripubblicazione; ranking e normalizzazioni restano scaricabili con attribuzione.
- FIAB, Copenhagenize e quote modali storiche coprono solo una minoranza di citta; sono segnali contestuali, non pilastri del ranking default.
- Il contesto nazionale (`nationalContext`) include stime FIAB sui furti e dati provvisori Audimob H1 2025: utili informativamente, non comparabili con il ranking cittadino.
- Mancano incidenti specifici dei ciclisti rapportati all'esposizione, continuita e protezione reale della rete, velocita del traffico, qualita delle intersezioni, percezione di sicurezza e quota modale recente.
- Protected lanes, bike parking, bike/e-bike sharing, PNRR/local investment, meteo e pendenze non sono nell'indice default perche richiedono un audit comparabile per tutti i capoluoghi.
- L'indice e uno strumento esplorativo: non e una classifica delle citta piu sicure, una certificazione o una stima del rischio individuale.
