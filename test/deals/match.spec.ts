import { describe, expect, it } from "vitest";
import { parseDigest } from "../../src/deals/digest";
import { matchDeals, buildSynonymCanon } from "../../src/deals/match";
import type { ListItem } from "../../src/engine/aggregate";

const fixtureRoot = new URL("..", import.meta.url).pathname;
const digestText = await import("node:fs").then((fs) => fs.readFileSync(fixtureRoot + "fixtures/deals/grocery-deals-2026-09-27.md", "utf8"));
const digest = parseDigest(digestText);

const item = (name: string): ListItem => ({ name, quantities: [{ value: 1, unit: null }], aisle: "", sources: [name] });

const synonyms = buildSynonymCanon("[produce]\nscallion|green onion\n");

describe("deal matching (KTD4: conservative full-phrase + synonyms)", () => {
	it("matches a clean case-insensitive full phrase (BRUSSEL SPROUTS ↔ brussels sprouts)", () => {
		const matches = matchDeals([item("brussels sprouts")], digest);
		expect(matches.get("brussels sprouts")?.store).toBe("Fiesta Farms");
	});

	it("matches brand-prefixed flyer rows only on exact phrase — generic stays generic", () => {
		// "SMITHVILLE BONELESS SKINLESS CHICKEN THIGHS" must NOT light up plain chicken thighs
		const matches = matchDeals([item("chicken thighs")], digest);
		expect(matches.has("chicken thighs")).toBe(false);
	});

	it("does not match size-suffixed flyer names (SOYKEI ORGANIC TOFU, 400 G)", () => {
		const matches = matchDeals([item("tofu")], digest);
		expect(matches.has("tofu")).toBe(false);
	});

	it("matches a plain row when the flyer name equals the ingredient (ONIONS)", () => {
		const matches = matchDeals([item("onions")], digest);
		expect(matches.get("onions")?.price).toBeCloseTo(1.99);
	});

	it("matches through aisle synonyms (GREEN ONION ↔ scallion)", () => {
		const d = parseDigest(["## Fiesta Farms", "| Deal | Price |", "| --- | --- |", "| GREEN ONIONS | $1.49 |"].join("\n"));
		const matches = matchDeals([item("scallion")], d, synonyms);
		expect(matches.get("scallion")?.price).toBeCloseTo(1.49);
	});

	it("keeps suspicious-priced deals matchable but flagged", () => {
		const d = parseDigest(["## Fiesta Farms", "| Deal | Price |", "| --- | --- |", "| SHORT RIBS | $314.99 |"].join("\n"));
		const matches = matchDeals([item("short ribs")], d);
		expect(matches.get("short ribs")?.suspicious).toBe(true);
	});

	it("prefers the cheapest among duplicate deals for one item", () => {
		const d = parseDigest(
			["## Fiesta Farms", "| Deal | Price |", "| --- | --- |", "| BUTTER | $5.99 |", "", "## Loblaws", "| Deal | Price |", "| --- | --- |", "| BUTTER | $4.99 |"].join("\n")
		);
		const matches = matchDeals([item("butter")], d);
		expect(matches.get("butter")?.store).toBe("Loblaws");
	});

	it("returns no matches for an empty digest (missing week degrades silently)", () => {
		const matches = matchDeals([item("butter")], parseDigest("# Grocery Deals\n"));
		expect(matches.size).toBe(0);
	});
});