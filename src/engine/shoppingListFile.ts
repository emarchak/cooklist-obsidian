/**
 * `.shopping-list` trip file (KTD3): the official proposal-0016 definition format — a
 * rolling, hidden, one-per-recipe-box file listing the active trip's recipe refs with
 * scale braces, plus optional free-hand items and `--` comments. The cook CLI reads this
 * shape in server mode (its CLI commands ignore it today — recorded one-way nuance).
 */
import type { MenuRef, RefScale } from "./model";

export interface ShoppingListFile {
	refs: MenuRef[];
	freehand: string[];
	comments: string[];
}

function scaleBraces(scale: RefScale | null): string {
	if (!scale) return "";
	if (scale.kind === "factor") return ` {${formatNumber(scale.n)}}`;
	if (scale.kind === "servings") return ` {${formatNumber(scale.n)}%servings}`;
	return ` {${formatNumber(scale.n)}%${scale.unit}}`;
}

function formatNumber(n: number): string {
	return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4)));
}

export function writeShoppingListFile(refs: readonly MenuRef[], freehand: readonly string[] = [], comments: readonly string[] = []): string {
	const lines: string[] = [];
	for (const comment of comments) lines.push(`-- ${comment}`);
	for (const ref of refs) lines.push(`${ref.ref}${scaleBraces(ref.scale)}`);
	for (const item of freehand) lines.push(item);
	return lines.join("\n") + "\n";
}

const REF_LINE = /^(\.\/[^{]+?)\s*(?:\{([^{}]*)\})?\s*$/;

export function parseShoppingListFile(text: string): ShoppingListFile {
	const file: ShoppingListFile = { refs: [], freehand: [], comments: [] };
	for (const rawLine of text.split("\n")) {
		const line = rawLine.trim();
		if (!line) continue;
		if (line.startsWith("--")) {
			file.comments.push(line.replace(/^--\s*/, ""));
			continue;
		}
		const ref = line.match(REF_LINE);
		if (ref && line.startsWith("./")) {
			file.refs.push({ ref: ref[1].trim(), scale: ref[2] !== undefined ? parseScaleText(ref[2].trim()) : null });
			continue;
		}
		file.freehand.push(line);
	}
	return file;
}

function parseScaleText(braces: string): RefScale | null {
	if (!braces) return null;
	const servings = braces.match(/^(\d+(?:\.\d+)?)\s*%\s*servings$/);
	if (servings) return { kind: "servings", n: Number(servings[1]) };
	const yieldScale = braces.match(/^(\d+(?:\.\d+)?)\s*%\s*(.+)$/);
	if (yieldScale) return { kind: "yield", n: Number(yieldScale[1]), unit: yieldScale[2].trim() };
	const factor = braces.match(/^(\d+(?:\.\d+)?)$/);
	if (factor) return { kind: "factor", n: Number(factor[1]) };
	return null;
}