/// <reference types="vite/client" />
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CityMapPanel } from "./CityMapPanel";
import { fetchCityMapData, type CityMapData } from "./cityMapData";

vi.mock("leaflet", () => {
  const layerGroup = () => ({
    addTo: vi.fn(),
    remove: vi.fn()
  });
  const path = () => ({
    bindPopup: vi.fn().mockReturnThis(),
    addTo: vi.fn()
  });
  return {
    default: {
      map: vi.fn(() => ({
        remove: vi.fn(),
        fitBounds: vi.fn(),
        hasLayer: vi.fn(() => false),
        addLayer: vi.fn(),
        removeLayer: vi.fn()
      })),
      tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
      latLngBounds: vi.fn(),
      layerGroup,
      circleMarker: path,
      polygon: path,
      polyline: path
    }
  };
});

vi.mock("./cityMapData", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./cityMapData")>();
  return {
    ...actual,
    fetchCityMapData: vi.fn()
  };
});

function emptyMapData(cityName: string): CityMapData {
  const layers: CityMapData["layers"] = {
    boundary: {
      id: "boundary",
      label: "Confine",
      count: 1,
      features: [],
      available: true
    },
    cycleLanes: {
      id: "cycleLanes",
      label: "Piste ciclabili",
      count: 0,
      features: [],
      available: false
    },
    bikeRoutes: {
      id: "bikeRoutes",
      label: "Itinerari ciclabili",
      count: 0,
      features: [],
      available: false
    },
    ztl: { id: "ztl", label: "ZTL", count: 0, features: [], available: false },
    pedestrian: {
      id: "pedestrian",
      label: "Aree pedonali",
      count: 0,
      features: [],
      available: false
    },
    bikeParking: {
      id: "bikeParking",
      label: "Parcheggi bici",
      count: 0,
      features: [],
      available: false
    },
    bikeSharing: {
      id: "bikeSharing",
      label: "Bike sharing",
      count: 0,
      features: [],
      available: false
    },
    drinkingWater: {
      id: "drinkingWater",
      label: "Fontanelle",
      count: 0,
      features: [],
      available: false
    }
  };

  return {
    cityName,
    boundary: [],
    bounds: { south: 44.4, west: 11.3, north: 44.5, east: 11.4 },
    layers,
    fetchedAt: Date.now()
  };
}

describe("CityMapPanel accessibility", () => {
  beforeEach(() => {
    vi.mocked(fetchCityMapData).mockResolvedValue(emptyMapData("Beta"));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("exposes dialog semantics and focuses the close control on open", async () => {
    render(<CityMapPanel cityName="Beta" onClose={vi.fn()} />);

    const dialog = await screen.findByRole("dialog", { name: /Infrastruttura ciclabile · Beta/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "city-map-title");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Chiudi mappa di Beta" })).toHaveFocus();
    });
  });

  it("closes on Escape and returns focus to the trigger ref", async () => {
    const onClose = vi.fn();
    const returnFocusRef = createRef<HTMLButtonElement>();

    render(
      <>
        <button ref={returnFocusRef} type="button">
          Apri mappa
        </button>
        <CityMapPanel cityName="Beta" onClose={onClose} returnFocusRef={returnFocusRef} />
      </>
    );

    await screen.findByRole("dialog");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Chiudi mappa di Beta" })).toHaveFocus();
    });

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(returnFocusRef.current).toHaveFocus();
    });
  });

  it("cycles Tab from last to first focusable control inside the dialog", async () => {
    render(<CityMapPanel cityName="Beta" onClose={vi.fn()} />);

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Chiudi mappa di Beta" })).toHaveFocus();
    });

    const focusable = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const last = focusable[focusable.length - 1];
    last.focus();

    fireEvent.keyDown(document, { key: "Tab" });

    await waitFor(() => {
      expect(focusable[0]).toHaveFocus();
    });
  });

  it("renders as a body portal with scroll lock and inert app shell", async () => {
    const { container } = render(
      <div className="app-shell">
        <header className="site-header">Header</header>
        <main id="main-content">Contenuto</main>
        <CityMapPanel cityName="Beta" onClose={vi.fn()} />
      </div>
    );

    await screen.findByRole("dialog");

    expect(document.body.classList.contains("city-map-modal-open")).toBe(true);
    expect(document.querySelector(".city-map-modal-root")).toBeTruthy();
    expect(container.querySelector(".city-map-modal-root")).toBeNull();

    const header = document.querySelector(".site-header");
    const mainContent = document.getElementById("main-content");
    expect(header).toHaveAttribute("inert");
    expect(mainContent).toHaveAttribute("inert");
  });

  it("does not move Tab focus to ranking controls behind the overlay", async () => {
    render(
      <div className="app-shell">
        <main id="main-content">
          <button type="button">Ranking Alpha</button>
        </main>
        <CityMapPanel cityName="Beta" onClose={vi.fn()} />
      </div>
    );

    const dialog = await screen.findByRole("dialog");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Chiudi mappa di Beta" })).toHaveFocus();
    });

    const focusable = dialog.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const last = focusable[focusable.length - 1];
    last.focus();

    fireEvent.keyDown(document, { key: "Tab" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Ranking Alpha" })).not.toHaveFocus();
      expect(focusable[0]).toHaveFocus();
    });
  });

  it("cleans up scroll lock and inert when closed", async () => {
    function Host() {
      const [open, setOpen] = useState(true);
      return (
        <div className="app-shell">
          <main id="main-content">Contenuto</main>
          {open ? <CityMapPanel cityName="Beta" onClose={() => setOpen(false)} /> : null}
        </div>
      );
    }

    render(<Host />);

    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Chiudi mappa di Beta" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    expect(document.body.classList.contains("city-map-modal-open")).toBe(false);
    expect(document.getElementById("main-content")).not.toHaveAttribute("inert");
  });

  it("closes when clicking the backdrop and returns focus to the trigger ref", async () => {
    const onClose = vi.fn();
    const returnFocusRef = createRef<HTMLButtonElement>();

    render(
      <>
        <button ref={returnFocusRef} type="button">
          Apri mappa
        </button>
        <CityMapPanel cityName="Beta" onClose={onClose} returnFocusRef={returnFocusRef} />
      </>
    );

    await screen.findByRole("dialog");

    const backdrop = document.querySelector(".city-map-backdrop");
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop!);

    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(returnFocusRef.current).toHaveFocus();
    });
  });

  it("does not close when clicking inside the dialog panel", async () => {
    const onClose = vi.fn();
    render(<CityMapPanel cityName="Beta" onClose={onClose} />);

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(dialog);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose from the Chiudi button and returns focus", async () => {
    const onClose = vi.fn();
    const returnFocusRef = createRef<HTMLButtonElement>();

    render(
      <>
        <button ref={returnFocusRef} type="button">
          Apri mappa
        </button>
        <CityMapPanel cityName="Beta" onClose={onClose} returnFocusRef={returnFocusRef} />
      </>
    );

    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Chiudi mappa di Beta" }));

    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(returnFocusRef.current).toHaveFocus();
    });
  });
});
