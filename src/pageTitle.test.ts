import { describe, expect, it } from "vitest";
import { cityDocumentTitle, DEFAULT_DOCUMENT_TITLE } from "./pageTitle";

describe("pageTitle", () => {
  it("formats city tab titles", () => {
    expect(cityDocumentTitle("Beta")).toBe("Beta | Ciclismo Sicuro");
  });

  it("keeps the default title aligned with index.html", () => {
    expect(DEFAULT_DOCUMENT_TITLE).toBe("Ciclismo Sicuro | Città italiane per ciclisti");
  });
});
