import { describe, it, expect } from "vitest";
import { ContextBuilder } from "./ContextBuilder";

describe("ContextBuilder", () => {
	it("should initialize correctly", () => {
		const mockApp: any = {
			workspace: {
				getActiveFile: () => null,
				getLeavesOfType: () => [],
			},
		};
		const builder = new ContextBuilder(mockApp);
		expect(builder).toBeDefined();
	});
});
