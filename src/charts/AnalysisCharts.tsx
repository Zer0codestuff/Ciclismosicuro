import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps
} from "recharts";
import { formatNumber, formatPercent } from "../lib/format";
import type { NationalYear, RankedCity } from "../types";

const AXIS = { stroke: "#c9d4ce", tick: { fill: "#5f6f69", fontSize: 12 } };
const TOOLTIP_STYLE = {
  contentStyle: { borderRadius: 10, border: "1px solid #d7e1dc", boxShadow: "0 8px 24px rgba(26,54,48,.12)" },
  labelStyle: { color: "#063c38", fontWeight: 700 }
};
const POINT = "#0d9488";
const HIGHLIGHT = "#d97706";

export function NationalBars({
  data,
  field,
  color,
  label
}: {
  data: NationalYear[];
  field: "cyclistKilled" | "cyclistInjured";
  color: string;
  label: string;
}) {
  const rows = data.map((entry) => ({ year: String(entry.year), value: entry[field] }));
  return (
    <ResponsiveContainer width="100%" height={210}>
      <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -6 }} barCategoryGap="22%">
        <CartesianGrid stroke="#e6ece8" vertical={false} />
        <XAxis dataKey="year" {...AXIS} tickLine={false} interval="preserveStartEnd" />
        <YAxis {...AXIS} tickLine={false} axisLine={false} tickFormatter={(value: number) => formatNumber(value)} />
        <Tooltip {...TOOLTIP_STYLE} cursor={{ fill: "rgba(13,148,136,.08)" }} formatter={(value: number) => [formatNumber(value), label]} />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]}>
          {rows.map((row) => (
            <Cell key={row.year} fill={row.year === "2020" ? "#b5c6bf" : color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

interface ScatterPoint {
  id: string;
  name: string;
  x: number;
  y: number;
  selected: boolean;
}

function CityTooltip({ active, payload, xLabel, yLabel }: TooltipProps<number, string> & { xLabel: (v: number) => string; yLabel: (v: number) => string }) {
  const point = payload?.find((entry) => entry.payload && "name" in entry.payload)?.payload as ScatterPoint | undefined;
  if (!active || !point) return null;
  return (
    <div className="chart-tooltip">
      <strong>{point.name}</strong>
      <span>{xLabel(point.x)}</span>
      <span>{yLabel(point.y)}</span>
    </div>
  );
}

function renderDot(onSelect: (id: string) => void) {
  return function Dot(props: { cx?: number; cy?: number; payload?: ScatterPoint }) {
    const { cx = 0, cy = 0, payload } = props;
    if (!payload) return <g />;
    return (
      <g style={{ cursor: "pointer" }} role="button" tabIndex={0} aria-label={`Apri la scheda di ${payload.name}`} onClick={() => onSelect(payload.id)} onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(payload.id); }
      }}>
        <circle cx={cx} cy={cy} r={12} fill="transparent" />
        <circle
          cx={cx}
          cy={cy}
          r={payload.selected ? 7 : 4.5}
          fill={payload.selected ? HIGHLIGHT : POINT}
          fillOpacity={payload.selected ? 1 : 0.78}
          stroke="#ffffff"
          strokeWidth={payload.selected ? 2 : 1}
        />
        {payload.selected ? (
          <text x={cx + 10} y={cy - 8} className="scatter-label">
            {payload.name}
          </text>
        ) : null}
      </g>
    );
  };
}

/** Cyclist casualties per resident against cycling share, both on log scales, with the fitted model. */
export function SafetyInNumbersChart({
  cities,
  selectedId,
  intercept,
  exponent,
  onSelectCity
}: {
  cities: RankedCity[];
  selectedId: string;
  intercept: number;
  exponent: number;
  onSelectCity: (id: string) => void;
}) {
  const points: ScatterPoint[] = cities
    .map((city) => ({
      id: city.id,
      name: city.name,
      x: Number(city.metrics.bikeCommuteShare),
      y: city.safety.perResident100k,
      selected: city.id === selectedId
    }))
    .filter((point) => point.x > 0 && point.y > 0 && Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((a, b) => Number(a.selected) - Number(b.selected));
  const minX = Math.min(0.05, ...points.map((point) => point.x));
  const maxX = Math.max(35, ...points.map((point) => point.x));
  const minY = Math.min(0.5, ...points.map((point) => point.y));
  const maxY = Math.max(400, ...points.map((point) => point.y));
  const xs = Array.from({ length: 60 }, (_, i) => Math.exp(Math.log(minX) + (Math.log(maxX) - Math.log(minX)) * i / 59));
  const line = xs.map((x) => ({ x, fit: 1e5 * Math.exp(intercept) * (x / 100) ** exponent }));
  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart margin={{ top: 12, right: 16, bottom: 24, left: 4 }}>
        <CartesianGrid stroke="#e6ece8" />
        <XAxis
          type="number"
          dataKey="x"
          scale="log"
          domain={[minX, maxX]}
          ticks={[0.1, 0.3, 1, 3, 10, 30]}
          tickFormatter={(value: number) => `${formatNumber(value, value < 1 ? 1 : 0)}%`}
          {...AXIS}
          label={{ value: "Pendolari che usano la bici (2011, scala log)", position: "insideBottom", offset: -14, fill: "#5f6f69", fontSize: 12 }}
          allowDataOverflow
        />
        <YAxis
          type="number"
          dataKey="y"
          scale="log"
          domain={[minY, maxY]}
          ticks={[1, 3, 10, 30, 100, 300]}
          tickFormatter={(value: number) => formatNumber(value)}
          {...AXIS}
          label={{ value: "Ciclisti morti o feriti / 100 mila ab.", angle: -90, position: "insideLeft", offset: 14, dy: 110, fill: "#5f6f69", fontSize: 12 }}
          allowDataOverflow
        />
        <Tooltip
          cursor={false}
          content={
            <CityTooltip
              xLabel={(value) => `Pendolari in bici: ${formatNumber(value, 1)}%`}
              yLabel={(value) => `${formatNumber(value, 1)} morti o feriti ogni 100 mila ab./anno`}
            />
          }
        />
        <Line data={line} dataKey="fit" type="monotone" stroke="#063c38" strokeWidth={2} dot={false} isAnimationActive={false} legendType="none" />
        <Scatter data={points} shape={renderDot(onSelectCity)} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Cycle lanes per resident against the exposure-adjusted risk ratio. */
export function InfrastructureRiskChart({
  cities,
  selectedId,
  onSelectCity
}: {
  cities: RankedCity[];
  selectedId: string;
  onSelectCity: (id: string) => void;
}) {
  const points: ScatterPoint[] = cities
    .filter((city) => typeof city.metrics.cycleLanesPer10k === "number")
    .map((city) => ({
      id: city.id,
      name: city.name,
      x: Number(city.metrics.cycleLanesPer10k),
      y: city.safety.ratio,
      selected: city.id === selectedId
    }))
    .sort((a, b) => Number(a.selected) - Number(b.selected));
  const maxX = Math.max(30, ...points.map((point) => point.x));
  const minY = Math.min(0.3, ...points.map((point) => point.y));
  const maxY = Math.max(3, ...points.map((point) => point.y));
  return (
    <ResponsiveContainer width="100%" height={340}>
      <ComposedChart margin={{ top: 12, right: 16, bottom: 24, left: 4 }}>
        <CartesianGrid stroke="#e6ece8" />
        <XAxis
          type="number"
          dataKey="x"
          scale="linear"
          domain={[0, maxX]}
          tickFormatter={(value: number) => formatNumber(value, value < 1 ? 1 : 0)}
          {...AXIS}
          label={{ value: "Km di piste ogni 10 mila abitanti (2024)", position: "insideBottom", offset: -14, fill: "#5f6f69", fontSize: 12 }}
          allowDataOverflow
        />
        <YAxis
          type="number"
          dataKey="y"
          scale="log"
          domain={[minY, maxY]}
          ticks={[0.33, 0.5, 0.75, 1, 1.5, 2, 3]}
          tickFormatter={(value: number) => `${formatNumber(value, 2)}×`}
          {...AXIS}
          label={{ value: "Morti e feriti / attesi", angle: -90, position: "insideLeft", offset: 14, dy: 100, fill: "#5f6f69", fontSize: 12 }}
          allowDataOverflow
        />
        <ReferenceLine y={1} stroke="#063c38" strokeWidth={1.5} />
        <Tooltip
          cursor={false}
          content={
            <CityTooltip
              xLabel={(value) => `${formatNumber(value, 1)} km di piste ogni 10 mila ab.`}
              yLabel={(value) => `${formatNumber(value, 2)}× l'atteso del modello`}
            />
          }
        />
        <Scatter data={points} shape={renderDot(onSelectCity)} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const OPPONENT_LABELS: Record<string, string> = {
  car: "Auto",
  alone: "Nessun altro veicolo",
  heavy: "Bus, camion, furgoni",
  motorbike: "Moto e ciclomotori",
  bike: "Altra bici",
  hitAndRun: "Veicolo fuggito",
  escooter: "Monopattino",
  multiple: "Più veicoli coinvolti",
  other: "Altri veicoli"
};

export function OpponentBars({ opponents, total }: { opponents: Record<string, number>; total: number }) {
  const rows = Object.entries(OPPONENT_LABELS)
    .map(([key, label]) => ({ label, share: total > 0 ? (opponents[key] ?? 0) / total : 0 }))
    .sort((a, b) => b.share - a.share);
  return (
    <div className="hbar-list">
      {rows.map((row) => (
        <div className="hbar-row" key={row.label}>
          <span className="hbar-label">{row.label}</span>
          <span className="hbar-track">
            <span className="hbar-fill" style={{ width: `${rows[0].share > 0 ? (row.share / rows[0].share) * 100 : 0}%` }} />
          </span>
          <span className="hbar-value">{formatPercent(row.share, row.share < 0.1 ? 1 : 0)}</span>
        </div>
      ))}
    </div>
  );
}

export function HourChart({ hours }: { hours: number[] }) {
  const total = hours.reduce((a, b) => a + b, 0);
  const rows = hours.map((value, hour) => ({ hour: `${hour}`, share: total > 0 ? value / total : 0 }));
  return (
    <ResponsiveContainer width="100%" height={190}>
      <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -18 }} barCategoryGap="12%">
        <CartesianGrid stroke="#e6ece8" vertical={false} />
        <XAxis dataKey="hour" {...AXIS} tickLine={false} interval={2} tickFormatter={(value: string) => `${value}h`} />
        <YAxis {...AXIS} tickLine={false} axisLine={false} tickFormatter={(value: number) => formatPercent(value)} />
        <Tooltip
          {...TOOLTIP_STYLE}
          cursor={{ fill: "rgba(13,148,136,.08)" }}
          labelFormatter={(label: string) => `Dalle ${label}:00 alle ${label}:59`}
          formatter={(value: number) => [formatPercent(value, 1), "Ciclisti morti o feriti"]}
        />
        <Bar dataKey="share" fill="#0d9488" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
