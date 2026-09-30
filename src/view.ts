import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type CooklistPlugin from "./main";
import type { StoreList, StoreListEntry } from "./stores/trip";
import { pantrySet, pantryRemove } from "./pantry/pantryEditor";
import { aisleAssign } from "./pantry/aisleEditor";

export const VIEW_TYPE_COOKLIST = "cooklist-workbench";

type Surface = "trip" | "list" | "pantry";

const SURFACES: Surface[] = ["trip", "list", "pantry"];

export class WorkbenchView extends ItemView {
	plugin: CooklistPlugin;
	private surface: Surface = "trip";
	/** Local trip-setup state (persisted to settings on start). */
	private pickedStores: Set<string> = new Set();
	private homeStore = "";

	constructor(leaf: WorkspaceLeaf, plugin: CooklistPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_COOKLIST;
	}

	getDisplayText(): string {
		return "Shopping workbench";
	}

	getIcon(): string {
		return "shopping-basket";
	}

	async onOpen(): Promise<void> {
		if (this.plugin.settings.lastMenuPath) {
			this.pickedStores = new Set(this.plugin.settings.lastStores.length > 0 ? this.plugin.settings.lastStores : this.plugin.settings.stores);
			this.homeStore = this.plugin.settings.homeStore || [...this.pickedStores][0] || "";
		}
		this.renderShell();
	}

	async onClose(): Promise<void> {
		// Nothing to release; state lives on the plugin (settings + store lists).
	}

	private renderShell(): void {
		const el = this.contentEl;
		el.empty();
		el.addClass("cooklist-workbench");

		const nav = el.createDiv({ cls: "cooklist-nav" });
		for (const surface of SURFACES) {
			const button = nav.createEl("button", {
				text: surface.charAt(0).toUpperCase() + surface.slice(1),
				cls: "cooklist-nav-button" + (surface === this.surface ? " is-active" : ""),
			});
			button.addEventListener("click", () => {
				this.surface = surface;
				this.renderShell();
			});
		}

		const body = el.createDiv({ cls: "cooklist-body" });
		const surfaceEl = body.createDiv({ cls: "cooklist-surface cooklist-surface-" + this.surface });
		if (this.surface === "trip") {
			this.renderTripSurface(surfaceEl);
		} else if (this.surface === "list") {
			void this.renderListSurface(surfaceEl);
		} else {
			void this.renderPantrySurface(surfaceEl);
		}
	}

	// --- Trip setup (F1) ---------------------------------------------------------

	private renderTripSurface(container: HTMLElement): void {
		if (this.plugin.settings.lastMenuPath) {
			container.createDiv({
				cls: "cooklist-empty",
				text: `Trip in progress (${this.plugin.settings.lastStores.join(", ")}). Open the List tab, or complete the trip there to set up a new one.`,
			});
			return;
		}

		const stores = this.pickedStores.size > 0 ? this.pickedStores : new Set(this.plugin.settings.lastStores.length > 0 ? this.plugin.settings.lastStores : this.plugin.settings.stores);

		const menuWrap = container.createDiv({ cls: "cooklist-field" });
		menuWrap.createEl("label", { text: "Menu (vault path, e.g. recipe-box/week-2026-09-28.menu.md)" });
		const menuInput = menuWrap.createEl("input", { type: "text", cls: "cooklist-input" }) as HTMLInputElement;
		menuInput.value = this.plugin.settings.lastMenuPath || "recipe-box/week-2026-09-28.menu.md";
		menuInput.placeholder = "recipe-box/<menu>.menu.md";

		const storesWrap = container.createDiv({ cls: "cooklist-field" });
		storesWrap.createEl("label", { text: "Stores you're hitting" });
		for (const store of this.plugin.settings.stores) {
			const row = storesWrap.createDiv({ cls: "cooklist-store-row" });
			const checkbox = row.createEl("input", { type: "checkbox" }) as HTMLInputElement;
			checkbox.checked = stores.has(store);
			checkbox.addEventListener("change", () => {
				if (checkbox.checked) this.pickedStores.add(store);
				else this.pickedStores.delete(store);
				if (!this.pickedStores.has(this.homeStore)) this.homeStore = [...this.pickedStores][0] ?? "";
				this.renderShell();
			});
			row.createEl("span", { text: store });
			const homeRadio = row.createEl("input", { type: "radio", attr: { name: "cooklist-home" } }) as HTMLInputElement;
			homeRadio.checked = this.homeStore === store;
			homeRadio.addEventListener("change", () => {
				if (homeRadio.checked) {
					this.homeStore = store;
					this.renderShell();
				}
			});
			row.createEl("span", { text: "home", cls: "cooklist-home-label" });
		}

		const start = container.createEl("button", { text: "Start trip", cls: "cooklist-start-trip" });
		start.addEventListener("click", async () => {
			const menuPath = menuInput.value.trim();
			if (!menuPath) {
				new Notice("Cooklist: enter a menu path first.");
				return;
			}
			await this.plugin.startTrip(menuPath, [...this.pickedStores], this.homeStore);
			this.surface = "list";
			this.renderShell();
		});
	}

