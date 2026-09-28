// Bans Node/Electron imports from src/ — the plugin must run on Obsidian mobile
// (Capacitor), where Node built-ins and Electron do not exist. See plan R12/R13, KTD5.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const BANNED = ["fs", "path", "child_process", "electron", "process", "os", "util", "crypto", "http", "https"];
const SRC = new URL("../src", import.meta.url).pathname;

const offenders = [];

function walk(dir) {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			walk(full);
		} else if (entry.endsWith(".ts") || entry.endsWith(".mjs")) {
			const text = readFileSync(full, "utf8");
			for (const m of text.matchAll(/(?:import\s[^;]*?|export\s[^;]*?)\bfrom\s+["']([^"']+)["']/g)) {
				const mod = m[1];
				const base = mod.split("/").pop().split("?")[0];
				if (BANNED.includes(base)) offenders.push(`${full}: imports '${mod}'`);
			}
			if (/\brequire\(\s*["'](?:node:)?(?:fs|path|child_process|electron|process|os|util|crypto|http|https)\b/.test(text)) {
				offenders.push(`${full}: uses require() of a Node built-in`);
			}
		}
	}
}

walk(SRC);

if (offenders.length > 0) {
	console.error("Node/Electron imports found (breaks Obsidian mobile):");
	for (const o of offenders) console.error("  " + o);
	process.exit(1);
}
console.log("lint:node clean — no Node/Electron imports in src/");