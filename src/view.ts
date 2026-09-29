import { ItemView, WorkspaceLeaf } from "obsidian";
import type CooklistPlugin from "./main";
export const VIEW_TYPE_COOKLIST = "cooklist-workbench";

type Surface = "trip" | "list" | "pantry";

const SURFACES: Surface[] = ["trip", "list", "pantry"];

export class WorkbenchView extends ItemView {
	plugin: CooklistPlugin;
	private surface: Surface = "trip";

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
		this.renderShell();
	}

	async onClose(): Promise<void> {
		// Nothing to release yet; services arrive with U3-U6.
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
		if (this.surface === "list") {
			this.renderListSurface(surfaceEl);
		} else {
			surfaceEl.setText(this.placeholderFor(this.surface));
		}
	}

	/** List surface: placeholder for the per-store lists (U5) plus the explicit Complete-trip control (U4). */
	private renderListSurface(container: HTMLElement): void {
		if (!this.plugin.settings.lastMenuPath) {
			container.createDiv({ cls: "cooklist-empty", text: "No active trip — set one up in the Trip tab." });
			return;
		}
		container.createDiv({ cls: "cooklist-empty", text: "Per-store lists will appear here once a trip is set up." });
		const complete = container.createEl("button", {
			text: "Complete trip",
			cls: "cooklist-complete-trip",
		});
		complete.addEventListener("click", async () => {
			await this.plugin.completeActiveTrip();
			this.surface = "trip";
			this.renderShell();
		});
	}

	private placeholderFor(surface: Surface): string {
		if (surface === "trip") return "Trip setup will appear here — pick a menu and your stores.";
		if (surface === "list") return "Per-store lists will appear here once a trip is set up.";
		return "Pantry stock will appear here.";
	}
}