	// --- Per-store lists (F1/F2) ---------------------------------------------------

	private async renderListSurface(container: HTMLElement): Promise<void> {
		const lists: StoreList[] = this.plugin.storeLists;
		if (!this.plugin.settings.lastMenuPath) {
			container.createDiv({ cls: "cooklist-empty", text: "No active trip — set one up in the Trip tab." });
			return;
		}
		if (lists.length === 0) {
			container.createDiv({ cls: "cooklist-empty", text: "Generating…" });
			return;
		}

		const ticked = await this.plugin.getTickState();
		for (const list of lists) {
			const storeEl = container.createDiv({ cls: "cooklist-store" });
			storeEl.createEl("h3", { text: list.store, cls: "cooklist-store-name" });
			if (list.entries.length === 0) {
				storeEl.createDiv({ cls: "cooklist-empty", text: "Nothing for this store." });
				continue;
			}
			for (const entry of list.entries) {
				this.renderEntry(storeEl, entry, ticked.has(entry.item.name.toLowerCase()));
			}
		}

		const complete = container.createEl("button", { text: "Complete trip", cls: "cooklist-complete-trip" });
		complete.addEventListener("click", async () => {
			await this.plugin.completeActiveTrip();
			this.surface = "trip";
			this.renderShell();
		});
	}

	private renderEntry(storeEl: HTMLElement, entry: StoreListEntry, ticked: boolean): void {
		const row = storeEl.createDiv({ cls: "cooklist-item" + (ticked ? " is-ticked" : "") });
		const checkbox = row.createEl("input", { type: "checkbox" }) as HTMLInputElement;
		checkbox.checked = ticked;
		checkbox.addEventListener("change", async () => {
			await this.plugin.toggleTick(entry.item.name, checkbox.checked);
			row.toggleClass("is-ticked", checkbox.checked);
		});

		const name = row.createDiv({ cls: "cooklist-item-name" });
		name.createEl("span", { text: entry.item.name });
		const qtyText = entry.item.quantities.map((q) => (q.unit ? `${fmt(q.value)} ${q.unit}` : fmt(q.value))).join(" + ");
		if (qtyText) row.createDiv({ cls: "cooklist-item-qty", text: qtyText });

		if (entry.deal) {
			const badge = row.createDiv({ cls: "cooklist-deal" });
			badge.createEl("span", { text: entry.deal.store, cls: "cooklist-deal-store" });
			if (entry.deal.suspicious) badge.createEl("span", { text: "price looks wrong — check flyer", cls: "cooklist-deal-suspect" });
			else if (entry.deal.price !== null) badge.createEl("span", { text: `$${entry.deal.price.toFixed(2)}`, cls: "cooklist-deal-price" });
		}
	}


	// --- Pantry surface (U6, F3) ---------------------------------------------------

