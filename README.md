# cooklist-obsidian

A companion Obsidian plugin to [cooklang-obsidian](https://github.com/deathau/cooklang-obsidian): a shopping-list workbench over the Cooklang CookCLI file formats.

The plugin is a surface onto the files — it never replaces them:

- `.menu.md` / `.cook` in the recipe box (read-only) feed list generation
- `pantry.conf` deductions and `aisle.conf` aisle grouping match `cook shopping-list` semantics
- Ticks persist to `.shopping-list` / `.shopping-checked` in the official Cooklang conventions
- Deal flags come from the in-vault grocery-deals digest (`daily/YYYY/MM/DD/grocery-deals.md`), so the plugin works offline on mobile

Per-store lists: pick the stores you're hitting and a home store; deal items land on their store's list, everything else rides with home.

See `docs/plans/` in the Obsidian vault for the full product/implementation plan.

## Status

Work in progress — scaffold and workbench pane shell (U1). No list generation yet.

## Development

```bash
npm install
npm run build   # typecheck + esbuild bundle + Node-import lint
npm test        # lint + vitest
```

## Install

Copy `main.js`, `manifest.json`, `styles.css` into `<vault>/.obsidian/plugins/cooklist/`, then enable "Cooklist Shopping Workbench" in Obsidian's community-plugin settings.
## Mobile hardening

The WASM parser is inlined into the bundle as base64 (no external `.wasm`
asset, no `import.meta.url`, no Node APIs — enforced by the `lint:node`
gate on every build). All file I/O goes through the Obsidian vault
adapter, so the plugin runs on iOS/Android with no network access.

### Device smoke test (manual, iOS/Android)

1. Install per above; sync the vault (Obsidian Sync/iCloud).
2. Enable Cooklist in Settings → Community plugins.
3. Open the right sidebar → Shopping workbench.
4. **Airplane mode on.** Trip tab → menu path `recipe-box/<menu>.menu.md`,
   pick stores, set home, Start trip.
5. Verify: per-store lists render with deal badges (digest is read from
   vault `daily/` notes, so no network is needed), items are tickable.
6. Tick a few items, then check `.shopping-checked` appears in the recipe
   box after reconnecting.

### Cross-device tick expectations (OQ4)

Tick state lives in convention-pure hidden files (`.shopping-list`,
`.shopping-checked`). iCloud Drive does not sync dotfiles, so ticks made
on the phone are expected **not** to appear on the desktop — this is a
recorded, accepted design decision, not a sync failure to fix. Obsidian
Sync or another vault-sync method that mirrors dotfiles would propagate
them; outcome should simply be recorded during the device test.
