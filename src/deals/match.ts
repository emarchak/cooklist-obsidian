/**
 * Conservative deal matching (KTD4, U5): case-insensitive FULL-PHRASE equality between a
 * list item and a flyer row, plus aisle-synonym equivalence. Brand prefixes and size
 * suffixes on flyer names ("DUFFLET 6\" CAKES", "SOYKEI ORGANIC TOFU, 400 G") deliberately
 * do not match generic ingredients — a cleaner flag list beats a noisier one.
 */
import type { Deal, Digest } from "./digest";
import type { ListItem } from "../engine/aggregate";

/** Lowercase + strip a single trailing "s" per token — flyer plurals drift ("BRUSSEL SPROUTS",
 * "GREEN ONIONS", "PEARS"); token count is preserved so brand/size rows stay unmatched. */
function pluralNorm(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.split(/\s+/)
		.map((token) => (token.length > 1 && token.endsWith("s") ? token.slice(0, -1) : token))
		.join(" ");
}

/** Build a canon map from aisle.conf synonym pipes: "scallion|green onion" → both → "scallion".
 * Keys and values are plural-normalized so "GREEN ONIONS" finds the "green onion" entry. */
export function buildSynonymCanon(aisleText: string): Map<string, string> {
	const canon = new Map<string, string>();
	for (const rawLine of aisleText.split("\n")) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#") || line.startsWith("[")) continue;
		const names = line.split("|").map((n) => pluralNorm(n)).filter(Boolean);
		if (names.length > 1) for (const n of names) canon.set(n, names[0]);
	}
	return canon;
}

/** Plural-normalized matching key, routed through the synonym canon when one applies. */
function phraseKey(name: string, synonyms: Map<string, string> | undefined): string {
	const normalized = pluralNorm(name);
	const canon = synonyms?.get(normalized);
	return canon ? pluralNorm(canon) : normalized;
}

/** Match each item to at most one deal — cheapest price wins among duplicates. */
export function matchDeals(
	items: readonly ListItem[],
	digest: Digest,
	synonyms?: Map<string, string>
): Map<string, Deal> {
	const byCanonical = new Map<string, Deal[]>();
	for (const deal of digest.deals) {
		if (deal.price === null) continue; // banner rows have nothing to repeat
		const key = phraseKey(deal.name, synonyms);
		const list = byCanonical.get(key) ?? [];
		list.push(deal);
		byCanonical.set(key, list);
	}

	const matches = new Map<string, Deal>();
	for (const item of items) {
		const deals = byCanonical.get(phraseKey(item.name, synonyms));
		if (!deals || deals.length === 0) continue;
		const best = [...deals].sort((a, b) => Number(a.suspicious) - Number(b.suspicious) || (a.price ?? Infinity) - (b.price ?? Infinity))[0];
		matches.set(item.name.trim().toLowerCase(), best);
	}
	return matches;
}