	private async renderPantrySurface(container: HTMLElement): Promise<void> {
		const boxPath = this.plugin.settings.recipeBoxPath.replace(/\/$/, "");
		let text: string;
		try {
			text = await this.app.vault.adapter.read(`${boxPath}/config/pantry.conf`);
		} catch {
			container.createDiv({ cls: "cooklist-empty", text: "No config/pantry.conf yet — add something below to create it." });
			text = "";
		}

		const sections = parsePantrySections(text);
		for (const section of sections) {
			sectionEl(container, section);
		}

		const addWrap = container.createDiv({ cls: "cooklist-pantry-add" });
		const nameInput = addWrap.createEl("input", { type: "text", placeholder: "Ingredient", cls: "cooklist-input cooklist-input-inline" }) as HTMLInputElement;
		const qtyInput = addWrap.createEl("input", { type: "text", placeholder: "10 or 10%tsp", cls: "cooklist-input cooklist-input-inline" }) as HTMLInputElement;
		const aisleInput = addWrap.createEl("input", { type: "text", placeholder: "Aisle (e.g. produce)", cls: "cooklist-input cooklist-input-inline" }) as HTMLInputElement;
		container.addEventListener("click", async (ev) => {
			const target = ev.target as HTMLElement;
			if (!target.classList.contains("cooklist-remove-item")) return;
			const name = target.getAttribute("data-name") ?? "";
			const next = pantryRemove(text, name);
			await this.app.vault.adapter.write(`${boxPath}/config/pantry.conf`, next);
			// Removal is explicit, not automatic — no orphan aisle.conf cleanup (R9 note).
			this.renderShell();
		});

		const addBtn = addWrap.createEl("button", { text: "Add", cls: "cooklist-add-item" });
		addBtn.addEventListener("click", async () => {
			const name = nameInput.value.trim();
			const qty = qtyInput.value.trim();
			const aisle = aisleInput.value.trim();
			if (!name || !qty) {
				new Notice("Cooklist: name and quantity required.");
				return;
			}
			const entry = parseQty(qty);
			const next = pantrySet(text, name, entry);
			await this.app.vault.adapter.write(`${boxPath}/config/pantry.conf`, next);
			if (aisle) {
				let aisleText = "";
				try {
					aisleText = await this.app.vault.adapter.read(`${boxPath}/config/aisle.conf`);
				} catch {
					// no conf yet
				}
				await this.app.vault.adapter.write(`${boxPath}/config/aisle.conf`, aisleAssign(aisleText, aisle, name));
			}
			this.renderShell();
		});
	}

}

export interface PantryEntryRaw {
	name: string;
	section: string;
	quantity: string | null;
	bought: string | null;
	expire: string | null;
	low: string | null;
	objectForm: boolean;
}

export interface PantrySection {
	name: string;
	entries: PantryEntryRaw[];
}

function parsePantrySections(text: string): PantrySection[] {
	const sections: PantrySection[] = [];
	let current: PantrySection | null = null;
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		const header = /^\[(.+)\]$/.exec(line);
		if (header) {
			current = { name: header[1], entries: [] };
			sections.push(current);
			continue;
		}
		if (!current || !line || line.startsWith("#")) continue;
		const entryMatch = /^"(.+?)"\s*=\s*(.+?)\s*$/.exec(line);
		if (!entryMatch) continue;
		const [, name, value] = entryMatch;
		if (value.startsWith("{")) {
			const pick = (key: string) => new RegExp(`${key}\\s*=\\s*"([^"]*)"`).exec(value)?.[1] ?? null;
			current.entries.push({ name, section: current.name, quantity: pick("quantity"), bought: pick("bought"), expire: pick("expire"), low: pick("low"), objectForm: true });
		} else {
			current.entries.push({ name, section: current.name, quantity: value.replace(/^"|"$/g, ""), bought: null, expire: null, low: null, objectForm: false });
		}
	}
	return sections;
}

function sectionEl(container: HTMLElement, section: PantrySection): void {
	const el = container.createDiv({ cls: "cooklist-pantry-section" });
	el.createEl("h3", { text: section.name, cls: "cooklist-store-name" });
	for (const entry of section.entries) {
		const row = el.createDiv({ cls: "cooklist-item cooklist-pantry-row" });
		row.createDiv({ cls: "cooklist-item-name", text: entry.name });
		const meta: string[] = [];
		if (entry.quantity) meta.push(entry.quantity);
		if (entry.low) meta.push(`low ${entry.low}`);
		if (entry.bought) meta.push(`bought ${entry.bought}`);
		if (entry.expire) meta.push(`expire ${entry.expire}`);
		row.createDiv({ cls: "cooklist-item-qty", text: meta.join(" · ") });
		const remove = row.createEl("button", { text: "×", cls: "cooklist-remove-item" });
		remove.setAttribute("data-name", entry.name);
		remove.setAttribute("data-section", section.name);
	}
}

function parseQty(qty: string): { value: number; unit: string | null } {
	const m = /^([\d.]+)(?:\s*%\s*(\S+))?$/.exec(qty.trim());
	if (!m) return { value: 1, unit: null };
	return { value: Number(m[1]), unit: m[2] ?? null };
}

function fmt(value: number): string {
	return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}