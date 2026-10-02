/**
 * Download every raw source into data/raw/ (git-ignored). Existing files are reused,
 * so the step is cheap to rerun; pass --force to refresh everything.
 */
import { mkdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { recordSourceManifest } from "./provenance.mjs";
import {
  CRASH_FIRST_YEAR,
  CRASH_LAST_YEAR,
  POPULATION_YEARS,
  RAW_SOURCES,
  USER_AGENT
} from "./config.mjs";

const force = process.argv.includes("--force");

async function exists(file) {
  try {
    return (await stat(file)).size > 0;
  } catch {
    return false;
  }
}

async function download({ file, url }, { optional = false } = {}) {
  if (!force && (await exists(file))) {
    console.log(`cached  ${path.relative(process.cwd(), file)}`);
    return true;
  }
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(180_000) });
  if (!response.ok) {
    if (optional) {
      console.warn(`skip    ${url} (HTTP ${response.status})`);
      return false;
    }
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const isZip = file.endsWith(".zip");
  if (isZip && !(bytes[0] === 0x50 && bytes[1] === 0x4b)) {
    if (optional) {
      console.warn(`skip    ${url} (not a zip archive)`);
      return false;
    }
    throw new Error(`Expected a zip archive from ${url}`);
  }
  await mkdir(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.partial`;
  await writeFile(temporaryFile, bytes);
  await rename(temporaryFile, file);
  console.log(`fetched ${path.relative(process.cwd(), file)} (${(bytes.length / 1e6).toFixed(1)} MB)`);
  return true;
}

for (let year = CRASH_FIRST_YEAR; year <= CRASH_LAST_YEAR; year += 1) {
  await download(RAW_SOURCES.crashMicrodata(year));
}
await download(RAW_SOURCES.municipalities);
for (const year of POPULATION_YEARS) {
  await download(RAW_SOURCES.population(year));
}
await download(RAW_SOURCES.reconstructedPopulation);
await download(RAW_SOURCES.commuting2011);
await download(RAW_SOURCES.urbanEnvironment);
await download(RAW_SOURCES.vehicleFleet);
const manifest = await recordSourceManifest();
console.log(`source-manifest.json: ${manifest.files.length} original inputs fingerprinted`);
console.log("Raw sources ready. OSM statistics are fetched by `npm run data:osm`.");
