import { describe, expect, it } from "vitest";
import { friendlyMessage, providerName } from "./errorMessages";

describe("friendlyMessage", () => {
	it("maps all provider error codes to actionable friendly copy", () => {
		expect(friendlyMessage("invalid_key", "gemini")).toEqual({ headline: "Your API key was rejected by Google Gemini.", hint: "Add a valid key in Settings → Vault Compass." });
		expect(friendlyMessage("model_not_found", "openai").headline).toBe("This model is no longer available.");
		expect(friendlyMessage("rate_limited", "openai").headline).toBe("Rate limited by OpenAI.");
		expect(friendlyMessage("quota_exceeded", "gemini").headline).toContain("quota or billing");
		expect(friendlyMessage("server", "gemini").headline).toContain("server trouble");
		expect(friendlyMessage("network", "openai").headline).toContain("Couldn't reach");
		expect(friendlyMessage("unknown", "gemini").headline).toContain("Something went wrong");
		expect(friendlyMessage(undefined, "gemini")).toEqual(friendlyMessage("unknown", "gemini"));
	});

	it("uses known provider names and passes unknown IDs through", () => {
		expect(providerName("gemini")).toBe("Google Gemini");
		expect(providerName("openai")).toBe("OpenAI");
		expect(providerName("some-unknown-id")).toBe("some-unknown-id");
	});
});
