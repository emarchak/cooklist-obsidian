import { describe, expect, it } from "vitest";
import { deduct, parsePantry } from "../../src/engine/pantry";

const pantryText = `[pantry]
"kosher salt" = "400%tsp"
"olive oil" = "100%tbsp"
"eggs" = "6"
"water" = "20%cups"
`;

describe("parsePantry (vault pantry.conf shape)", () => {
	it("parses quoted name = qty%unit entries and bare counts", () => {
		const pantry = parsePantry(pantryText);
		expect(pantry).toContainEqual({ name: "kosher salt", value: 400, unit: "tsp" });
		expect(pantry).toContainEqual({ name: "eggs", unit: null, value: 6 });
	});

	it("keeps units raw (cookcli compares and emits units as written)", () => {
		const pantry = parsePantry(pantryText);
		expect(pantry.find((p) => p.name === "water")?.unit).toBe("cups");
	});

	it("skips comments and covers all stock sections", () => {
		const pantry = parsePantry(`[pantry]\n# note\n"a" = "1%tsp"\n[fridge]\n"b" = "2%c"\n[freezer]\n"c" = "3%g"\n`);
		expect(pantry).toHaveLength(3);
	});
});

describe("deduct (unit-exact, cookcli semantics)", () => {
	const list = (name: string, value: number, unit: string | null) => ({
		name,
		quantities: [{ value, unit }],
		aisle: "other",
		sources: [name],
	});

	it("deducts same-unit pantry stock (AE1: eggs need-minus-6)", () => {
		const pantry = parsePantry(pantryText);
		const result = deduct([list("eggs", 12, null)], pantry);
		expect(result.items).toHaveLength(1);
		expect(result.items[0].quantities).toEqual([{ value: 6, unit: null }]);
	});

	it("drops items the pantry fully covers", () => {
		const pantry = parsePantry(pantryText);
		const result = deduct([list("olive oil", 2, "tbsp"), list("eggs", 6, null)], pantry);
		expect(result.items).toHaveLength(0);
	});

	it("leaves the full need when units differ (unit-exact rule)", () => {
		const pantry = parsePantry(pantryText);
		const result = deduct([list("olive oil", 1, "c")], pantry); // pantry holds tbsp only
		expect(result.items).toHaveLength(1);
		expect(result.items[0].quantities).toEqual([{ value: 1, unit: "c" }]);
	});

	it("leaves items the pantry does not stock untouched", () => {
		const pantry = parsePantry(pantryText);
		const result = deduct([list("butter", 100, "g")], pantry);
		expect(result.items).toEqual([list("butter", 100, "g")]);
	});

	it("handles multi-quantity items quantity-by-quantity", () => {
		const pantry = parsePantry(pantryText);
		const item = { name: "olive oil", quantities: [{ value: 2, unit: "tbsp" }, { value: 1, unit: "c" }], aisle: "other", sources: ["x"] };
		const result = deduct([item], pantry);
		// tbsp need fully covered by 100 tbsp stock (pantry keeps 98 — not list's business);
		// the cup need has no tbsp-matching stock and survives unit-exact.
		expect(result.items[0].quantities).toEqual([{ value: 1, unit: "c" }]);
	});
});