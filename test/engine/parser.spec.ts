import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createParser } from "../../src/engine/parser";
import type { ParseAdapter } from "../../src/engine/parser";

const fixture = (name: string) => readFileSync(join(new URL("..", import.meta.url).pathname, "fixtures", name), "utf8");

const kokumaro = () => fixture("Kokumaro curry.cook");
const tomatoSoup = () => fixture("Tomato soup.cook");

async function eachAdapter(run: (adapter: ParseAdapter) => Promise<void>) {
	// Primary path: WASM (@cooklang/cooklang, same engine family as the CLI).
	// Fallback path: force the TS adapter so parity is verified even where WASM works.
	const wasm = await createParser("wasm");
	const ts = await createParser("ts");
	await run(wasm);
	await run(ts);
}

function qtyOf(recipe: ReturnType<ParseAdapter["parse"]>, name: string) {
	return recipe.ingredients.find((i) => i.name === name)?.quantity ?? null;
}

describe("parser adapters (KTD1)", () => {
	it("parses a real vault recipe with quantities and units", async () => {
		await eachAdapter(async (adapter) => {
			const recipe = adapter.parse(kokumaro(), 1);
			const oil = qtyOf(recipe, "vegetable oil");
			expect(oil).not.toBeNull();
			expect(oil?.value).toBeCloseTo(2);
			expect(oil?.unit).toBe("tbsp");
		});
	});

	it("scales quantities by factor and leaves fixed quantities alone", async () => {
		const src = "@salt{=1%tsp}\n\nAdd @flour{200%g}.\n";
		await eachAdapter(async (adapter) => {
			const base = adapter.parse(src, 1);
			const doubled = adapter.parse(src, 2);
			expect(qtyOf(base, "flour")?.value).toBeCloseTo(200);
			expect(qtyOf(doubled, "flour")?.value).toBeCloseTo(400);
			// Fixed quantities locked with `=` never scale (official conventions).
			expect(qtyOf(doubled, "salt")?.value).toBeCloseTo(1);
		});
	});

	it("reads servings metadata from a real recipe", async () => {
		await eachAdapter(async (adapter) => {
			const recipe = adapter.parse(kokumaro(), 1);
			expect(recipe.metadata["servings"]).toBe("8");
		});
	});

	it("keeps fractional quantities exact", async () => {
		// Values agree across adapters; unit aliasing differs — the WASM engine normalizes
		// "cups" → "c", the TS lib keeps the raw unit. U3 must canonicalize units before
		// merging (the cookcli JSON oracle defines the canonical forms).
		const wasm = await createParser("wasm");
		expect(qtyOf(wasm.parse(kokumaro(), 1), "water")?.value).toBeCloseTo(4.2);
		expect(qtyOf(wasm.parse(kokumaro(), 1), "water")?.unit).toBe("c");
		const ts = await createParser("ts");
		expect(qtyOf(ts.parse(kokumaro(), 1), "water")?.value).toBeCloseTo(4.2);
		expect(qtyOf(ts.parse(kokumaro(), 1), "water")?.unit).toBe("cups");
	});

	it("ignores timers and cookware as ingredients", async () => {
		await eachAdapter(async (adapter) => {
			const recipe = adapter.parse(kokumaro(), 1);
			const names = recipe.ingredients.map((i) => i.name.toLowerCase());
			expect(names).not.toContain("15");
			expect(names).not.toContain("pot");
		});
	});
});

describe("tomato soup fixture sanity (menu cross-reference)", () => {
	it("parses and carries servings metadata", async () => {
		const adapter = await createParser("wasm");
		const recipe = adapter.parse(tomatoSoup(), 1);
		expect(recipe.ingredients.length).toBeGreaterThan(0);
		expect(recipe.metadata["servings"]).toBeDefined();
	});
});