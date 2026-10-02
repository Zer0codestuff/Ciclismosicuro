import { useEffect, useState } from "react";
import type { RankingPayload } from "../types";
import { withBase } from "./assets";
import { parseRankingPayload } from "./payload";

export type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: RankingPayload };

export function useRankingData(): [LoadState, () => void] {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fetch(withBase("data/ranking.json"), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((json) => {
        if (!controller.signal.aborted) setState({ status: "ready", payload: parseRankingPayload(json) });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      });
    return () => controller.abort();
  }, [attempt]);
  return [state, () => setAttempt((value) => value + 1)];
}
