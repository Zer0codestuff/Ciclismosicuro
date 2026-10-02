# Revisione del 2 ottobre 2026

Ripresa del thread T3 `cc1e8da7-309a-4b13-bd6b-63136147fee8`, interrotto durante la migrazione da Lab24 alla pipeline di fonti ufficiali. La nuova struttura era utile, ma l'estrazione, le interpretazioni statistiche e la verifica della dashboard richiedevano correzioni prima della pubblicazione. La migrazione a schema 2 è stata completata mantenendo lo stile verde/crema.

## Correzioni principali

| Problema riscontrato | Risultato della revisione |
| --- | --- |
| Esiti dei passeggeri letti come quelli dei conducenti | Codifiche separate e passeggeri aggiuntivi inclusi; totali 2024 coincidenti con ISTAT |
| Età e ore non uniformi tra archivi | Classificazioni annuali normalizzate; denominatori con età/ora nota, senza trasformare un'ora mancante in mezzanotte |
| E-bike presentate come serie omogenea | Discontinuità da maggio 2020 dichiarata nei grafici e nelle fonti |
| Esposizione ciclistica del 2011 interpretata come rischio attuale | Rapporto osservati/attesi esplicitamente condizionato a un proxy storico, senza interpretazioni per viaggio o causali |
| Popolazioni mancanti per gli anni precedenti al 2019 | Aggiunta la ricostruzione ISTAT 2015–2018; anni-persona calcolati con entrambi gli estremi annuali per tutti i comuni |
| Mancanze convertite in zero e crescita con anno iniziale variabile | `null` preservati; crescita esattamente 2019–2024; copertura dei pesi pubblicata per città e pilastro |
| Copertura OSM insufficiente per il confronto | Entrambi gli indicatori OSM hanno peso zero; cache, errori e copertura dichiarati |
| Intervalli e posizioni con significati diversi | Separati intervalli condizionati del modello, sensibilità ai pesi e scenari sul proxy; errori standard dell'esponente sandwich HC1 |
| Arrotondamenti capaci di invertire posizioni | Punteggi pubblicati a sei decimali e ranking calcolato dagli stessi input del frontend; parità verificata su tutte le città |
| Note ISTAT sulle stime perse nell'output | Note su sharing, TPL, piste e politiche urbane visibili nei flag della scheda |
| Tabella lunga e poco esplorabile su mobile | Paginazione, filtri, ricerca senza accenti, ordinamento accessibile e download chiaramente riferito ai pesi standard |
| Geometrie OSM aperte trattate come poligoni | Segmenti delle relazioni rappresentati come linee; cambi di layer conservano zoom e posizione |

## Dati verificati e raccolti

Il gruppo comprende **110 capoluoghi**, definiti dalle tavole ISTAT Ambiente urbano 2024. Si usano dieci archivi annuali degli incidenti 2015–2024, pendolarismo 2011, popolazioni 2015–2026, ambiente urbano 2019–2024 e parco auto ACI al 31 dicembre 2025. La popolazione 2026 è stimata e viene usata soltanto dove serve allineare il denominatore ACI; la popolazione definitiva mostrata nella scheda è quella del 2025.

La verifica nazionale 2024 coincide con il [rapporto ISTAT](https://www.istat.it/comunicato-stampa/incidenti-stradali-in-italia-2024/): **173.364 incidenti, 3.030 morti, 233.853 feriti; 185 ciclisti morti e 16.563 feriti**. Anche i conteggi separati di e-bike e monopattini sono verificati nell'estrattore. La [pagina dei microdati pubblici](https://www.istat.it/microdati/rilevazione-degli-incidenti-stradali-con-lesioni-a-persone-3/) elenca dati fino al 2024; non sono stati introdotti dati comunali 2025 non disponibili in un archivio verificabile.

| Indicatore | Comuni disponibili |
| --- | ---: |
| Incidenti, proxy pendolarismo, piste 2024, sharing, Zone 30, TPL | 110/110 |
| Crescita piste 2019–2024 | 109/110 |
| Auto per abitante dopo la soglia editoriale di affidabilità | 106/110 |
| PM10 / NO2 | 88/110 / 90/110 |
| Snapshot OSM | 8/110 |

Le quattro esclusioni del rapporto auto riguardano Aosta, Bolzano, Trento e Reggio Emilia; la crescita manca per Cesena. Non sono sostituite con valori inventati. Per OSM sono disponibili Torino, Vercelli, Novara, Biella, Verbania, Aosta, Imperia e Milano; le altre città restano mancanti. Anche con snapshot disponibile, singoli indicatori OSM possono mancare, ad esempio per limiti di velocità non mappati. La raccolta è riprendibile e limitata nel tempo; i fallimenti persistiti non alterano il ranking.

I **23 input ufficiali** sono identificati da URL, byte e SHA-256 in [data/source-manifest.json](data/source-manifest.json). I dati intermedi aggregati sono inclusi nel repository; gli archivi raw e le cache OSM sono esclusi da Git. [SOURCES.md](SOURCES.md) specifica periodi, denominatori, normalizzazioni, modello, licenze e limiti.

## Verifiche eseguite

- Pipeline completa `npm run data`: download riutilizzati, hash, estrazione, calcolo e validazione superati.
- `npm run data:provenance -- --check`: tutte le 23 impronte coincidono; verificato anche il rifiuto di un manifest alterato, senza riscriverlo.
- Secondo calcolo: JSON numericamente identico salvo `generatedAt`, CSV identico. SHA-256 del JSON privato di `generatedAt`: `f9e83263026a59de2698a1e4e4311da761dc042dafa37aa59752e7169cd0a35e`.
- **151 test in 13 file** superati: estrazione, statistica, dati mancanti, JSON/CSV, parità dei punteggi, URL, retry, ricerca, paginazione, mappa e tastiera.
- ESLint e TypeScript superati; build GitHub Pages con `VITE_BASE_PATH=/Ciclismosicuro/` superato senza avvisi di sintassi CSS.
- Browser collaborativo T3: render desktop e mobile, ricerca Bologna, cambio pesi/URL, filtro e ordinamento, confronto tra città, tabella degli scenari, apertura/chiusura della mappa con ripristino del focus. Verificati anche caricamento dati, logo e download sotto il percorso di produzione. Nessun overflow orizzontale nelle dimensioni controllate.

Le risposte live di Overpass dipendono da servizi esterni: non si garantisce la disponibilità futura della mappa. Timeout, annullamento, fallback e gestione dell'errore sono coperti dai test; il calcolo ufficiale funziona senza questi servizi.

## Interpretazione del risultato

Il modello dei morti+feriti 2022–2024 usa 24.103 casi nei capoluoghi; quello dei morti 2015–2024 usa 607 casi. Gli esponenti stimati sono rispettivamente 0,566 e 0,520, con errori standard HC1 0,027 e 0,053. Sono associazioni tra comuni, non effetti dell'aumento dei ciclisti.

Restano irrisolti dai dati disponibili: esposizione attuale, km percorsi, sottonotifica, differenze demografiche, confondimento, dipendenza geografica e qualità effettiva delle infrastrutture. I pesi sono scelte editoriali; dati di periodi diversi e copertura incompleta riducono la confrontabilità. La dashboard consente di esplorare queste assunzioni e rende visibili i limiti, ma non certifica la sicurezza individuale di pedalare in una città.
