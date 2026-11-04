module.exports = {
	root: true,
	parser: "@typescript-eslint/parser",
	parserOptions: {
		ecmaVersion: 2020,
		sourceType: "module",
	},
	plugins: ["@typescript-eslint"],
	env: {
		browser: true,
		es2020: true,
	},
	ignorePatterns: ["node_modules/", "main.js", "dist/", "coverage/"],
	rules: {
		"no-unused-vars": "off",
		"@typescript-eslint/no-unused-vars": [
			"error",
			{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
		],
		"prefer-const": "error",
		eqeqeq: ["error", "smart"],
		"no-console": "off",
	},
};
