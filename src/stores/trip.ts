/**
 * Trip assignment (R7, U5): a deal item lands on its deal store's list, flagged; non-deal
 * items ride with the home store; a deal at an unpicked store rides the home list unflagged
 * (the deal isn't where you shop). Nothing goes unlisted. Store names compare
 * case-insensitively.
 */
import type { ListItem } from "../engine/aggregate";
import type { Deal } from "../deals/digest";

export interface StoreListEntry {
	item: ListItem;
	deal: Deal | null;
	flagged: boolean;
}

export interface StoreList {
	store: string;
	entries: StoreListEntry[];
}

export function assignToStores(
	items: readonly ListItem[],
	matches: ReadonlyMap<string, Deal>,
	pickedStores: readonly string[],
	homeStore: string
): StoreList[] {
	const lists = pickedStores.map((store) => ({ store, entries: [] as StoreListEntry[] }));
	const lower = (s: string) => s.trim().toLowerCase();
	const byStore = new Map(lists.map((l) => [lower(l.store), l]));
	const home = byStore.get(lower(homeStore)) ?? lists[0];

	for (const item of items) {
		const deal = matches.get(lower(item.name)) ?? null;
		let target = home;
		let flagged = false;
		if (deal) {
			const dealList = byStore.get(lower(deal.store));
			if (dealList) {
				target = dealList;
				flagged = true;
			}
			// else: deal at an unpicked store — rides home unflagged
		}
		target.entries.push({ item, deal: flagged ? deal : null, flagged });
	}
	return lists;
}