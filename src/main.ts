import { Plugin, Notice } from "obsidian";
import { CooklistSettings, DEFAULT_SETTINGS, CooklistSettingTab } from "./settings";
import { WorkbenchView, VIEW_TYPE_COOKLIST } from "./view";
import { createParser, type ParseAdapter } from "./engine/parser";
import { compactCheckedLog, appendTick, replayCheckedLog } from "./engine/checked";
import { aggregate } from "./engine/aggregate";
import { deduct, parsePantry } from "./engine/pantry";
import { parseAisle } from "./engine/aisle";
import { parseMenu, resolveMenu } from "./engine/menu";
import { writeShoppingListFile } from "./engine/shoppingListFile";
import { parseDigest } from "./deals/digest";
import { matchDeals, buildSynonymCanon } from "./deals/match";
import { assignToStores, type StoreList } from "./stores/trip";
import { VaultReader } from "./vaultReader";

export default class CooklistPlugin extends Plugin {
	settings!: CooklistSettings;
	/** Parser adapter (KTD1) — created at load, WASM primary with TS fallback. */
	parser: ParseAdapter | null = null;
	/** Names on the currently generated list; tick compaction reconciles against these. */
	activeTripListNames: string[] = [];
	/** Per-store lists for the active trip (U5); empty until a trip starts. */
	storeLists: StoreList[] = [];

	async onload() {
		await this.loadSettings();

		this.parser = await createParser().catch((err) => {
			console.error("cooklist: parser init failed", err);
			return null;
		});

		this.registerView(VIEW_TYPE_COOKLIST, (leaf) => new WorkbenchView(leaf, this));

		this.addRibbonIcon("shopping-basket", "Open shopping workbench", () => {
			this.activateView();
		});

		this.addCommand({
			id: "open-workbench",
			name: "Open shopping workbench",
			callback: () => this.activateView(),
		});

		this.addSettingTab(new CooklistSettingTab(this.app, this));
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE_COOKLIST)[0];
		if (!leaf) {
			const right = workspace.getRightLeaf(false);
			if (!right) throw new Error("Cooklist: could not open a leaf for the workbench");
			leaf = right;
			await leaf.setViewState({ type: VIEW_TYPE_COOKLIST, active: true });
		}
		await workspace.revealLeaf(leaf);
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	private get boxPath(): string {
		return this.settings.recipeBoxPath.replace(/\/$/, "");
	}

	/** Start a trip: generate the combined list, deal-match, and split per store (R5-R7, R13). */
	async startTrip(menuPath: string, pickedStores: string[], homeStore: string): Promise<void> {
		if (!this.parser) {
			new Notice("Cooklist: parser unavailable — reload the plugin.");
			return;
		}
		if (pickedStores.length === 0) {
			new Notice("Cooklist: pick at least one store.");
			return;
		}
		if (!pickedStores.includes(homeStore)) homeStore = pickedStores[0];

		this.settings.lastMenuPath = menuPath;
		this.settings.lastStores = pickedStores;
		this.settings.homeStore = homeStore;
		await this.saveSettings();

		const reader = new VaultReader(this.app.vault.adapter, this.boxPath);
		let menu;
		try {
			menu = parseMenu(await reader.read(menuPath));
		} catch {
			new Notice(`Cooklist: could not read menu ${menuPath}`);
			return;
		}

		const missing: string[] = [];
		const resolved = await resolveMenu(menu, reader, this.parser, { onError: (err) => missing.push(err instanceof Error ? err.message : String(err)) });
		if (missing.length > 0) new Notice(`Cooklist: ${missing.length} recipe(s) missing — trip lists what parsed`);

		let items = aggregate(resolved);
		try {
			const pantry = parsePantry(await reader.read("config/pantry.conf"));
			items = deduct(items, pantry).items;
		} catch {
			// No pantry conf — the full need stays on the list.
		}

		const matches = await this.dealMatches(items);
		this.storeLists = assignToStores(items, matches, pickedStores, homeStore);
		this.activeTripListNames = items.map((i) => i.name);

		// Rolling trip file (KTD3): one .shopping-list per recipe-box, per proposal-0016.
		await this.app.vault.adapter.write(`${this.boxPath}/.shopping-list`, writeShoppingListFile(resolved.map((r) => r.ref)));

		new Notice(`Cooklist: trip ready — ${items.length} items across ${pickedStores.length} store(s)`);
	}

	/** Deal matches against the most recent digest within the past week; none if missing (R13). */
	private async dealMatches(items: Parameters<typeof matchDeals>[0]): Promise<Map<string, import("./deals/digest").Deal>> {
		try {
			const digestText = await this.latestDigestText();
			if (!digestText) return new Map();
			let synonyms: Map<string, string> | undefined;
			try {
				synonyms = buildSynonymCanon(await this.app.vault.adapter.read(`${this.boxPath}/config/aisle.conf`));
			} catch {
				// No aisle conf — exact-phrase matching only.
			}
			return matchDeals(items, parseDigest(digestText), synonyms);
		} catch {
			return new Map(); // missing/broken digest degrades to unflagged lists, never an error
		}
	}

	/** Most recent grocery-deals digest within the past 7 days, or null (R13: vault only). */
	private async latestDigestText(): Promise<string | null> {
		for (let daysAgo = 0; daysAgo < 7; daysAgo++) {
			const date = new Date(Date.now() - daysAgo * 86400000);
			const yyyy = date.getFullYear();
			const mm = String(date.getMonth() + 1).padStart(2, "0");
			const dd = String(date.getDate()).padStart(2, "0");
			const path = `daily/${yyyy}/${mm}/${dd}/grocery-deals.md`;
			try {
				return await this.app.vault.adapter.read(path);
			} catch {
				// try the previous day
			}
		}
		return null;
	}

	/** Tick state for the current list, from the append log (missing file = nothing ticked). */
	async getTickState(): Promise<Set<string>> {
		try {
			return replayCheckedLog(await this.app.vault.adapter.read(`${this.boxPath}/.shopping-checked`));
		} catch {
			return new Set();
		}
	}

	/** Append a tick/untick entry (append-only log, KTD3). */
	async toggleTick(name: string, checked: boolean): Promise<void> {
		const path = `${this.boxPath}/.shopping-checked`;
		let log = "";
		try {
			log = await this.app.vault.adapter.read(path);
		} catch {
			// first tick of the trip
		}
		await this.app.vault.adapter.write(path, appendTick(log, name, checked));
	}

	/**
	 * Explicit "Complete trip" action (U4): compacts the tick log against the current list,
	 * clears the active trip, and returns the workbench to trip setup. Nothing compacts
	 * automatically; a no-op when no trip is active.
	 */
	async completeActiveTrip(): Promise<void> {
		if (!this.settings.lastMenuPath) return;
		const checkedPath = `${this.settings.recipeBoxPath}/.shopping-checked`;
		try {
			const log = await this.app.vault.adapter.read(checkedPath);
			await this.app.vault.adapter.write(checkedPath, compactCheckedLog(log, this.activeTripListNames));
		} catch {
			// No tick log — completing a trip without ticks just resets the trip.
		}
		this.activeTripListNames = [];
		this.settings.lastMenuPath = "";
		await this.saveSettings();
	}
}