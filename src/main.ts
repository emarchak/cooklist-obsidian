import { Plugin } from "obsidian";
import { CooklistSettings, DEFAULT_SETTINGS, CooklistSettingTab } from "./settings";
import { WorkbenchView, VIEW_TYPE_COOKLIST } from "./view";
import { createParser, type ParseAdapter } from "./engine/parser";
import { compactCheckedLog } from "./engine/checked";

export default class CooklistPlugin extends Plugin {
	settings!: CooklistSettings;
	/** Parser adapter (KTD1) — created at load, WASM primary with TS fallback. */
	parser: ParseAdapter | null = null;
	/** Names on the currently generated list; tick compaction reconciles against these. */
	activeTripListNames: string[] = [];

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