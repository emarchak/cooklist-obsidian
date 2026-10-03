/**
 * Pantry-conf read-modify-write (R8, U6). Edits are surgical: only the targeted entry
 * line is replaced/inserted/removed, so comments, section order, and other entries
 * survive byte-for-byte. Simple form: `"name" = "qty%unit"`; object form keeps its
 * bought/expire/low fields and only rewrites `quantity`.
 */

export interface PantrySetEntry {
	value: number;
	unit: string | null;
}

function quantityString(entry: PantrySetEntry): string {
	return entry.unit ? `${entry.value}%${entry.unit}` : `${entry.value}`;
}

function findEntryLine(lines: string[], name: string): number {
	const needle = `"${name}"`;
	return lines.findIndex((l) => l.trimStart().startsWith(needle) && /\s*=/.test(l));
}

function replaceValueOnLine(line: string, name: string, entry: PantrySetEntry): string {
	if (line.includes("{")) {
		// object form — rewrite only the quantity field
		return line.replace(/quantity\s*=\s*"[^"]*"/, `quantity = "${quantityString(entry)}"`);
	}
	return line.replace(/=\s*"[^"]*"\s*$/, `= "${quantityString(entry)}"`).replace(`"${name}"`, `"${name}"`);
}

/** Upsert a pantry entry, preserving comments, sections, and unrelated entries. */
export function pantrySet(text: string, name: string, entry: PantrySetEntry): string {
	const lines = text.split("\n");
	const idx = findEntryLine(lines, name);
	if (idx !== -1) {
		lines[idx] = replaceValueOnLine(lines[idx], name, entry);
		return lines.join("\n");
	}

	const sectionIdx = findLastSectionHeader(lines);
	if (sectionIdx === -1) {
		return `${text.endsWith("\n") || text === "" ? text : text + "\n"}[pantry]\n"${name}" = "${quantityString(entry)}"\n`;
	}

	const sectionName = lines[sectionIdx].trim();
	const nextSection = lines.findIndex((l, i) => i > sectionIdx && /^\s*\[/.test(l));
	const insertAt = nextSection === -1 ? lines.length : lastNonEmptyIndex(lines, nextSection - 1) + 1;
	lines.splice(insertAt, 0, `"${name}" = "${quantityString(entry)}"`);
	void sectionName;
	return lines.join("\n");
}

/** Remove a pantry entry; comments/sections untouched. No-op when absent. */
export function pantryRemove(text: string, name: string): string {
	const lines = text.split("\n");
	const idx = findEntryLine(lines, name);
	if (idx === -1) return text;
	lines.splice(idx, 1);
	return lines.join("\n");
}

function findLastSectionHeader(lines: string[]): number {
	for (let i = lines.length - 1; i >= 0; i--) {
		if (/^\s*\[.+\]\s*$/.test(lines[i])) return i;
	}
	return -1;
}

function lastNonEmptyIndex(lines: string[], upTo: number): number {
	for (let i = upTo; i >= 0; i--) {
		if (lines[i].trim() !== "") return i;
	}
	return upTo;
}
