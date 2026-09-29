import { describe, expect, it } from "vitest";
import { writeShoppingListFile, parseShoppingListFile } from "../../src/engine/shoppingListFile";

describe(".shopping-list file (KTD3: conventions format, rolling one-per-recipe-box)", () => {
	it("serializes menu refs with their scale braces", () => {
		const content = writeShoppingListFile([
			{ ref: "./cooking/All Allium Frittata", scale: { kind: "servings", n: 6 } },
			{ ref: "./cooking/Kokumaro curry", scale: { kind: "factor", n: 2 } },
			{ ref: "./cooking/Tomato soup", scale: null },
		]);
		expect(content).toBe(
			["./cooking/All Allium Frittata {6%servings}", "./cooking/Kokumaro curry {2}", "./cooking/Tomato soup", ""].join("\n")
		);
	});

	it("round-trips through the parser (official proposal-0016 shape)", () => {
		const refs = [
			{ ref: "./cooking/All Allium Frittata", scale: { kind: "servings", n: 6 } as const },
			{ ref: "./cooking/Kokumaro curry", scale: { kind: "factor", n: 2 } as const },
			{ ref: "./cooking/Tomato soup", scale: null },
		];
		const parsed = parseShoppingListFile(writeShoppingListFile(refs));
		expect(parsed.refs).toEqual(refs);
		expect(parsed.freehand).toEqual([]);
	});

	it("keeps -- comments and top-level free-hand items", () => {
		const parsed = parseShoppingListFile(
			["-- note", "./cooking/Kokumaro curry {2}", "coffee beans", ""].join("\n")
		);
		expect(parsed.comments).toEqual(["note"]);
		expect(parsed.refs.map((r) => r.ref)).toEqual(["./cooking/Kokumaro curry"]);
		expect(parsed.freehand).toEqual(["coffee beans"]);
	});
});