/** Resolve a public asset path against the Vite base URL (works under a GitHub Pages subpath). */
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
  return `${base}${path.replace(/^\//, "")}`;
}
