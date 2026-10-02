import { readFile } from "node:fs/promises";
import { strFromU8, Unzip, UnzipInflate, unzipSync } from "fflate";

const latin1 = new TextDecoder("latin1");
const utf8 = new TextDecoder("utf-8");

/** Return the entries of a zip file whose path matches `pattern`. */
export async function readZipEntries(zipPath, pattern) {
  const buffer = new Uint8Array(await readFile(zipPath));
  return unzipSync(buffer, { filter: (file) => pattern.test(file.name) });
}

export function decodeLatin1(bytes) {
  return latin1.decode(bytes);
}

export function decodeUtf8(bytes) {
  return utf8.decode(bytes).replace(/^\uFEFF/, "");
}

/**
 * Stream the lines of one zip entry without materializing the whole text.
 * Needed for the 300 MB census commuting matrix.
 */
export async function forEachZipLine(zipPath, pattern, onLine, { encoding = "latin1" } = {}) {
  const buffer = new Uint8Array(await readFile(zipPath));
  let matched = 0;
  await new Promise((resolve, reject) => {
    let pending = 0;
    let archiveEnded = false;
    const unzip = new Unzip((file) => {
      if (!pattern.test(file.name)) return;
      matched += 1;
      pending += 1;
      const decoder = new TextDecoder(encoding);
      let carry = "";
      file.ondata = (error, chunk, final) => {
        if (error) {
          reject(error);
          return;
        }
        try {
          const text = carry + decoder.decode(chunk, { stream: !final });
          const lines = text.split(/\r?\n/);
          carry = final ? "" : lines.pop();
          for (const line of lines) if (line.length) onLine(line);
          if (final) {
            pending -= 1;
            if (archiveEnded && pending === 0) resolve();
          }
        } catch (callbackError) {
          reject(callbackError);
        }
      };
      file.start();
    });
    unzip.register(UnzipInflate);
    unzip.push(buffer, true);
    archiveEnded = true;
    if (pending === 0) resolve();
  });
  if (matched === 0) throw new Error(`No entry matching ${pattern} in ${zipPath}`);
}

function columnIndex(reference) {
  const letters = reference.replace(/\d+/g, "");
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function unescapeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&");
}

function textContent(xml) {
  return unescapeXml(
    [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((match) => match[1]).join("")
  );
}

/**
 * Minimal xlsx reader: returns `{ [sheetName]: (string | number | null)[][] }`.
 * Supports shared strings, inline strings and numeric cells (enough for ISTAT/ACI tables).
 */
export function readXlsx(bytes, { sheets: wantedSheets } = {}) {
  const files = unzipSync(bytes);
  const read = (name) => (files[name] ? strFromU8(files[name]) : null);
  const sharedXml = read("xl/sharedStrings.xml");
  const shared = sharedXml
    ? [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => textContent(match[1]))
    : [];
  const workbook = read("xl/workbook.xml");
  const relations = read("xl/_rels/workbook.xml.rels");
  const targets = new Map(
    [...relations.matchAll(/<Relationship\b[^>]*>/g)].map((match) => {
      const id = /Id="([^"]+)"/.exec(match[0])[1];
      const target = /Target="([^"]+)"/.exec(match[0])[1];
      return [id, target.replace(/^\/?xl\//, "")];
    })
  );
  const result = {};
  for (const match of workbook.matchAll(/<sheet\b[^>]*>/g)) {
    const name = unescapeXml(/name="([^"]+)"/.exec(match[0])[1]);
    if (wantedSheets && !wantedSheets.includes(name)) continue;
    const relationId = /r:id="([^"]+)"/.exec(match[0])[1];
    const sheetXml = read(`xl/${targets.get(relationId)}`);
    const rows = [];
    for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const rowNumber = Number(/r="(\d+)"/.exec(rowMatch[0])?.[1] ?? rows.length + 1);
      const cells = [];
      for (const cellMatch of (rowMatch[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attributes = cellMatch[1];
        const body = cellMatch[2] ?? "";
        const reference = /r="([A-Z]+\d+)"/.exec(attributes)?.[1];
        const type = /t="([^"]+)"/.exec(attributes)?.[1];
        const rawValue = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
        let value = null;
        if (type === "s" && rawValue !== undefined) value = shared[Number(rawValue)];
        else if (type === "inlineStr") value = textContent(body);
        else if (type === "str" && rawValue !== undefined) value = unescapeXml(rawValue);
        else if (rawValue !== undefined) {
          const numeric = Number(rawValue);
          value = Number.isFinite(numeric) ? numeric : unescapeXml(rawValue);
        }
        const index = reference ? columnIndex(reference) : cells.length;
        cells[index] = value;
      }
      rows[rowNumber - 1] = Array.from(cells, (value) => (value === undefined ? null : value));
    }
    result[name] = Array.from(rows, (row) => row ?? []);
  }
  return result;
}
