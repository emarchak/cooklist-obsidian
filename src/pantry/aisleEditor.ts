/**
 * Aisle-conf read-modify-write (R9, U6). Assignment APPENDS an ingredient to the end of
 * its aisle section — existing sections and entries are never reordered (order is
 * display order). Idempotent: an ingredient already listed anywhere is left alone.
 */

export function aisleAssign(text: string, aisle: string, ingredient: string): string {
	const lines = text.split("\n");

	// Idempotence: already assigned somewhere (case-insensitive).
	const target = ingredient.trim().toLowerCase();
	if (lines.some((l) => !l.trimStart().startsWith("[") && l.trim().toLowerCase() === target)) {
		return text;
	}

	const headerIdx = lines.findIndex((l) => l.trim().toLowerCase() === `[${aisle.toLowerCase()}]`);
	if (headerIdx === -1) {
		const body = text.endsWith("\n") || text === "" ? text : text + "\n";
		return `${body}[${aisle}]\n${ingredient}\n`;
	}

	const nextSection = lines.findIndex((l, i) => i > headerIdx && /^\s*\[/.test(l));
	const insertAt = nextSection === -1 ? lines.length : lastNonEmptyIndex(lines, nextSection - 1) + 1;
	lines.splice(insertAt, 0, ingredient);
	return lines.join("\n");
}

function lastNonEmptyIndex(lines: string[], upTo: number): number {
	for (let i = upTo; i >= 0; i--) {
		if (lines[i].trim() !== "") return i;
	}
	return upTo;
}
