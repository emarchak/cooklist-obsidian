import { RecipeNotFoundError, type FileReader } from "./model";

export { RecipeNotFoundError };

/** In-memory reader for tests and offline fixtures. */
export class MemoryReader implements FileReader {
	private files: Map<string, string>;

	constructor(files: Record<string, string>) {
		this.files = new Map(Object.entries(files));
	}

	async read(path: string): Promise<string> {
		const content = this.files.get(path);
		if (content === undefined) throw new RecipeNotFoundError(path.replace(/\.cook$/, ""));
		return content;
	}
}