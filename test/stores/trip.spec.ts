import { describe, expect, it } from "vitest";
import { assignToStores } from "../../src/stores/trip";
import type { ListItem } from "../../src/engine/aggregate";
import type { Deal } from "../../src/deals/digest";

const item = (name: string): ListItem => ({ name, quantities: [{ value: 1, unit: null }], aisle: "", sources: [name] });
const deal = (store: string, name: string, price = 2.99): Deal => ({ store, name, price, suspicious: false });

const FIESTA = "Fiesta Farms";
const LOBLAWS = "Loblaws";

describe("trip assignment (R7: deal → deal store, rest → home, nothing unlisted)", () => {
	it("AE2: deal item flagged on its store's list; others ride home", () => {
		const items = [item("butter"), item("eggs"), item("milk")];
		const matches = new Map([["butter", deal(FIESTA, "BUTTER")]]);
		const lists = assignToStores(items, matches, [FIESTA, LOBLAWS], LOBLAWS);
		expect(lists.map((l) => l.store)).toEqual([FIESTA, LOBLAWS]);
		const fiesta = lists.find((l) => l.store === FIESTA)!;
		const loblaws = lists.find((l) => l.store === LOBLAWS)!;
		expect(fiesta.entries.map((e) => e.item.name)).toEqual(["butter"]);
		expect(fiesta.entries[0].deal).not.toBeNull();
		expect(fiesta.entries[0].flagged).toBe(true);
		expect(loblaws.entries.map((e) => e.item.name)).toEqual(["eggs", "milk"]);
	});

	it("a deal at an unpicked store rides the home list, unflagged", () => {
		const items = [item("butter"), item("eggs")];
		const matches = new Map([["butter", deal("Farm Boy", "BUTTER")]]); // Farm Boy off-trip
		const lists = assignToStores(items, matches, [LOBLAWS], LOBLAWS);
		const loblaws = lists.find((l) => l.store === LOBLAWS)!;
		const butter = loblaws.entries.find((e) => e.item.name === "butter")!;
		expect(butter.deal).toBeNull(); // unflagged — the deal isn't where you shop
		expect(loblaws.entries.map((e) => e.item.name)).toEqual(["butter", "eggs"]);
	});

	it("a store with no deals renders an ordinary list (deals annotate, not filter)", () => {
		const items = [item("eggs")];
		const lists = assignToStores(items, new Map(), [FIESTA, LOBLAWS], LOBLAWS);
		expect(lists.map((l) => l.store)).toEqual([FIESTA, LOBLAWS]);
		// No deals anywhere: everything rides home; the other picked store still renders (empty).
		const fiesta = lists.find((l) => l.store === FIESTA)!;
		const loblaws = lists.find((l) => l.store === LOBLAWS)!;
		expect(fiesta.entries).toEqual([]);
		expect(loblaws.entries.map((e) => e.item.name)).toEqual(["eggs"]);
		expect(loblaws.entries[0].flagged).toBe(false);
	});

	it("store matching is case-insensitive", () => {
		const items = [item("butter")];
		const matches = new Map([["butter", deal("fiesta farms", "BUTTER")]]);
		const lists = assignToStores(items, matches, ["Fiesta Farms"], "Fiesta Farms");
		expect(lists[0].entries[0].flagged).toBe(true);
	});
});