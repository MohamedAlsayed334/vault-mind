import { describe, it, expect } from "vitest";
import { ProviderError, classify, isAbortError } from "./ProviderError";

describe("classify", () => {
	it("classifies 401 as invalid_key", () => {
		expect(classify(401)).toBe("invalid_key");
		expect(classify(401, '{"error":"bad key"}')).toBe("invalid_key");
	});

	it("classifies 400 with Gemini's API_KEY_INVALID body as invalid_key", () => {
		const body = '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}';
		expect(classify(400, body)).toBe("invalid_key");
	});

	it("classifies 400 with passphrase auth wording as invalid_key", () => {
		expect(classify(400, "Wrong passphrase for credentials")).toBe("invalid_key");
	});

	it("classifies 400 with generic key wording as invalid_key", () => {
		expect(classify(400, "invalid api key supplied")).toBe("invalid_key");
		expect(classify(400, "api_key is invalid")).toBe("invalid_key");
	});

	it("classifies a generic 400 as unknown", () => {
		expect(classify(400, '{"error":"malformed request"}')).toBe("unknown");
		expect(classify(400)).toBe("unknown");
	});

	it("classifies 404 on a generate/stream request as model_not_found", () => {
		// Real Google body captured in production (gemini-2.0-flash retirement).
		const body =
			'{"error":{"code":404,"message":"This model models/gemini-2.0-flash is no longer available...","status":"NOT_FOUND"}}';
		expect(classify(404, body, { modelRequest: true })).toBe("model_not_found");
		expect(classify(404, undefined, { modelRequest: true })).toBe("model_not_found");
	});

	it("classifies a bare endpoint 404 as unknown", () => {
		expect(classify(404, "Not Found")).toBe("unknown");
		expect(classify(404)).toBe("unknown");
		expect(classify(404, undefined, { modelRequest: false })).toBe("unknown");
	});

	it("classifies 429 with quota/billing wording as quota_exceeded", () => {
		expect(classify(429, "You exceeded your current quota, please check your plan and billing")).toBe("quota_exceeded");
		expect(classify(429, "Resource has been exhausted (e.g. check quota).")).toBe("quota_exceeded");
		expect(classify(429, "quota exceeded for this month")).toBe("quota_exceeded");
		expect(classify(429, "billing limit reached")).toBe("quota_exceeded");
		expect(classify(429, "credit balance low")).toBe("quota_exceeded");
	});

	it("classifies a plain 429 as rate_limited", () => {
		expect(classify(429, "Rate limit reached for requests")).toBe("rate_limited");
		expect(classify(429)).toBe("rate_limited");
	});

	it("classifies 5xx as server", () => {
		expect(classify(500)).toBe("server");
		expect(classify(502, "bad gateway")).toBe("server");
		expect(classify(503)).toBe("server");
		expect(classify(599)).toBe("server");
	});

	it("classifies anything else as unknown", () => {
		expect(classify(403, "permission denied")).toBe("unknown");
		expect(classify(418, "teapot")).toBe("unknown");
		expect(classify(422)).toBe("unknown");
		expect(classify(200)).toBe("unknown");
	});
});

describe("isAbortError", () => {
	it("recognizes DOMException AbortError as a user abort, not an error", () => {
		expect(isAbortError(new DOMException("The operation was aborted.", "AbortError"))).toBe(true);
	});

	it("recognizes Error named AbortError across runtimes", () => {
		const err = new Error("The operation was aborted");
		err.name = "AbortError";
		expect(isAbortError(err)).toBe(true);
		expect(isAbortError(Object.assign(new Error("Aborted"), { name: "AbortError" }))).toBe(true);
	});

	it("recognizes defensive TypeError abort wording", () => {
		expect(isAbortError(new TypeError("The operation was aborted"))).toBe(true);
		expect(isAbortError(new TypeError("signal is aborted"))).toBe(true);
	});

	it("does not match ordinary errors", () => {
		expect(isAbortError(new Error("Failed to fetch"))).toBe(false);
		expect(isAbortError(new TypeError("Failed to fetch"))).toBe(false);
		expect(isAbortError(null)).toBe(false);
	});
});

describe("ProviderError", () => {
	it("sets code, message, name and an absent cause", () => {
		const err = new ProviderError("invalid_key", "Key rejected");
		expect(err.code).toBe("invalid_key");
		expect(err.message).toBe("Key rejected");
		expect(err.name).toBe("ProviderError");
		expect(err.cause).toBeUndefined();
	});

	it("carries code, message, cause and ids", () => {
		const err = new ProviderError("model_not_found", "Gemini rejected the request (404)", {
			cause: '{"error":{"code":404}}',
			providerId: "gemini",
			modelId: "gemini-2.0-flash",
		});
		expect(err).toBeInstanceOf(Error);
		expect(err.code).toBe("model_not_found");
		expect(err.message).toBe("Gemini rejected the request (404)");
		expect(err.cause).toBe('{"error":{"code":404}}');
		expect(err.providerId).toBe("gemini");
		expect(err.modelId).toBe("gemini-2.0-flash");
		expect(err.name).toBe("ProviderError");
	});
});
