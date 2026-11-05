/**
 * Coded provider errors, shared by providers (who throw / yield them) and the
 * UI (who renders one friendly sentence per code). Lives in core/ so both
 * layers can import it without violating module boundaries; it is pure
 * TypeScript with no "obsidian" or Node imports.
 *
 * Design contract:
 * - `message` is a short human one-liner safe to show as-is.
 * - `cause` carries the raw provider body / underlying error text and is only
 *   rendered behind a collapsed "Show technical details" disclosure.
 * - User-driven aborts are NOT errors: use `isAbortError` before classify.
 */

export type ErrorCode =
	| "invalid_key"
	| "model_not_found"
	| "rate_limited"
	| "quota_exceeded"
	| "network"
	| "server"
	| "unknown";

export interface ProviderErrorOptions {
	/** Raw provider response body or underlying error text. Never logged elsewhere. */
	cause?: string;
	providerId?: string;
	modelId?: string;
}

export class ProviderError extends Error {
	readonly code: ErrorCode;
	readonly cause?: string;
	readonly providerId?: string;
	readonly modelId?: string;

	constructor(code: ErrorCode, message: string, options: ProviderErrorOptions = {}) {
		super(message);
		this.name = "ProviderError";
		this.code = code;
		this.cause = options.cause;
		this.providerId = options.providerId;
		this.modelId = options.modelId;
	}
}

/**
 * Classify an HTTP status (and optional response body) into an ErrorCode.
 *
 * 404 model heuristics, kept deliberately simple: when the failing request was
 * a generate/stream call (i.e. a specific model id was in play — the caller
 * knows this and passes `modelRequest: true`, or the URL matched
 * /models/<id>), a 404 means the model is gone. A bare endpoint 404 (e.g. the
 * models LIST url, bad path) stays `unknown`.
 */
export function classify(
	status: number,
	body?: string,
	hint?: { modelRequest?: boolean },
): ErrorCode {
	const text = typeof body === "string" ? body : "";

	if (status === 401) {
		return "invalid_key";
	}

	if (status === 400) {
		// Gemini reports bad keys as 400 with API_KEY_INVALID or "API key not
		// valid"; other providers use auth-ish wording (e.g. passphrase /
		// invalid api key) in the body.
		if (/API_KEY_INVALID|passphrase|invalid[ _-](api[ _-]?)?key|key[ _-].{0,20}(?:is[ _-]?)?invalid|key[ _-].{0,10}not[ _-]valid/i.test(text)) {
			return "invalid_key";
		}
		return "unknown";
	}

	if (status === 404) {
		return hint?.modelRequest ? "model_not_found" : "unknown";
	}

	if (status === 429) {
		// Quota/billing exhaustion mentions quota (Google) or billing/plan
		// (OpenAI); plain "rate limit" wording stays rate_limited.
		return /quota|billing|plan|credit/i.test(text) ? "quota_exceeded" : "rate_limited";
	}

	if (status >= 500 && status <= 599) {
		return "server";
	}

	return "unknown";
}

/**
 * True when `err` is the rejection fetch throws because the caller's
 * AbortSignal fired. This is a user-initiated cancel, not a failure — callers
 * must not classify or surface it as an error.
 */
export function isAbortError(err: unknown): boolean {
	if (err instanceof Error && err.name === "AbortError") return true;
	if (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError") {
		return true;
	}
	// Defensive: some runtimes reject with a TypeError whose message names aborts.
	return (
		err instanceof TypeError &&
		/The operation was aborted|signal is aborted/i.test(err.message)
	);
}
