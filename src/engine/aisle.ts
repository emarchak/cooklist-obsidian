/**
 * Aisle grouping (KTD2, R3): aisle.conf INI sections define display order (preserved),
 * entries may carry `|` synonym pipes, unmatched ingredients fall into `other` (last),
 * and empty sections are omitted. Matching is case-insensitive; output keeps original names.
 */
import type { ListItem } from "./aggregate";

export interface AisleConfig {
	/** Section names in aisle.conf order. */
	order: string[];
	/** Lowercased ingredient/synonym → section name. */
	map: Map<string, string>;
	/** Resolve an ingredient name (case-insensitive) to its section, or null when unlisted. */
	sectionOf: (name: string) => string | null;
}

export function parseAisle(text: string): AisleConfig {
	const order: string[] = [];
	const map = new Map<string, string>();
	let current: string | null = null;
	for (const rawLine of text.split("\n")) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#")) continue;
		const section = line.match(/^\[(.+)\]$/);
		if (section) {
			current = section[1].trim();
			if (!order.includes(current)) order.push(current);
			continue;
		}
		if (!current) continue;
		for (const alias of line.split("|")) {
			const name = alias.trim().toLowerCase();
			if (name) map.set(name, current);
		}
	}
	return { order, map, sectionOf: (name: string) => map.get(name.toLowerCase()) ?? null };
}

export interface AisleSection {
	name: string;
	items: ListItem[];
}

export function groupByAisle(items: readonly ListItem[], aisle: AisleConfig): AisleSection[] {
	const OTHER = "other";
	const sections = new Map<string, ListItem[]>();
	for (const item of items) {
		const section = aisle.map.get(item.name.toLowerCase()) ?? OTHER;
		let list = sections.get(section);
		if (!list) {
			list = [];
			sections.set(section, list);
		}
		list.push({ ...item, aisle: section });
	}
	const ordered = aisle.order
		.filter((name) => sections.has(name))
		.map((name) => ({
			name,
			// cookcli sorts aisle-matched items alphabetically (case-insensitive)...
			items: sections.get(name)!.slice().sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())),
		}));
	// ...but leaves the `other` fallback in first-encounter order (verified against CLI 0.35.0).
	if (sections.has(OTHER)) ordered.push({ name: OTHER, items: sections.get(OTHER)! });
	return ordered;
}