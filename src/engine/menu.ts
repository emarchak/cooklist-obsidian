/**
 * Menu parsing and recipe-reference resolution (U2).
 *
 * Menus are the vault's `.menu.md` shape (the mealplan skill's format): YAML frontmatter, a
 * markdown overview table (content, never ingredients), then `== Day (date) ==` sections
 * holding `@./recipe{scale}` refs and `-- comment` lines. This mirrors the official Cooklang
 * menu conventions (proposal 0016) with the frontmatter/table extensions cookcli tolerates.
 */
import { RecipeNotFoundError, type Menu, type MenuDay, type MenuRef, type ParsedRecipe, type RefScale } from "./model";
import type { FileReader } from "./model";
import type { ParseAdapter } from "./parser";

const DAY_RE = /^==\s+(.+?)\s*(?:\((\d{4}-\d{2}-\d{2})\))?\s+==\s*$/;
const REF_RE = /@((?:\.\/)[^@\n#~{]+?)\s*\{([^{}]*)\}/g;
const BARE_REF_RE = /@((?:\.\/)[^@\n#~{]+)/g;

export function parseMenu(text: string): Menu {
	const menu: Menu = { title: null, days: [] };
	let current: MenuDay | null = null;
	let inFrontmatter = false;
	let frontmatterDone = false;

	for (const rawLine of text.split("\n")) {
		const line = rawLine.trim();

		if (!frontmatterDone && line === "---") {
			if (!inFrontmatter) {
				inFrontmatter = true;
				continue;
			}
			inFrontmatter = false;
			frontmatterDone = true;
			continue;
		}
		if (inFrontmatter) {
			const m = line.match(/^title:\s*(.+)$/);
			if (m) menu.title = m[1].trim();
			continue;
		}

		const day = line.match(DAY_RE);
		if (day) {
			current = { label: day[1], date: day[2] ?? null, refs: [], comments: [] };
			menu.days.push(current);
			continue;
		}

		if (!current) continue; // overview table, blank lines, frontmatter leftovers

		if (line.startsWith("--")) {
			current.comments.push(line.replace(/^--\s*/, ""));
			continue;
		}

		if (line.startsWith("@")) {
			let remainder = line;
			for (const m of line.matchAll(REF_RE)) {
				current.refs.push({ ref: m[1].trim(), scale: parseScale(m[2].trim()) });
				remainder = remainder.replace(m[0], " ");
			}
			// Tolerance: refs without scale braces (`@./recipe`) are valid references at factor 1.
			for (const m of remainder.matchAll(BARE_REF_RE)) {
				current.refs.push({ ref: m[1].trim(), scale: null });
			}
		}
	}

	return menu;
}

function parseScale(braces: string): RefScale | null {
	if (!braces) return null;
	const servings = braces.match(/^(\d+(?:\.\d+)?)\s*%\s*servings$/);
	if (servings) return { kind: "servings", n: Number(servings[1]) };
	const yieldScale = braces.match(/^(\d+(?:\.\d+)?)\s*%\s*(.+)$/);
	if (yieldScale) return { kind: "yield", n: Number(yieldScale[1]), unit: yieldScale[2].trim() };
	const factor = braces.match(/^(\d+(?:\.\d+)?)$/);
	if (factor) return { kind: "factor", n: Number(factor[1]) };
	return null;
}

export function servingsOf(recipe: ParsedRecipe): number {
	const raw = recipe.metadata["servings"];
	const n = raw === undefined ? NaN : Number(raw);
	return Number.isFinite(n) && n > 0 ? n : 1;
}

function factorFor(scale: RefScale | null, recipe: ParsedRecipe): number {
	if (!scale) return 1;
	if (scale.kind === "factor") return scale.n;
	if (scale.kind === "servings") return scale.n / servingsOf(recipe);
	// Official semantics: {N%unit} scales via experimental `yield` metadata; without a
	// matching entry it is an error, never a silent wrong quantity.
	const yieldRaw = recipe.metadata["yield"];
	if (yieldRaw) {
		const m = yieldRaw.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*${scale.unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"));
		if (m) return scale.n / Number(m[1]);
	}
	throw new Error(`cooklist: ref scale {${scale.n}%${scale.unit}} has no matching yield metadata`);
}

export interface ResolvedMenuRef {
	day: MenuDay;
	ref: MenuRef;
	recipe: ParsedRecipe;
	factor: number;
}

export async function resolveMenu(
	menu: Menu,
	reader: FileReader,
	parse: ParseAdapter,
	opts?: { onError?: (error: unknown) => void }
): Promise<ResolvedMenuRef[]> {
	const resolved: ResolvedMenuRef[] = [];
	for (const day of menu.days) {
		for (const ref of day.refs) {
			try {
				const text = await reader.read(`${ref.ref}.cook`);
				const unscaled = parse.parse(text, 1);
				const factor = factorFor(ref.scale, unscaled);
				const recipe = factor === 1 ? unscaled : parse.parse(text, factor);
				resolved.push({ day, ref, recipe, factor });
			} catch (err) {
				if (err instanceof RecipeNotFoundError || (err instanceof Error && err.name === "RecipeNotFoundError")) {
					opts?.onError?.(new RecipeNotFoundError(ref.ref));
					continue;
				}
				opts?.onError?.(err);
			}
		}
	}
	return resolved;
}