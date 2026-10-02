import { Github } from "lucide-react";
import { useEffect, useState } from "react";
import { withBase } from "../lib/assets";
import type { RankingPayload } from "../types";

export const NAV_SECTIONS = [
  { id: "mappa", label: "Mappa" },
  { id: "classifica", label: "Classifica" },
  { id: "citta", label: "Città" },
  { id: "analisi", label: "Cosa dicono i dati" },
  { id: "metodo", label: "Metodo" }
] as const;

/** Highlight the last section whose top has scrolled past the header. */
function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const offset = 120;
      let current: string | null = null;
      for (const id of ids) {
        const element = document.getElementById(id);
        if (element && element.getBoundingClientRect().top - offset <= 0) current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ids]);
  return active;
}

const SECTION_IDS = NAV_SECTIONS.map((section) => section.id);

export function SiteHeader() {
  const active = useActiveSection(SECTION_IDS);
  return (
    <header className="site-header">
      <a className="brand" href="#top" aria-label="Ciclismo Sicuro, torna all'inizio">
        <img src={withBase("assets/ciclismo-sicuro-logo.png")} alt="" width={44} height={44} />
        <span>
          <strong>Ciclismo Sicuro</strong>
          <small>dati aperti sulla sicurezza in bici</small>
        </span>
      </a>
      <nav className="top-nav" aria-label="Sezioni">
        {NAV_SECTIONS.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className={active === section.id ? "is-active" : undefined}
            aria-current={active === section.id ? "true" : undefined}
          >
            {section.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

export function SiteFooter({ payload }: { payload: RankingPayload }) {
  const generated = new Date(payload.generatedAt).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
  return (
    <footer className="site-footer">
      <div>
        <strong>Ciclismo Sicuro</strong>
        <p>
          Progetto indipendente di analisi dati. Non è una classifica ufficiale né una certificazione di sicurezza.
          Elaborazione del {generated}. I periodi osservati sono indicati per ciascun dato.
        </p>
      </div>
      <div>
        <p>
          Fonti: ISTAT (CC BY 4.0), ACI, © OpenStreetMap contributors (ODbL). Elaborazioni rilasciate con le stesse
          attribuzioni.
        </p>
        <a className="footer-link" href="https://github.com/Zer0codestuff/Ciclismosicuro" target="_blank" rel="noreferrer">
          <Github aria-hidden="true" />
          Codice e pipeline su GitHub
        </a>
      </div>
    </footer>
  );
}
