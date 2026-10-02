# Fonti e metodologia

Revisione: 2 ottobre 2026. `generatedAt` indica quando è stato eseguito il calcolo, non l'anno dei fenomeni osservati. Ogni indicatore espone il proprio periodo e le fonti.

## Fonti ufficiali

| Fonte | Dati usati | Periodo |
| --- | --- | --- |
| [ISTAT microdati incidenti](https://www.istat.it/microdati/rilevazione-degli-incidenti-stradali-con-lesioni-a-persone-3/) | Incidenti con lesioni, comune, veicoli, conducenti e passeggeri | 2015–2024 |
| [ISTAT matrici di pendolarismo](https://www.istat.it/non-categorizzato/matrici-del-pendolarismo/) | Residenti che si spostano per lavoro/studio e mezzo usato | Censimento 2011 |
| [ISTAT demografia](https://demo.istat.it/) | Popolazione comunale al 1° gennaio, POSAS e ricostruzione storica | 2015–2026; 2026 stimato |
| [ISTAT Ambiente urbano 2024](https://www.istat.it/comunicato-stampa/ambiente-urbano-anno-2024/) | Piste, sharing, Zone 30, TPL e qualità dell'aria | 2019–2024 |
| [ACI Autoritratto](https://aci.gov.it/attivita-e-progetti/studi-e-ricerche/autoritratto/) | Autovetture iscritte al PRA per comune | 31 dicembre 2025 |
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | Statistiche Overpass e mappa stradale su richiesta | Snapshot ottobre 2026; solo contesto |

Gli URL dei singoli archivi si trovano in `scripts/pipeline/config.mjs`; la descrizione riutilizzata dalla UI è in `sources.mjs`. `data/source-manifest.json` conserva dimensioni e SHA-256 dei 23 archivi ufficiali effettivamente usati. Il gruppo di 110 comuni è quello delle tavole Ambiente urbano 2024, non una ridefinizione delle province correnti.

La pagina ISTAT dei microdati, aggiornata l'11 marzo 2026, elenca anni fino al 2024. Un comunicato più recente sugli incidenti non rende automaticamente disponibile il corrispondente file comunale ad uso pubblico. Non sono incorporati conteggi 2025 non verificabili con questa pipeline.

## Controlli sull'estrazione degli incidenti

Dal 2014 i file pubblici rappresentano una collezione completa, mentre gli anni precedenti potevano richiedere pesi campionari. La serie utilizzata inizia nel 2015.

- Bici: tipo veicolo 14; e-bike: 23, introdotto da maggio 2020. Monopattini 22 separati dalla bici.
- Conducente: esito 2 = ferito, 3/4 = morto; passeggero: 1 = morto, 2 = ferito. I contatori aggiuntivi di passeggeri anonimi sono conteggiati senza attribuire età.
- I codici e le bande d'età vengono letti dalle classificazioni incluse nei file. Le quote per età escludono l'età sconosciuta.
- La codifica dell'ora cambia tra file annuali; viene normalizzata per anno, preservando i valori mancanti. Le quote orarie si riferiscono ai soli casi con ora nota.
- In un incidente con più veicoli non si sceglie arbitrariamente il primo avversario: il grafico ha una categoria separata. La quota di incidenti con auto conta qualsiasi auto presente.
- I tassi sono attribuiti al luogo dell'incidente: possono includere non residenti e strade extraurbane. Il file descrive al massimo tre veicoli, un limite strutturale che non spiega automaticamente qualsiasi scarto dai comunicati.

Il controllo 2024 coincide con i [totali ufficiali ISTAT](https://www.istat.it/comunicato-stampa/incidenti-stradali-in-italia-2024/): 173.364 incidenti, 3.030 morti, 233.853 feriti, 185 ciclisti morti. Il test conserva anche riferimenti per feriti ciclisti, e-bike e monopattini.

## Denominatori e dati mancanti

Per ogni anno gli anni-persona sono la media tra popolazione al 1° gennaio e al 1° gennaio successivo. Il calcolo richiede entrambi i valori: niente estrapolazione silenziosa. Gli anni 2015–2018 provengono dalla ricostruzione demografica ISTAT; gli anni successivi da POSAS.

I km di piste 2024 sono rapportati alla popolazione media 2024. La crescita confronta esattamente 2019 con 2024, senza sostituire il primo anno con un anno diverso per un comune. Il parco ACI al 31/12/2025 usa la popolazione stimata al 1/1/2026; la scheda città mostra il dato finale al 1/1/2025. I valori superiori a 95 auto/100 residenti sono esclusi con una soglia editoriale per possibili distorsioni di immatricolazione, non perché ne sia dimostrata la causa per ogni comune.

Assenza di un fenomeno, valore mancante e dato stimato sono distinti dalle note delle tavole. In JSON valori mancanti = `null`, anche dopo normalizzazione; in CSV = celle vuote. Un punteggio zero significa dato presente in fondo alla scala. Le medie rinormalizzano i pesi disponibili e pubblicano copertura per pilastro/default; ciò riduce la confrontabilità delle città incomplete. Con tutti i pilastri selezionati mancanti non si assegna una posizione.

## Modello osservati/attesi

Si stimano separatamente morti+feriti 2022–2024 e morti 2015–2024:

```text
E[casi] = anni-persona × exp(intercetta) × quotaPendolariBici2011^esponente
```

La regressione di Poisson usa offset degli anni-persona ed errori standard sandwich HC1 a livello comunale. La sovradispersione resta una diagnostica. Gli intervalli dell'esponente usano un'approssimazione normale e assumono indipendenza tra comuni; non comprendono confondimento o dipendenza geografica.

Il rapporto osservati/attesi è ricondotto verso 1 con prior Gamma empirical-Bayes, stimato dai residui. Gli intervalli credibili al 90% sono condizionati a esposizione, modello e prior stimati: non includono incertezza dei parametri né sottorilevazione. Il proxy 2011 copre solo pendolari residenti, mentre i casi riguardano tutti i ciclisti nel territorio comunale. Il rapporto resta un confronto descrittivo, non una probabilità per persona, viaggio o chilometro.

L'associazione trasversale tra quota bici e casi non misura l'effetto di aumentare i ciclisti. Vedi anche [Aldred et al., Contextualising Safety in Numbers, Injury Prevention](https://injuryprevention.bmj.com/content/25/3/236). La relazione tra incidentalità generale e ciclistica comprende una componente meccanica: i ciclisti sono inclusi nel totale.

## Punteggi e sensibilità

- Rapporti: `100/(1+r²)`, con 50 a r=1.
- Altri indicatori: scala 0–100 tra percentili 5 e 95, inversione per direzione e trasformazioni log/log1p dichiarate nelle definizioni.
- Pilastri e composito: medie pesate, con pesi editoriali espliciti in `README.md` e `methodology.mjs`.
- Precisione pubblicata: indicatori normalizzati e pilastri a sei decimali; il ranking usa gli stessi valori del frontend. Spareggio per nome, locale italiana.
- `rankRange`: quantili 5–95 delle posizioni in 2.000 estrazioni Dirichlet sui quattro pilastri standard, concentrazione 20 e seed fisso. Non comprende errori dei dati né i pilastri contestuali.
- `exposureScenarios`/`exposureRankRange`: dimezzamento/raddoppio del proxy di un solo comune, casi e modello fissi, altri punteggi invariati. Non sono intervalli probabilistici. Una variazione uniforme del proxy con rifit sarebbe assorbita dall'intercetta.

## OpenStreetMap

I due indicatori OSM hanno peso zero, anche dopo nuove raccolte. La mappa urbana è un aiuto esplorativo indipendente dall'indice. Lo snapshot incluso comprende Torino, Vercelli, Novara, Biella, Verbania, Aosta, Imperia e Milano (8/110); gli altri comuni restano `null`. Le query Overpass non riuscite vengono registrate, senza sostituire l'assenza con zero.

Le query selezionano un solo confine amministrativo `admin_level=8` con `ref:ISTAT`. I risultati conservano timestamp, versione/hash della query, copertura ed errori. Timeout e raccolta riprendibile consentono di usare un dataset ufficiale anche con Overpass indisponibile.

Lunghezze: geometrie intere selezionate nell'area, non ritaglio esatto al confine. `cycleway=separate` non viene contato come traccia aggiuntiva; percorsi misti `bicycle=designated` non sono certificati protetti. I tag laterali misurano il centrolinea stradale, non due corsie distinte. Gli insiemi di strade lente/limiti conosciuti sono unioni, evitando doppi conteggi. Il rapporto di lunghezze ciclabili/stradali non è la percentuale di strade protette.

Attribuzione: ISTAT CC BY 4.0; ACI [CC BY 4.0](https://aci.gov.it/attivita-e-progetti/studi-e-ricerche/open-data/); © OpenStreetMap contributors, ODbL 1.0. I termini restano applicabili alle rispettive componenti; non si dichiara una licenza CC BY unica per tutti i derivati.
