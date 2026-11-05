# Development

## Requirements

- Node.js 20 or newer and npm
- A disposable Obsidian test vault for live plugin checks

## Set up and verify

From the repository root:

```bash
npm ci
npm run build
npm run typecheck
npm run lint
npm test
```

Use `npm run dev` for esbuild watch mode. The production build emits `main.js` and `styles.css` in the repository root.

## Test in Obsidian

Use a disposable vault, not a vault containing notes you cannot risk changing. After building, copy `main.js`, `styles.css`, `manifest.json`, and `versions.json` into `<test-vault>/.obsidian/plugins/vault-compass/`. Enable the plugin from **Settings → Community plugins** and follow [TESTING.md](TESTING.md).

## Contributor conventions

Read [AGENTS.md](../AGENTS.md) before making changes. It documents architecture boundaries, security and approval requirements, platform constraints, and commit conventions. Keep changes focused and do not commit generated `main.js`, dependencies, or secrets.
