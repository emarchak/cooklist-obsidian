import { describe, expect, it } from "vitest";
import { aggregate } from "../../src/engine/aggregate";
import type { ParsedRecipe } from "../../src/engine/model";

const recipe = (ingredients: [string, number | null, string | null][], scale = 1): ParsedRecipe => ({
	ingredients: ingredients.map(([name, value, unit]) => ({ name, quantity: value === null ? null : { value, unit } })),
	metadata: {},
	scale,
});

describe("aggregate (cookcli semantics: merge same unit only)", () => {
	it("merges same-name same-unit quantities", () => {
		const items = aggregate([
			{ recipe: recipe([["onion", 2, null]]) },
			{ recipe: recipe([["onion", 3, null]]) },
		]);
		expect(items).toHaveLength(1);
		expect(items[0].name).toBe("onion");
		expect(items[0].quantities).toEqual([{ value: 5, unit: null }]);
	});

	it("keeps different-unit quantities of the same ingredient separate", () => {
		const items = aggregate([
			{ recipe: recipe([["onions", 2, null]]) },
			{ recipe: recipe([["onions", 500, "g"]]) },
		]);
		expect(items).toHaveLength(1);
		expect(items[0].quantities).toHaveLength(2);
		expect(items[0].quantities).toContainEqual({ value: 2, unit: null });
		expect(items[0].quantities).toContainEqual({ value: 500, unit: "g" });
	});

	it("keeps first-encounter order and records sources", () => {
		const items = aggregate([
			{ recipe: recipe([["butter", 50, "g"], ["garlic", 2, "cloves"]]), source: "./cooking/A" },
			{ recipe: recipe([["garlic", 1, "cloves"], ["butter", 2, "tbsp"]]), source: "./cooking/B" },
		]);
		expect(items.map((i) => i.name)).toEqual(["butter", "garlic"]);
		expect(items[0].sources).toEqual(["./cooking/A", "./cooking/B"]); // provenance, deduped
	});

	it("carries no count for quantity-less ingredients (cookcli: empty quantity array)", () => {
		const items = aggregate([{ recipe: recipe([["minced chives", null, null]]) }]);
		expect(items).toHaveLength(1);
		expect(items[0].name).toBe("minced chives");
		expect(items[0].quantities).toEqual([]);
	});
});