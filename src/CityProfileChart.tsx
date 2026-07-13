import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { formatMetric } from "./scoring";

export interface CityProfileChartEntry {
  category: string;
  score: number;
  imputed: boolean;
  fill: string;
}

export function CityProfileChart({ data }: { data: CityProfileChartEntry[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="category" />
        <YAxis domain={[0, 100]} />
        <Tooltip formatter={(value) => formatMetric(Number(value), 1)} />
        <Bar dataKey="score" name="Indice" radius={[6, 6, 0, 0]} isAnimationActive={false}>
          {data.map((entry) => (
            <Cell key={entry.category} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
