import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseDigest } from "../../src/deals/digest";

const fixtureRoot = join(new URL("..", import.meta.url).pathname, "fixtures");
const digestText = () => readFileSync(join(fixtureRoot, "deals", "grocery-deals-2026-09-27.md"), "utf8");

describe("digest parsing (real week-2026-09-27 vault digest)", () => {
	it("finds the week and all store sections (Pat Central has no flyer this week)", () => {
		const digest = parseDigest(digestText());
		expect(digest.weekOf).toBe("2026-09-27");
		const stores = [...new Set(digest.deals.map((d) => d.store))];
		expect(stores).toContain("Fiesta Farms");
		expect(stores).toContain("Loblaws");
		expect(stores).toContain("Farm Boy");
		// Pat Central's section exists but contributes no deals this week.
		expect(stores).not.toContain("Pat Central");
	});

	it("keeps deal names, numeric prices, and store attribution", () => {
		const digest = parseDigest(digestText());
		const sprouts = digest.deals.find((d) => d.name === "BRUSSEL SPROUTS")!;
		expect(sprouts.store).toBe("Fiesta Farms");
		expect(sprouts.price).toBeCloseTo(2.99);
		expect(sprouts.suspicious).toBe(false);
	});

	it("flags OCR-suspicious prices instead of repeating them", () => {
		const digest = parseDigest(digestText());
		const ribs = digest.deals.find((d) => d.name === "PEL BONE IN SHORT RIBS")!;
		expect(ribs.price).toBeCloseTo(314.99);
		expect(ribs.suspicious).toBe(true); // digest skill's own rule: flag, don't repeat
	});

	it("tolerates the — price (null) on category banner rows", () => {
		const digest = parseDigest(digestText());
		const banner = digest.deals.find((d) => d.name === "REFINE YOUR LUNCHES")!;
		expect(banner.price).toBeNull();
		expect(banner.suspicious).toBe(false);
	});

	it("parses an empty digest without error", () => {
		const digest = parseDigest("# Grocery Deals — week of 2026-10-04\n");
		expect(digest.deals).toEqual([]);
		expect(digest.weekOf).toBe("2026-10-04");
	});
});