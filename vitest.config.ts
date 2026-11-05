// Vitest config — minimal. The only job here is mirroring the "@/*" path
// alias from tsconfig.json, which esbuild honors natively in the bundle but
// vite (vitest's resolver) does not read.
import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src");

export default defineConfig({
	resolve: {
		alias: {
			"@": srcDir,
		},
	},
});
