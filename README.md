# Ciclismo Sicuro

Una dashboard di analisi esplorativa su **110 capoluoghi**: incidenti dei ciclisti ISTAT 2015–2024, infrastruttura comunale 2019–2024, pendolarismo 2011 e parco auto ACI 2025. Ricerca, mappa, confronto tra città, grafici, pesi regolabili e download JSON/CSV.

Il progetto confronta **casi registrati e indicatori urbani**. Il pendolarismo 2011 è un proxy storico: senza dati recenti sui viaggi e sui chilometri percorsi, il rapporto osservati/attesi non misura il rischio individuale attuale. La classifica è editoriale, non una certificazione di sicurezza.

[Fonti e metodologia](SOURCES.md) · [Rapporto della revisione](AUDIT.md)

## Avvio

Serve Node.js 22 o successivo.

```bash
npm ci
npm run dev
```

Il dataset verificato è già incluso in `public/data/`; non occorre scaricare centinaia di MB per vedere il sito. Apri l'indirizzo stampato da Vite, normalmente `http://127.0.0.1:5173/`.

## Riprodurre l'analisi

```bash
npm run data:download
npm run data:extract
npm run data:build
npm run data:validate
```

Oppure `npm run data` per eseguire tutti i passaggi ufficiali. Gli archivi originali vengono conservati in `data/raw/`, esclusa da Git; i download esistenti sono riutilizzati. Il download registra URL, dimensione e SHA-256 delle 23 fonti in `data/source-manifest.json`. `npm run data:provenance -- --check` verifica gli archivi presenti rispetto al manifest, senza modificarlo. `npm run data:download -- --force` aggiorna le fonti e il manifest, quindi può cambiare il risultato se il produttore revisiona i dati.

La raccolta OpenStreetMap è facoltativa e non entra nell'indice:

```bash
npm run data:osm
npm run data:build
```

Le query sono limitate nel tempo, salvano una cache per comune e registrano risultati mancanti e copertura. La raccolta può essere ripresa, anche per un sottoinsieme (`npm run data:osm -- --cities=015146 --max-seconds=120`). `--cached-only` pubblica le cache senza rete. Lo snapshot incluso copre 8 città su 110; le altre restano mancanti. `npm run data:all` include anche questo passaggio; il resto della pipeline funziona quando Overpass non è disponibile.

### Organizzazione

- `scripts/pipeline/config.mjs`: URL, finestre temporali e configurazione.
- `scripts/pipeline/extract-*.mjs`: estrazione da ZIP, tabelle XLSX e file censuari.
- `scripts/pipeline/methodology.mjs`: definizioni, pesi interni e normalizzazione.
- `scripts/pipeline/lib/stats.mjs`: regressione, empirical Bayes, intervalli Gamma, correlazioni e campionamento.
- `scripts/pipeline/build-index.mjs`: modello, indice, copertura e sensibilità.
- `data/intermediate/`: estratti aggregati per riprodurre il calcolo senza riscaricare gli archivi.
- `data/source-manifest.json`: impronte SHA-256 degli archivi ufficiali usati nell'estrazione.
- `public/data/ranking.json`: dataset schema 2, indicatori, punteggi, serie, fonti e limiti.
- `public/data/ranking.csv`: pesi standard, indicatori grezzi e normalizzati, copertura e scenari.
- `src/lib/`: validazione del payload, scoring e stato condivisibile nell'URL.
- `src/components/` e `src/charts/`: dashboard e grafici; mappa stradale caricata su richiesta.

Gli output della precedente pipeline Lab24/schema 1 sono stati sostituiti. Non esiste più `normalized-indicators.json`: i punteggi normalizzati si trovano nel JSON completo e nel CSV.

## Indice e limiti

Pesi standard dei pilastri:

| Pilastro | Peso | Indicatori con peso positivo |
| --- | ---: | --- |
| Incidentalità ciclistica osservata | 40 | Morti+feriti 2022–2024 (60%); morti 2015–2024 (40%), entrambi osservati/attesi |
| Infrastruttura | 25 | Km di piste per abitante (70%); crescita 2019–2024 (30%) |
| Pressione del traffico | 20 | Auto per abitante (40%); morti+feriti stradali (40%); presenza Zone 30 (20%) |
| Uso storico e sharing | 15 | Pendolari in bici 2011 (70%); bike sharing 2024 (30%) |
| Trasporto pubblico | 0 | Domanda e offerta, attivabili dai cursori |
| Aria | 0 | PM10 e NO2, attivabili dai cursori |

La normalizzazione dei rapporti è `100 / (1 + r²)`; gli altri valori usano percentili 5–95, con trasformazioni logaritmiche dichiarate. I dati mancanti restano `null`, sono esclusi dalle medie e la copertura dei pesi viene mostrata. Se tutti i pilastri selezionati mancano, la città resta senza punteggio e posizione.

La scheda distingue tre cose: intervallo al 90% del rapporto condizionato al modello; sensibilità della posizione a 2.000 combinazioni di pesi; scenari con il solo proxy di una città dimezzato/raddoppiato. Questi ultimi due non sono intervalli di confidenza.

Restano limiti rilevanti: esposizione datata, feriti non denunciati, composizione demografica, incidenti extraurbani compresi nei confini comunali e qualità della rete non misurata. Correlazioni tra città non dimostrano effetti causali. I periodi delle diverse fonti non sono simultanei.

## Verifiche e deploy

```bash
npm run data:validate
npm run lint
npm run typecheck
npm test
npm run build
```

Per GitHub Pages:

```bash
VITE_BASE_PATH=/Ciclismosicuro/ npm run build
```

L'app usa `import.meta.env.BASE_URL` per dati, logo e download. Il workflow GitHub Actions verifica e pubblica i push su `main`.

## Attribuzione

ISTAT: CC BY 4.0, secondo i termini delle pubblicazioni. ACI: [CC BY 4.0](https://aci.gov.it/attivita-e-progetti/studi-e-ricerche/open-data/), con attribuzione della fonte. OpenStreetMap: © OpenStreetMap contributors, ODbL 1.0; la presenza di derivati OSM non viene trasformata in una licenza CC BY generale del dataset. Il logo e le illustrazioni PNG trasparenti sono stati generati con la skill `imagegen`. [Asset e prompt delle illustrazioni](public/assets/ILLUSTRATIONS.md); la dashboard carica le versioni WebP leggere, con fallback PNG.
