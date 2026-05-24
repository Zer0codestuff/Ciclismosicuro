/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

function initialSortDirection(sortKey: string): "asc" | "desc" {
  return sortKey === "city" || sortKey === "rank" ? "asc" : "desc";
}

function withBase(path: string, baseUrl = import.meta.env.BASE_URL): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const suffix = path.startsWith("/") ? path.slice(1) : path;
  return `${base}${suffix}`;
}

describe("table sort defaults", () => {
  it("sorts rank and city ascending on first click", () => {
    expect(initialSortDirection("rank")).toBe("asc");
    expect(initialSortDirection("city")).toBe("asc");
    expect(initialSortDirection("score")).toBe("desc");
    expect(initialSortDirection("policy")).toBe("desc");
  });
});

describe("base-aware paths", () => {
  it("joins paths with the Vite base URL", () => {
    expect(withBase("/data/ranking.json")).toBe(`${import.meta.env.BASE_URL}data/ranking.json`);
    expect(withBase("assets/logo.png")).toBe(`${import.meta.env.BASE_URL}assets/logo.png`);
  });

  it("normalizes a subpath base without a trailing slash", () => {
    expect(withBase("data/ranking.json", "/Ciclismosicuro")).toBe("/Ciclismosicuro/data/ranking.json");
    expect(withBase("/assets/logo.png", "/Ciclismosicuro")).toBe("/Ciclismosicuro/assets/logo.png");
  });
});
