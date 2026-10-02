/**
 * OSM network summaries via Overpass. These are mapped whole-way centreline lengths,
 * not a geometric clip, a verified protected-cycleway inventory or historical 2024 data.
 * Partial runs are resumable; failures remain null and never become zero.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "./lib/text.mjs";
import { INTERMEDIATE_DIR, OVERPASS_ENDPOINTS, RAW_DIR, USER_AGENT } from "./config.mjs";

const CACHE_DIR = path.join(RAW_DIR, "osm");
export const QUERY_VERSION = 2;
const SIDE_KEY = '~"^cycleway(:left|:right|:both)?$"';
const URBAN_ROADS = "^(trunk|primary|secondary|tertiary|unclassified|residential|living_street|trunk_link|primary_link|secondary_link|tertiary_link)$";
const ARTERIALS = "^(trunk|primary|secondary|trunk_link|primary_link|secondary_link)$";
const STAT_KEYS = ["cycleway", "designated", "track", "lane", "busway", "cycling_network", "separated_network", "roads", "maxspeed_tagged", "maxspeed_le30", "living_street", "known_speed", "slow_streets", "arterial", "bike_parking", "bike_rental"];

export function overpassQuery(istatCode) {
  if (!/^\d{6}$/.test(istatCode)) throw new Error("Expected a six-digit ISTAT code");
  return `[out:json][timeout:50];
area["ref:ISTAT"="${istatCode}"]["boundary"="administrative"]["admin_level"="8"]->.a;
.a out ids;
way(area.a)[highway=cycleway]->.cw;
way(area.a)[highway~"^(path|footway|pedestrian)$"][bicycle=designated]->.des;
way(area.a)[highway~"${URBAN_ROADS}"]->.roads;
way.roads[${SIDE_KEY}~"^(track|opposite_track)$"]->.trk;
way.roads[${SIDE_KEY}~"^(lane|opposite_lane)$"]->.lane;
way.roads[${SIDE_KEY}~"^(share_busway|opposite_share_busway)$"]->.bus;
(.cw;.des;.trk;.lane;.bus;)->.cycling;
(.cw;.des;.trk;)->.separated;
way.roads[maxspeed]->.tagged;
way.roads[maxspeed~"^[0-9]+([.][0-9]+)?$"]->.numeric;
way.numeric(if:number(t["maxspeed"])<=30)->.r30;
way.roads[highway=living_street]->.ls;
(.numeric;.ls;)->.known;
(.r30;.ls;)->.slow;
way.roads[highway~"${ARTERIALS}"]->.arter;
nwr(area.a)[amenity=bicycle_parking]->.park;
nwr(area.a)[amenity=bicycle_rental]->.rent;
${[["cw", "cycleway"], ["des", "designated"], ["trk", "track"], ["lane", "lane"], ["bus", "busway"], ["cycling", "cycling_network"], ["separated", "separated_network"], ["roads", "roads"], ["tagged", "maxspeed_tagged"], ["r30", "maxspeed_le30"], ["ls", "living_street"], ["known", "known_speed"], ["slow", "slow_streets"], ["arter", "arterial"]].map(([set, key]) => `(.${set};);make stat k="${key}",len=sum(length()),n=count(ways);out;`).join("\n")}
(.park;);make stat k="bike_parking",n=count(nwr);out;
(.rent;);make stat k="bike_rental",n=count(nwr);out;
`;
}

export function parseOverpassStats(response) {
  if (response.remark) throw new Error(`Overpass returned an incomplete response: ${response.remark}`);
  if ((response.elements ?? []).filter((element) => element.type === "area").length !== 1) {
    throw new Error("Expected exactly one mapped municipal boundary");
  }
  const stats = Object.fromEntries((response.elements ?? []).filter((element) => element.type === "stat").map((element) => [element.tags.k, element.tags]));
  const number = (key, field) => {
    const value = stats[key]?.[field];
    if (value === undefined || value === "" || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error(`Invalid Overpass ${key}.${field}`);
    return Number(value);
  };
  for (const key of STAT_KEYS) {
    number(key, "n");
    if (!key.startsWith("bike_")) number(key, "len");
  }
  const km = (key) => number(key, "len") / 1000;
  if (km("roads") <= 0) throw new Error("No mapped road network for municipal boundary");
  if (km("slow_streets") > km("known_speed") + 1e-6 || km("known_speed") > km("roads") + 1e-6) {
    throw new Error("Inconsistent road-speed unions");
  }
  return {
    cyclewayKm: km("cycleway"), designatedPathKm: km("designated"), trackKm: km("track"), laneKm: km("lane"), buswayKm: km("busway"),
    cyclingNetworkKm: km("cycling_network"), separatedNetworkKm: km("separated_network"), roadKm: km("roads"),
    maxspeedTaggedKm: km("maxspeed_tagged"), maxspeed30Km: km("maxspeed_le30"), livingStreetKm: km("living_street"),
    knownSpeedRoadKm: km("known_speed"), slowStreetKm: km("slow_streets"), arterialKm: km("arterial"),
    bikeParking: number("bike_parking", "n"), bikeRental: number("bike_rental", "n"),
    osmTimestamp: response.osm3s?.timestamp_osm_base ?? null,
    retrievedAt: response._pipeline?.retrievedAt ?? null,
    queryVersion: QUERY_VERSION
  };
}

export async function fetchStats(istatCode, { endpoints = OVERPASS_ENDPOINTS, timeoutMs = 55_000, deadline = Infinity, signal } = {}) {
  const query = overpassQuery(istatCode);
  const errors = [];
  for (const endpoint of endpoints) {
    const remaining = deadline - Date.now();
    if (remaining <= 0 || signal?.aborted) break;
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "user-agent": USER_AGENT, "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.any([AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, remaining))), ...(signal ? [signal] : [])])
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      parseOverpassStats(json);
      json._pipeline = { queryVersion: QUERY_VERSION, queryHash: createHash("sha256").update(query).digest("hex"), endpoint, retrievedAt: new Date().toISOString() };
      return json;
    } catch (error) {
      errors.push(`${new URL(endpoint).hostname}: ${error.message}`);
    }
  }
  throw new Error(`Overpass failed for ${istatCode}: ${errors.join("; ") || "run time budget reached"}`);
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  const maxSeconds = Number(flag("max-seconds") ?? 1200);
  const limit = Number(flag("limit") ?? Infinity);
  if (!(maxSeconds > 0) || !(limit > 0)) throw new Error("--max-seconds and --limit must be positive");
  const selected = flag("cities")?.split(",");
  const cities = await readJson(path.join(INTERMEDIATE_DIR, "cities.json"));
  if (selected?.some((id) => !cities.some((city) => city.id === id))) throw new Error("Unknown id in --cities");
  await mkdir(CACHE_DIR, { recursive: true });
  const deadline = Date.now() + maxSeconds * 1000;
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", interrupt);
  const result = {};
  const failures = [];
  let requests = 0;
  for (const city of cities) {
    const cacheFile = path.join(CACHE_DIR, `${city.istatCode}.v${QUERY_VERSION}.json`);
    const errorFile = `${cacheFile}.error.json`;
    let json = null;
    let failure = null;
    try { failure = JSON.parse(await readFile(errorFile, "utf8")); } catch { /* Never requested or no previous error. */ }
    if (!args.includes("--refresh")) {
      try {
        const cached = JSON.parse(await readFile(cacheFile, "utf8"));
        const queryHash = createHash("sha256").update(overpassQuery(city.istatCode)).digest("hex");
        if (cached._pipeline?.queryHash !== queryHash) throw new Error("Outdated cache query");
        parseOverpassStats(cached);
        json = cached;
      } catch { /* Missing or outdated caches are fetched below. */ }
    }
    const eligible = !selected || selected.includes(city.id);
    if (!json && eligible && !args.includes("--cached-only") && !controller.signal.aborted && requests < limit && Date.now() < deadline) {
      requests += 1;
      try {
        json = await fetchStats(city.istatCode, { deadline, signal: controller.signal });
        await writeFile(cacheFile, JSON.stringify(json));
        console.log(`osm ${city.name}`);
      } catch (error) {
        failure = { city: city.id, error: error.message, attemptedAt: new Date().toISOString(), queryVersion: QUERY_VERSION };
        await writeFile(errorFile, JSON.stringify(failure));
        console.warn(error.message);
      }
    }
    if (!json && failure?.queryVersion === QUERY_VERSION) failures.push(failure);
    result[city.id] = json ? parseOverpassStats(json) : null;
  }
  const available = Object.values(result).filter(Boolean).length;
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
  await writeJson(path.join(INTERMEDIATE_DIR, "osm-infrastructure.json"), {
    source: "© OpenStreetMap contributors (ODbL), statistiche via Overpass API",
    queryVersion: QUERY_VERSION, collectedAt: new Date().toISOString(), coverage: { available, total: cities.length },
    limitations: ["Whole ways selected by an area query; lengths are not clipped at the municipal boundary.", "Side tags measure road centreline once, not the lengths of individual lanes on both sides.", "cycleway=separate is excluded from tracks to avoid counting separately mapped geometry twice.", "Designated mixed paths are not verified physically protected facilities.", "Current map snapshots are contextual and are not aligned to the 2024 crash period."],
    failures, cities: result
  });
  console.log(`osm-infrastructure.json: ${available}/${cities.length} città (rerun resumes cached results)`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
