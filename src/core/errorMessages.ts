import type { ErrorCode } from "./ProviderError";

export interface FriendlyError {
	headline: string;
	hint: string;
}

const PROVIDER_NAMES: Record<string, string> = {
	gemini: "Google Gemini",
	openai: "OpenAI",
};

export function providerName(providerId: string): string {
	return PROVIDER_NAMES[providerId] ?? providerId;
}

export function friendlyMessage(code: ErrorCode | undefined, providerId: string): FriendlyError {
	const provider = providerName(providerId);
	switch (code) {
		case "invalid_key":
			return { headline: `Your API key was rejected by ${provider}.`, hint: "Add a valid key in Settings → Vault Compass." };
		case "model_not_found":
			return { headline: "This model is no longer available.", hint: "Open Settings and use Fetch models to pick a current one." };
		case "rate_limited":
			return { headline: `Rate limited by ${provider}.`, hint: "Wait a moment and try again." };
		case "quota_exceeded":
			return { headline: `You've hit ${provider}'s quota or billing limit.`, hint: "Check your plan or billing at the provider." };
		case "server":
			return { headline: `${provider} is having server trouble.`, hint: "Try again shortly." };
		case "network":
			return { headline: `Couldn't reach ${provider}.`, hint: "Check your internet connection." };
		default:
			return { headline: `Something went wrong talking to ${provider}.`, hint: "Show technical details below." };
	}
}
