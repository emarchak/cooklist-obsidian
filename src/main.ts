import { Plugin } from "obsidian";
import { CooklistSettings, DEFAULT_SETTINGS, CooklistSettingTab } from "./settings";
import { WorkbenchView, VIEW_TYPE_COOKLIST } from "./view";
import { createParser, type ParseAdapter } from "./engine/parser";

export default class CooklistPlugin extends Plugin {
	settings!: CooklistSettings;
	/** Parser adapter (KTD1) — created at load, WASM primary with TS fallback. */
	parser: ParseAdapter | null = null;

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
}