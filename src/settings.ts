import { App, PluginSettingTab, Setting } from "obsidian";
import type CooklistPlugin from "./main";

export interface CooklistSettings {
	/** Vault-relative path to the recipe box (holds config/aisle.conf, config/pantry.conf). */
	recipeBoxPath: string;
	/** Store names, matching the grocery-deals digest's per-store headings. */
	stores: string[];
	/** Non-deal items ride with this store's list. */
	homeStore: string;
	/** Vault-relative path of the menu used for the most recent trip. */
	lastMenuPath: string;
}

export const DEFAULT_SETTINGS: CooklistSettings = {
	recipeBoxPath: "recipe-box",
	stores: ["Fiesta Farms", "Loblaws", "Farm Boy", "Pat Central"],
	homeStore: "",
	lastMenuPath: "",
};

export class CooklistSettingTab extends PluginSettingTab {
	plugin: CooklistPlugin;

	constructor(app: App, plugin: CooklistPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Recipe box path")
			.setDesc("Vault-relative path to the recipe box — the directory holding config/aisle.conf and config/pantry.conf.")
			.addText((text) =>
				text.setValue(this.plugin.settings.recipeBoxPath).onChange(async (value) => {
					this.plugin.settings.recipeBoxPath = value.trim();
					await this.plugin.saveData(this.plugin.settings);
				})
			);

		new Setting(containerEl)
			.setName("Stores")
			.setDesc("Comma-separated store names, matching the weekly grocery-deals digest headings.")
			.addText((text) =>
				text.setValue(this.plugin.settings.stores.join(", ")).onChange(async (value) => {
					this.plugin.settings.stores = value.split(",").map((s) => s.trim()).filter(Boolean);
					await this.plugin.saveData(this.plugin.settings);
				})
			);

		new Setting(containerEl)
			.setName("Home store")
			.setDesc("Non-deal items ride with this store's list; a deal at an off-trip store rides home too.")
			.addDropdown((dropdown) => {
				for (const store of this.plugin.settings.stores) {
					dropdown.addOption(store, store);
				}
				dropdown.setValue(this.plugin.settings.homeStore).onChange(async (value) => {
					this.plugin.settings.homeStore = value;
					await this.plugin.saveData(this.plugin.settings);
				});
			});
	}
}