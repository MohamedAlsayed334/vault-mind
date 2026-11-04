import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiClient } from "./GeminiClient";

afterEach(() => vi.unstubAllGlobals());

describe("GeminiClient", () => {
  it("streams text deltas from Gemini SSE and sends the API key in a header", async () => {
    const payload = 'data: {"candidates":[{"content":{"parts":[{"text":"Hi"}]}}]}\n\n';
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(payload));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const events = [];
    for await (const event of new GeminiClient().generate({
      model: "gemini-3.8-flash",
      messages: [{ role: "user", content: "hello" }],
    }, "test-key")) events.push(event);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].headers["x-goog-api-key"]).toBe("test-key");
    expect(events).toEqual([{ type: "text_delta", delta: "Hi" }, { type: "done" }]);
  });

  it("emits an error for API HTTP failures without attempting fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("invalid key", { status: 401 }));
    const fallback = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const events = [];
    for await (const event of new GeminiClient(fallback).generate({
      model: "gemini-3.8-flash",
      messages: [{ role: "user", content: "hello" }],
    }, "bad-key")) events.push(event);

    expect(fallback).not.toHaveBeenCalled();
    expect(events[0]).toMatchObject({ type: "error", message: "Gemini API 401: invalid key" });
  });
});
