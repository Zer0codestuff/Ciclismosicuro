/** Record content hashes of original official archives so a rebuild can be audited. */
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { CRASH_FIRST_YEAR, CRASH_LAST_YEAR, POPULATION_YEARS, RAW_SOURCES, ROOT } from "./config.mjs";
import { readJson, writeJson } from "./lib/text.mjs";

const originals = [
  ...Array.from({ length: CRASH_LAST_YEAR - CRASH_FIRST_YEAR + 1 }, (_, i) => RAW_SOURCES.crashMicrodata(CRASH_FIRST_YEAR + i)),
  RAW_SOURCES.municipalities,
  ...POPULATION_YEARS.map(RAW_SOURCES.population),
  RAW_SOURCES.reconstructedPopulation,
  RAW_SOURCES.commuting2011,
  RAW_SOURCES.urbanEnvironment,
  RAW_SOURCES.vehicleFleet
];

/** Hash inputs once; --check verifies the committed snapshot without changing it. */
export async function recordSourceManifest({ check = false, manifestFile = path.join(ROOT, "data/source-manifest.json") } = {}) {
  const files = [];
  for (const source of originals) {
    const metadata = await stat(source.file);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(source.file)) hash.update(chunk);
    files.push({ file: path.relative(ROOT, source.file), url: source.url, bytes: metadata.size, sha256: hash.digest("hex") });
  }
  const manifest = {
    schemaVersion: 1,
    hashAlgorithm: "SHA-256",
    notes: "Fingerprints of the original official inputs. A URL can change: compare hashes when rebuilding. File dates are intentionally not interpreted as publication or retrieval dates. OSM query hashes are stored in per-city raw caches; query version and snapshot/retrieval timestamps are recorded in osm-infrastructure.json and per-city caches.",
    files
  };
  if (check) {
    const recorded = await readJson(manifestFile);
    if (recorded.schemaVersion !== 1 || recorded.hashAlgorithm !== "SHA-256" || !Array.isArray(recorded.files) || recorded.files.length !== files.length) {
      throw new Error("Source manifest schema or file count does not match the current inputs");
    }
    const byFile = new Map(recorded.files.map((entry) => [entry.file, entry]));
    for (const live of files) {
      const expected = byFile.get(live.file);
      for (const field of ["url", "bytes", "sha256"]) {
        if (expected?.[field] !== live[field]) throw new Error(`Source manifest mismatch: ${live.file} (${field})`);
      }
    }
  } else {
    await writeJson(manifestFile, manifest);
  }
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--check")) throw new Error("Usage: node scripts/pipeline/provenance.mjs [--check]");
  const check = args.includes("--check");
  const manifest = await recordSourceManifest({ check });
  console.log(`source-manifest.json: ${manifest.files.length} original inputs ${check ? "verified (unchanged)" : "fingerprinted"}`);
}
