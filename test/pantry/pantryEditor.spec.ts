import { describe, expect, it } from "vitest";
import { pantrySet, pantryRemove } from "../../src/pantry/pantryEditor";

const SAMPLE = `# pantry stock — subtraction is unit-exact
[pantry]
"kosher salt" = "400%tsp"
"olive oil" = "100%tbsp"
# dairy lives in the fridge section
[fridge]
"milk" = { bought = "2026-09-25", expire = "2026-10-02", quantity = "2%l", low = "0.5%l" }
`;

describe("pantryEditor (R8: TOML read-modify-write preserving comments/order)", () => {
	it("adds a simple-form item to the last section without touching anything else", () => {
		const out = pantrySet(SAMPLE, "eggs", { value: 10, unit: null });
		expect(out).toContain('"eggs" = "10"');
		expect(out).toContain('"milk" = { bought = "2026-09-25"');
		expect(out.indexOf('"eggs" = "10"')).toBeGreaterThan(out.indexOf('[fridge]')); // appended to last section
		expect(out).toContain("# pantry stock — subtraction is unit-exact");
	});

	it("replaces an existing simple-form value in place", () => {
		const out = pantrySet(SAMPLE, "olive oil", { value: 120, unit: "tbsp" });
		expect(out).toContain('"olive oil" = "120%tbsp"');
		expect(out).not.toContain('"100%tbsp"');
		expect(out.split("\n").filter((l) => l.includes("olive oil")).length).toBe(1);
	});

	it("edits an object-form item's quantity without clobbering bought/expire/low (AE4)", () => {
		const out = pantrySet(SAMPLE, "milk", { value: 1.5, unit: "l" });
		expect(out).toContain('quantity = "1.5%l"');
		expect(out).toContain('bought = "2026-09-25"');
		expect(out).toContain('expire = "2026-10-02"');
		expect(out).toContain('low = "0.5%l"');
	});

	it("removes an item and leaves comments/sections intact", () => {
		const out = pantryRemove(SAMPLE, "kosher salt");
		expect(out).not.toContain("kosher salt");
		expect(out).toContain('"olive oil" = "100%tbsp"');
		expect(out).toContain("# dairy lives in the fridge section");
	});

	it("removal of a nonexistent item is a no-op", () => {
		expect(pantryRemove(SAMPLE, "tofu")).toBe(SAMPLE);
	});

	it("upserts a fresh [pantry] section when the file has none", () => {
		const out = pantrySet("# nothing yet\n", "flour", { value: 30, unit: "cups" });
		expect(out).toContain('[pantry]\n"flour" = "30%cups"');
	});
});
