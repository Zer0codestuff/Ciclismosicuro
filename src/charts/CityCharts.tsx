import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatNumber, formatPercent } from "../lib/format";
import type { CrashProfile, CrashYear, Findings } from "../types";

const AXIS = { stroke: "#c9d4ce", tick: { fill: "#5f6f69", fontSize: 12 } };
const GRID = <CartesianGrid stroke="#e6ece8" vertical={false} />;
const TOOLTIP_STYLE = {
  contentStyle: { borderRadius: 10, border: "1px solid #d7e1dc", boxShadow: "0 8px 24px rgba(26,54,48,.12)" },
  labelStyle: { color: "#063c38", fontWeight: 700 }
};

/** Cyclist casualties, e-bikes separately coded from May 2020. */
export function CrashSeriesChart({ series }: { series: CrashYear[] }) {
  const data = series.map((entry) => ({
    year: String(entry.year),
    bici: entry.killed + entry.injured - entry.ebike,
    ebike: entry.ebike
  }));
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="22%">
        {GRID}
        <XAxis dataKey="year" {...AXIS} tickLine={false} />
        <YAxis {...AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          {...TOOLTIP_STYLE}
          cursor={{ fill: "rgba(13,148,136,.08)" }}
          formatter={(value: number, name: string) => [formatNumber(value), name === "ebike" ? "su e-bike (codifica disponibile)" : "altre bici / e-bike non distinte"]}
        />
        <Legend
          verticalAlign="top"
          align="right"
          height={28}
          iconType="circle"
          formatter={(value: string) => <span className="chart-legend-text">{value === "ebike" ? "E-bike distinte" : "Altre bici"}</span>}
        />
        <Bar dataKey="bici" stackId="a" fill="#0d9488" radius={[0, 0, 0, 0]} stroke="#ffffff" strokeWidth={1} />
        <Bar dataKey="ebike" stackId="a" fill="#4a3aa7" radius={[4, 4, 0, 0]} stroke="#ffffff" strokeWidth={1} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CycleLaneChart({ series }: { series: { year: number; km: number | null }[] }) {
  const data = series.map((entry) => ({ year: String(entry.year), km: entry.km }));
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap="28%">
        {GRID}
        <XAxis dataKey="year" {...AXIS} tickLine={false} />
        <YAxis {...AXIS} tickLine={false} axisLine={false} />
        <Tooltip
          {...TOOLTIP_STYLE}
          cursor={{ fill: "rgba(42,120,214,.08)" }}
          formatter={(value: number) => [`${formatNumber(value, 1)} km`, "Piste ciclabili"]}
        />
        <Bar dataKey="km" fill="#2a78d6" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const PROFILE_ROWS: { key: keyof CrashProfile; label: string; national: keyof Findings["profile"] }[] = [
  { key: "carShare", label: "Con un'auto coinvolta", national: "carShare" },
  { key: "intersectionShare", label: "A un incrocio o rotatoria", national: "intersectionShare" },
  { key: "aloneShare", label: "Da soli (caduta, nessun altro veicolo)", national: "aloneShare" },
  { key: "over64Share", label: "65+ tra le vittime di età nota", national: "over64ShareOfCasualties" },
  { key: "nightShare", label: "Tra le 20 e le 7", national: "nightShare" },
  { key: "hitAndRunShare", label: "Con veicolo datosi alla fuga", national: "hitAndRunShare" }
];

/** City crash profile vs all of Italy, as paired horizontal bars rendered in HTML. */
export function CrashProfileBars({ profile, national }: { profile: CrashProfile; national: Findings["profile"] }) {
  const max = Math.max(
    0.1,
    ...PROFILE_ROWS.flatMap((row) => [Number(profile[row.key] ?? 0), Number(national[row.national] ?? 0)])
  );
  return (
    <div className="profile-bars">
      <div className="profile-legend" aria-hidden="true">
        <span><i className="swatch city" />Questa città</span>
        <span><i className="swatch italy" />Italia</span>
      </div>
      {PROFILE_ROWS.map((row) => {
        const cityValue = profile[row.key] as number | null;
        const nationalValue = national[row.national] as number;
        return (
          <div className="profile-row" key={row.key}>
            <span className="profile-label">{row.label}</span>
            <span className="profile-track">
              <span className="profile-fill city" style={{ width: `${((cityValue ?? 0) / max) * 100}%` }} />
              <span className="profile-fill italy" style={{ width: `${(nationalValue / max) * 100}%` }} />
            </span>
            <span className="profile-values">
              <strong>{formatPercent(cityValue)}</strong>
              <span className="muted"> · Italia {formatPercent(nationalValue)}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
