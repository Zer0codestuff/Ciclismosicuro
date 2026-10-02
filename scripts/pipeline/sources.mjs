/** Source registry shown in the dashboard and referenced by metric definitions. */
export const SOURCES = [
  {
    id: "istat-incidenti",
    title: "Rilevazione degli incidenti stradali con lesioni a persone – microdati mIcro.STAT 2015–2024",
    publisher: "ISTAT",
    url: "https://www.istat.it/microdati/rilevazione-degli-incidenti-stradali-con-lesioni-a-persone-3/",
    license: "CC BY 4.0",
    period: "2015–2024",
    notes:
      "Un record per ogni incidente con lesioni rilevato dalle autorità: comune, veicoli, esito di conducenti e passeggeri. Il 2024 è l'ultimo anno disponibile nei microdati pubblici alla verifica del 2 ottobre 2026. Totali nazionali verificati sul comunicato: 185 ciclisti morti e 16.563 feriti, incluse le e-bike. E-bike e monopattini sono distinti da maggio 2020."
  },
  {
    id: "istat-censimento-2011",
    title: "Censimento della popolazione 2011 – matrice del pendolarismo",
    publisher: "ISTAT",
    url: "https://www.istat.it/non-categorizzato/matrici-del-pendolarismo/",
    license: "CC BY 4.0",
    period: "2011",
    notes:
      "Persone residenti in famiglia che nel 2011 si spostavano ogni giorno per lavoro o studio, per origine, destinazione e mezzo. Conteggi ponderati dei record L (campionamento nei comuni di almeno 20.000 abitanti). È un proxy storico: non misura i ciclisti, i viaggi o i chilometri percorsi oggi."
  },
  {
    id: "istat-popolazione",
    title: "Popolazione residente al 1° gennaio per comune (ricostruzione e POSAS)",
    publisher: "ISTAT",
    url: "https://demo.istat.it/",
    license: "CC BY 4.0",
    period: "2015–2026",
    notes: "Popolazione ricostruita 2015–2018 e POSAS 2019–2026. I tassi usano il dato dell'anno pertinente; il dato 2026 è una stima, usata per allineare il parco ACI del 31/12/2025. La popolazione più recente definitiva mostrata nelle città è al 1/1/2025."
  },
  {
    id: "istat-ambiente-urbano",
    title: "Ambiente urbano – Dati ambientali nelle città, anno 2024 (tavole Mobilità urbana e Aria)",
    publisher: "ISTAT",
    url: "https://www.istat.it/comunicato-stampa/ambiente-urbano-anno-2024/",
    license: "CC BY 4.0",
    period: "2019–2024",
    notes:
      "Km di piste ciclabili, bike sharing, Zone 30, ZTL, aree pedonali, domanda e offerta di trasporto pubblico e qualità dell'aria, dichiarati dai Comuni capoluogo. Alcuni valori sono stime ISTAT (indicate nella scheda città)."
  },
  {
    id: "aci-autoritratto",
    title: "Autoritratto 2025 – Parco veicolare per comune",
    publisher: "ACI – Automobile Club d'Italia",
    url: "https://aci.gov.it/attivita-e-progetti/studi-e-ricerche/autoritratto/",
    license: "CC BY 4.0",
    period: "31/12/2025",
    notes: "Autovetture iscritte al PRA al 31/12/2025, rapportate alla popolazione ISTAT stimata al 1/1/2026. Le intestazioni di flotte possono gonfiare il dato: sopra 95 auto per 100 abitanti il rapporto è escluso dall'indice. È uno stock di veicoli, non una misura di traffico."
  },
  {
    id: "osm",
    title: "OpenStreetMap – statistiche di rete via Overpass API",
    publisher: "© OpenStreetMap contributors",
    url: "https://www.openstreetmap.org/copyright",
    license: "ODbL 1.0",
    period: "ottobre 2026",
    notes:
      "Statistiche opzionali sulle strade selezionate dal confine comunale ref:ISTAT. Lunghezze delle intere geometrie, senza ritaglio al confine: i tag laterali misurano l'asse stradale una sola volta. cycleway=separate è escluso per evitare duplicazioni; i percorsi misti designati non garantiscono protezione fisica. Snapshot attuali e copertura parziale sono documentati; peso predefinito zero nell'indice."
  }
];
