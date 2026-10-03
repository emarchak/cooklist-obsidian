/**
 * Tick state (KTD3, U4): the official `.shopping-checked` append log — `+ name` / `- name`
 * lines, last entry wins, matching is case-insensitive and global (whole ingredient name, so
 * ticking one occurrence ticks it everywhere it appears). Ticks survive list regeneration
 * because they key on ingredient names, not list positions.
 *
 * Compaction is an explicit "Complete trip" action — nothing compacts automatically. It
 * replays the log, reconciles against the current list's names, and rewrites with only
 * `+` lines (idempotent; stale entries pruned).
 */

/** Replay a log into the set of checked names (lowercased for matching). */
export function replayCheckedLog(text: string): Set<string> {
	const checked = new Set<string>();
	for (const rawLine of text.split("\n")) {
		const line = rawLine.trim();
		if (!line) continue;
		if (line.startsWith("+")) {
			checked.add(line.slice(1).trim().toLowerCase());
		} else if (line.startsWith("-")) {
			checked.delete(line.slice(1).trim().toLowerCase());
		}
	}
	return checked;
}

/** Convenience: parse an existing log file's contents into the checked set. */
export function readCheckedLog(text: string): Set<string> {
	return replayCheckedLog(text);
}

export function isChecked(logText: string, name: string): boolean {
	return replayCheckedLog(logText).has(name.trim().toLowerCase());
}

/** Append-only tick/untick entry. Returns the new log text (existing content preserved). */
export function appendTick(logText: string, name: string, checked: boolean): string {
	const line = `${checked ? "+" : "-"} ${name.trim()}`;
	const base = logText.length === 0 ? "" : logText.endsWith("\n") ? logText : `${logText}\n`;
	return `${base}${line}\n`;
}

/**
 * Compact the log against the current list's item names (original casing preserved in
 * output; matching case-insensitive). Items ticked but no longer on the list are pruned.
 */
export function compactCheckedLog(logText: string, listNames: readonly string[]): string {
	const checked = replayCheckedLog(logText);
	const lines: string[] = [];
	for (const name of listNames) {
		if (checked.has(name.trim().toLowerCase())) lines.push(`+ ${name.trim()}`);
	}
	return lines.length > 0 ? lines.join("\n") + "\n" : "";
}