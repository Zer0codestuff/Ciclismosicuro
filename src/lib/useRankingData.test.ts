import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import published from "../../public/data/ranking.json";
import { useRankingData } from "./useRankingData";

afterEach(() => vi.unstubAllGlobals());

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe("dataset loading", () => {
  it("surfaces HTTP failures and retries into a validated ready state", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(response(null, 503)).mockResolvedValueOnce(response(published));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(useRankingData);
    await waitFor(() => expect(result.current[0]).toEqual({ status: "error", message: "HTTP 503" }));
    act(() => result.current[1]());
    await waitFor(() => expect(result.current[0].status).toBe("ready"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports an invalid schema as a load error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ schemaVersion: 2, cities: [{}] })));
    const { result } = renderHook(useRankingData);
    await waitFor(() => expect(result.current[0].status).toBe("error"));
    expect(result.current[0]).toMatchObject({ message: expect.stringMatching(/^Dataset non valido:/) });
  });

  it("ignores an earlier response that completes after retry", async () => {
    let resolveFirst!: (value: Response) => void;
    let firstSignal: AbortSignal | undefined;
    const delayed = new Promise<Response>((resolve) => { resolveFirst = resolve; });
    const fetchMock = vi.fn().mockImplementationOnce((_url: string, init: RequestInit) => { firstSignal = init.signal as AbortSignal; return delayed; }).mockResolvedValueOnce(response(published));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(useRankingData);
    act(() => result.current[1]());
    await waitFor(() => expect(result.current[0].status).toBe("ready"));
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => resolveFirst(response({ schemaVersion: 1 })));
    expect(result.current[0].status).toBe("ready");
  });

  it("aborts requests on unmount", () => {
    let signal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => { signal = init.signal as AbortSignal; return new Promise(() => {}); }));
    const { unmount } = renderHook(useRankingData);
    unmount();
    expect(signal?.aborted).toBe(true);
  });
});
