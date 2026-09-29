/**
 * List aggregation (KTD2): merge quantities only within the same unit — different units of
 * the same ingredient coexist as separate quantities (cookcli behavior). Item order is
 * first-encounter across the resolved menu. Oracle: `cook shopping-list -f json`.
 */
import type { ParsedRecipe } from "./model";

export interface ListQuantity {
	value: number;
	unit: string | null;
}

export interface ListItem {
	name: string;
	quantities: ListQuantity[];
	/** Set by groupByAisle; empty until grouped. */
	aisle: string;
	/** Provenance labels (recipe refs), deduped in encounter order. */
	sources: string[];
}

export interface AggregateInput {
	recipe: ParsedRecipe;
	/** Provenance label, e.g. the resolved menu ref path. */
	source?: string;
}

export function aggregate(recipes: readonly AggregateInput[]): ListItem[] {
	const byName = new Map<string, ListItem>();
	for (const { recipe, source } of recipes) {
		for (const ing of recipe.ingredients) {
			if (!ing.name) continue;
			let item = byName.get(ing.name);
			if (!item) {
				item = { name: ing.name, quantities: [], aisle: "", sources: [] };
				byName.set(ing.name, item);
			}
			if (source && !item.sources.includes(source)) item.sources.push(source);
			if (ing.quantity?.value !== null && ing.quantity !== null) {
				const unit = ing.quantity.unit;
				const existing = item.quantities.find((q) => q.unit === unit);
				if (existing) existing.value += ing.quantity.value as number;
				else item.quantities.push({ value: ing.quantity.value as number, unit });
			}
			// else: quantity-less (missing or text-only) carries no count — cookcli emits an
			// empty quantity array for these (verified against CLI 0.35.0).
		}
	}
	return [...byName.values()];
}