import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseMenu } from "../../src/engine/menu";
import { resolveMenu } from "../../src/engine/menu";
import { createParser } from "../../src/engine/parser";
import { MemoryReader, RecipeNotFoundError } from "../../src/engine/reader";
import type { MenuRef } from "../../src/engine/model";

const root = new URL("..", import.meta.url).pathname;
const fixture = (name: string) => readFileSync(join(root, "fixtures", name), "utf8");

const weekMenu = () => parseMenu(fixture("week-2026-09-28.menu.md"));

describe("menu parsing (real vault menu)", () => {
	it("finds the day sections and skips the overview table", () => {
		const menu = weekMenu();
		expect(menu.days.length).toBe(8);
		expect(menu.title).toBe("Week of 2026-09-28");
		expect(menu.days[0].label).toBe("Sunday");
		expect(menu.days[0].date).toBe("2026-09-27");
	});

	it("extracts recipe refs with both scale forms", () => {
		const menu = weekMenu();
		const sunday = menu.days[0];
		expect(sunday.refs.length).toBe(1);
		expect(sunday.refs[0].ref).toBe("./cooking/All Allium Frittata");
		expect(sunday.refs[0].scale).toEqual({ kind: "servings", n: 6 });

		const tuesday = menu.days[2];
		expect(tuesday.refs[0].ref).toBe("./cooking/Kokumaro curry");
		expect(tuesday.refs[0].scale).toEqual({ kind: "factor", n: 2 });
	});

	it("records comment-only days (takeout) without refs", () => {
		const menu = weekMenu();
		const monday = menu.days[1];
		expect(monday.refs.length).toBe(0);
		expect(monday.comments).toContain("takeout");
	});

	it("keeps trailing comment lines on cooking days", () => {
		const menu = weekMenu();
		const thursday = menu.days[4];
		expect(thursday.refs[0].ref).toBe("./cooking/Tomato soup");
		expect(thursday.comments.join(" ")).toContain("grilled cheese");
	});
});

describe("menu resolution (refs → scaled recipes)", () => {
	it("resolves a factor-scaled ref against the real recipe", async () => {
		const adapter = await createParser("wasm");
		const reader = new MemoryReader({
			"./cooking/Kokumaro curry.cook": fixture("Kokumaro curry.cook"),
		});
		const resolved = await resolveMenu(weekMenu(), reader, adapter);
		const tuesday = resolved.find((r) => r.day.label === "Tuesday")!;
		// {2} on an 8-serving recipe → factor 2 → oil 2 tbsp × 2 = 4 tbsp
		const oil = tuesday.recipe.ingredients.find((i) => i.name === "vegetable oil")!;
		expect(oil.quantity?.value).toBeCloseTo(4);
		expect(tuesday.factor).toBe(2);
	});

	it("resolves a servings-scaled ref via the recipe's servings metadata", async () => {
		const adapter = await createParser("wasm");
		const reader = new MemoryReader({
			"./cooking/Kokumaro curry.cook": fixture("Kokumaro curry.cook"),
		});
		const menu = parseMenu("== Test (2026-10-01) ==\n@./cooking/Kokumaro curry{4%servings}\n");
		const resolved = await resolveMenu(menu, reader, adapter);
		// {4%servings} on an 8-serving recipe → factor 0.5 → oil 2 tbsp × 0.5 = 1 tbsp
		const oil = resolved[0].recipe.ingredients.find((i) => i.name === "vegetable oil")!;
		expect(oil.quantity?.value).toBeCloseTo(1);
		expect(resolved[0].factor).toBeCloseTo(0.5);
	});

	it("surfaces missing refs as named errors and lists what parsed", async () => {
		const adapter = await createParser("wasm");
		const reader = new MemoryReader({
			"./cooking/Kokumaro curry.cook": fixture("Kokumaro curry.cook"),
		});
		const menu = parseMenu(
			"== Day 1 (2026-10-01) ==\n@./cooking/Kokumaro curry{1}\n\n== Day 2 (2026-10-02) ==\n@./cooking/Ghost dish{1}\n"
		);
		const errors: unknown[] = [];
		const resolved = await resolveMenu(menu, reader, adapter, { onError: (e) => errors.push(e) });
		expect(resolved.length).toBe(1); // partial-list behavior: what parsed still resolves
		expect(errors.length).toBe(1);
		expect(errors[0]).toBeInstanceOf(RecipeNotFoundError);
	});

	it("treats a bare ref (no braces) as factor 1", async () => {
		const adapter = await createParser("wasm");
		const reader = new MemoryReader({
			"./cooking/Kokumaro curry.cook": fixture("Kokumaro curry.cook"),
		});
		const menu = parseMenu("== Day 1 ==\n@./cooking/Kokumaro curry\n");
		const resolved = await resolveMenu(menu, reader, adapter);
		expect(resolved[0].factor).toBe(1);
		const ref: MenuRef = { ref: "./cooking/Kokumaro curry", scale: null };
		expect(ref.scale).toBeNull();
	});
});
