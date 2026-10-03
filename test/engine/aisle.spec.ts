import { describe, expect, it } from "vitest";
import { groupByAisle, parseAisle } from "../../src/engine/aisle";

const aisleText = `[produce]
onion
garlic

[dairy & eggs]
butter
eggs

[pantry]
olive oil
`;

describe("parseAisle (vault aisle.conf shape)", () => {
	it("preserves section order", () => {
		expect(parseAisle(aisleText).order).toEqual(["produce", "dairy & eggs", "pantry"]);
	});

	it("maps names and synonym pipes to their section", () => {
		const aisle = parseAisle(`[produce]\nonion\nscallion|green onion\n`);
		expect(aisle.sectionOf("onion")).toBe("produce");
		expect(aisle.sectionOf("green onion")).toBe("produce");
		expect(aisle.sectionOf("mango")).toBeNull();
	});
});

describe("groupByAisle", () => {
	const item = (name: string) => ({ name, quantities: [{ value: 1, unit: null }], aisle: "", sources: [name] });

	it("groups in aisle.conf order with `other` last", () => {
		const sections = groupByAisle([item("mango"), item("butter"), item("onion")], parseAisle(aisleText));
		expect(sections.map((s) => s.name)).toEqual(["produce", "dairy & eggs", "other"]);
		expect(sections[0].items.map((i) => i.name)).toEqual(["onion"]);
		expect(sections[2].items.map((i) => i.name)).toEqual(["mango"]);
	});

	it("omits empty sections", () => {
		const sections = groupByAisle([item("butter")], parseAisle(aisleText));
		expect(sections.map((s) => s.name)).toEqual(["dairy & eggs"]);
	});

	it("matches case-insensitively", () => {
		const sections = groupByAisle([item("Onion")], parseAisle(aisleText));
		expect(sections[0].name).toBe("produce");
		expect(sections[0].items[0].name).toBe("Onion"); // original casing preserved in output
	});
});