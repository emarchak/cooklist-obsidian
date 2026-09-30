import { describe, expect, it } from "vitest";
import { aisleAssign } from "../../src/pantry/aisleEditor";

const SAMPLE = `# order matters — display order
[produce]
carrot
scallion|green onion

[dairy & eggs]
butter
`;

describe("aisleEditor (R9: append without reordering)", () => {
	it("appends a new ingredient at the END of the named section", () => {
		const out = aisleAssign(SAMPLE, "produce", "tofu");
		const produceBlock = out.split("[dairy")[0];
		expect(produceBlock).toContain("tofu");
		expect(produceBlock.indexOf("tofu")).toBeGreaterThan(produceBlock.indexOf("scallion"));
		expect(produceBlock.indexOf("tofu")).toBeLessThan(produceBlock.length); // still within produce
	});

	it("creates a new section at the end for an unknown aisle", () => {
		const out = aisleAssign(SAMPLE, "fruit", "mango");
		expect(out).toContain("[fruit]\nmango");
		expect(out.indexOf("[fruit]")).toBeGreaterThan(out.indexOf("[dairy"));
	});

	it("is idempotent — assigning an already-listed ingredient changes nothing", () => {
		expect(aisleAssign(SAMPLE, "produce", "carrot")).toBe(SAMPLE);
	});
});
