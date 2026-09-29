import { describe, expect, it } from "vitest";
import { appendTick, isChecked, compactCheckedLog, replayCheckedLog, readCheckedLog } from "../../src/engine/checked";

describe(".shopping-checked tick log (KTD3: append-only, last-entry-wins, case-insensitive, global)", () => {
	it("ticks and unticks via append entries", () => {
		let log = "";
		log = appendTick(log, "butter", true);
		log = appendTick(log, "eggs", true);
		log = appendTick(log, "butter", false); // untick
		expect(replayCheckedLog(log)).toEqual(new Set(["eggs"]));
		expect(isChecked(log, "eggs")).toBe(true);
		expect(isChecked(log, "butter")).toBe(false);
	});

	it("last entry wins across repeated appends", () => {
		const log = ["+ butter", "- butter", "+ butter"].join("\n");
		expect(isChecked(log, "butter")).toBe(true);
	});

	it("matches case-insensitively: + Butter ticks butter", () => {
		const log = "+ Butter\n";
		expect(isChecked(log, "butter")).toBe(true);
	});

	it("matches globally: + salt ticks every salt on the list", () => {
		const log = "+ salt\n";
		expect(isChecked(log, "salt")).toBe(true);
		expect(isChecked(log, "kosher salt")).toBe(false); // global match is whole-name
	});

	it("reads existing log files (VaultFileReader-compatible string)", () => {
		expect(readCheckedLog("+ butter\n- eggs\n")).toEqual(new Set(["butter"]));
	});
});

describe("compaction (explicit 'Complete trip' action — nothing compacts automatically)", () => {
	it("rewrites to one + line per checked item still on the list", () => {
		const log = ["+ butter", "+ eggs", "- butter", "+ ghost item"].join("\n");
		const compacted = compactCheckedLog(log, ["eggs", "milk"]);
		expect(compacted).toBe("+ eggs\n");
	});

	it("keeps the list's original casing", () => {
		const compacted = compactCheckedLog("+ Butter\n", ["butter"]);
		expect(compacted).toBe("+ butter\n");
	});

	it("is idempotent on replay", () => {
		const log = ["+ butter", "+ eggs", "- butter"].join("\n");
		const once = compactCheckedLog(log, ["eggs", "milk"]);
		const twice = compactCheckedLog(once, ["eggs", "milk"]);
		expect(twice).toBe(once);
	});

	it("stale entries (not on the current list) are pruned", () => {
		const log = "+ last week's milk\n";
		expect(compactCheckedLog(log, ["eggs"])).toBe("");
	});
});