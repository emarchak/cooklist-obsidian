/**
 * Weekly grocery-deals digest parsing (R13, U5). The digest is the skill-generated note
 * (daily/YYYY/MM/DD/grocery-deals.md): per-store `## StoreName` sections with
 * `| Deal | Price |` tables, UPPERCASE flyer names, `—` prices on banner rows, and known
 * OCR price errors. No network calls — the digest is read from the vault.
 */

export interface Deal {
	store: string;
	name: string;
	/** Dollar price; null for `—` banner rows. */
	price: number | null;
	/** OCR-error suspects (digest skill's rule: flag, don't repeat). */
	suspicious: boolean;
}

export interface Digest {
	weekOf: string | null;
	deals: Deal[];
}

/** Above this, a grocery price is almost certainly an OCR error (e.g. $314.99 short ribs). */
const SUSPICIOUS_PRICE = 50;

export function parseDigest(text: string): Digest {
	const digest: Digest = { weekOf: null, deals: [] };

	const weekMatch = text.match(/week of (\d{4}-\d{2}-\d{2})/);
	if (weekMatch) digest.weekOf = weekMatch[1];

	let store: string | null = null;
	let inTable = false;
	for (const rawLine of text.split("\n")) {
		const line = rawLine.trim();
		const storeHeader = line.match(/^##\s+(.+)$/);
		if (storeHeader) {
			store = storeHeader[1].trim();
			inTable = false;
			continue;
		}
		if (store && line.startsWith("| Deal |")) {
			inTable = true;
			continue;
		}
		if (!store || !inTable) continue;
		if (line.startsWith("| ---")) continue;
		const row = line.match(/^\|\s*(.+?)\s*\|\s*(.+?)\s*\|$/);
		if (!row) continue;
		const name = row[1].trim();
		if (!name || name === "Deal") continue;
		const priceText = row[2].trim();
		const price = priceText === "—" || priceText === "-" ? null : parsePrice(priceText);
		digest.deals.push({ store, name, price, suspicious: price !== null && price > SUSPICIOUS_PRICE });
	}
	return digest;
}

function parsePrice(text: string): number | null {
	const m = text.replace(/^\$/, "").match(/^(\d+(?:\.\d+)?)/);
	return m ? Number(m[1]) : null;
}