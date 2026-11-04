import { describe, it, expect } from "vitest";
import { TokenStore } from "./TokenStore";

describe("TokenStore", () => {
	it("should store and retrieve tokens securely", () => {
		const store = new TokenStore();
		store.set("test-provider", "secret-token-123");
		expect(store.get("test-provider")).toBe("secret-token-123");

		store.clear("test-provider");
		expect(store.get("test-provider")).toBeNull();
	});
});
