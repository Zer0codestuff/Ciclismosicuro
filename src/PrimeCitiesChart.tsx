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
import type { RankedCity } from "./types";

export function PrimeCitiesChart({
  cities,
  selectedCityName,
  onSelectCity
}: {
  cities: RankedCity[];
  selectedCityName: string;
  onSelectCity: (cityName: string) => void;
}) {
  const handleBarClick = (bar: unknown) => {
    if (!bar || typeof bar !== "object") return;
    const cityName = (bar as { payload?: { city?: unknown } }).payload?.city;
    if (typeof cityName === "string") onSelectCity(cityName);
  };

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={cities} layout="vertical" margin={{ left: 24 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} />
        <YAxis type="category" dataKey="city" width={96} />
        <Tooltip formatter={(value) => formatMetric(Number(value), 1)} />
        <Bar
          data-testid="prime-12-bars"
          dataKey="adjustedScore"
          name="Indice"
          radius={[0, 6, 6, 0]}
          isAnimationActive={false}
          cursor="pointer"
          onClick={handleBarClick}
        >
          {cities.map((city) => (
            <Cell
              key={city.city}
              fill={city.city === selectedCityName ? "#d97706" : "#0f766e"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
