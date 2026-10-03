/** Shared parse model — what the list engine (U3) consumes. Both parser adapters (KTD1) map into it. */

export interface Quantity {
	/** Numeric amount (start of a range); null when text-only. */
	value: number | null;
	unit: string | null;
}

export interface ParsedIngredient {
	name: string;
	quantity: Quantity | null;
}

export interface ParsedRecipe {
	ingredients: ParsedIngredient[];
	/** Raw preamble metadata as strings (e.g. servings: "8"). */
	metadata: Record<string, string>;
	/** The scale factor this recipe was parsed at. */
	scale: number;
}

export type RefScale =
	| { kind: "factor"; n: number }
	| { kind: "servings"; n: number }
	| { kind: "yield"; n: number; unit: string };

export interface MenuRef {
	/** Path relative to the recipe-box root, without the .cook extension. */
	ref: string;
	scale: RefScale | null;
}

export interface MenuDay {
	label: string;
	/** ISO date from `== Day (2026-03-07) ==` when present. */
	date: string | null;
	refs: MenuRef[];
	/** `-- comment` lines — notes and takeout markers; never ingredients. */
	comments: string[];
}

export interface Menu {
	title: string | null;
	days: MenuDay[];
}

/** File access abstraction — the plugin supplies the vault adapter; tests supply memory. Keeps Node APIs out of src/ (R12). */
export interface FileReader {
	read(path: string): Promise<string>;
}

export class RecipeNotFoundError extends Error {
	constructor(ref: string) {
		super(`Recipe not found: ${ref}`);
		this.name = "RecipeNotFoundError";
	}
}