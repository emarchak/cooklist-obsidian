import type { FileReader } from "./engine/model";

/** FileReader over the Obsidian vault adapter, rooted at the recipe box (R12: Node APIs stay out of src/). */
export class VaultReader implements FileReader {
	constructor(
		private adapter: { read(path: string): Promise<string> },
		private root: string
	) {}

	async read(path: string): Promise<string> {
		return this.adapter.read(`${this.root}/${path.replace(/^\.\//, "")}`);
	}
}