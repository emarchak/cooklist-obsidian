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