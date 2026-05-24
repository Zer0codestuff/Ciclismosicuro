/** Default `<title>` from `index.html` — restored while loading or on error. */
export const DEFAULT_DOCUMENT_TITLE = "Ciclismo Sicuro | Città italiane per ciclisti";

/** Browser tab title when a city detail is active. */
export function cityDocumentTitle(cityName: string): string {
  return `${cityName} | Ciclismo Sicuro`;
}
