/**
 * Parser adapters (KTD1): `@cooklang/cooklang` (WASM of cooklang-rs — the same engine family
 * as the cook CLI, so list semantics align by construction) is primary; `@cooklang/cooklang-ts`
 * is the runtime fallback for platforms where WASM init fails (documented Obsidian-mobile
 * failure modes). A device test decides whether the fallback ever fires (plan U7).
 */
import { RecipeNotFoundError, type ParsedIngredient, type ParsedRecipe } from "./model";

export interface ParseAdapter {
	readonly id: "wasm" | "ts";
	/** Parse a recipe at the given scale factor (1 = unscaled). */
	parse(text: string, scale: number): ParsedRecipe;
}

type WasmQuantity = { value: { type: string; value: unknown } | null; unit: string | null; scalable?: boolean };
type WasmIngredient = { name: string; quantity: WasmQuantity | null };
type WasmRecipe = { ingredients: WasmIngredient[]; raw_metadata?: unknown; metadata?: unknown };

function wasmNumber(value: { type: string; value: unknown } | null | undefined): number | null {
	if (!value) return null;
	if (value.type === "number") {
		const inner = value.value as { type?: string; value?: unknown } | undefined;
		if (inner?.type === "fraction") {
			// cooklang-rs encodes fractions as whole + err (num/den are degraded); prefer err.
			const f = inner.value as { whole?: number; num?: number; den?: number; err?: number } | undefined;
			if (f) {
				const whole = Number(f.whole ?? 0);
				const err = Number(f.err ?? 0);
				return err ? whole + err : whole + Number(f.num ?? 0) / Number(f.den || 1);
			}
		}
		const n = Number(inner?.value);
		return Number.isFinite(n) ? n : null;
	}
	if (value.type === "range") return Number((value.value as { start: { value: number } }).start.value);
	return null;
}

function metadataToRecord(raw: unknown): Record<string, string> {
	const out: Record<string, string> = {};
	// wasm-bindgen maps Rust BTreeMap to { map: {...} } on this build; accept Map, plain
	// objects, and that wrapper.
	const source = raw && typeof raw === "object" && "map" in (raw as Record<string, unknown>) ? (raw as { map: unknown }).map : raw;
	if (source instanceof Map) {
		for (const [k, v] of source) out[String(k)] = String(v);
	} else if (source && typeof source === "object") {
		for (const [k, v] of Object.entries(source as Record<string, unknown>)) out[k] = String(v);
	}
	return out;
}

function scaleQuantity(value: number | null, unit: string | null, scale: number) {
	return {
		value: value === null ? null : value * scale,
		unit,
	};
}

class WasmAdapter implements ParseAdapter {
	readonly id = "wasm" as const;

	constructor(private parser: { parse(text: string, scale?: number | null): { recipe: WasmRecipe; metadata?: unknown } }) {}

	parse(text: string, scale: number): ParsedRecipe {
		const result = this.parser.parse(text, scale);
		const ingredients: ParsedIngredient[] = (result.recipe.ingredients ?? []).map((ing) => ({
			name: ing.name,
			quantity: ing.quantity ? scaleQuantity(wasmNumber(ing.quantity.value), ing.quantity.unit ?? null, 1) : null,
		}));
		const metadata = metadataToRecord(result.recipe.raw_metadata ?? result.recipe.metadata);
		// The WASM parser applies the factor at parse time (fixed `=` quantities included in
		// that rule — verified by test), so quantities above are already correctly scaled.
		return { ingredients, metadata, scale };
	}
}

type TsParserInstance = { parse(source: string): { ingredients: { name: string; quantity: string | number; units: string }[]; metadata: unknown } };

class TsAdapter implements ParseAdapter {
	readonly id = "ts" as const;

	// cooklang-ts has no parse-time scaling, so the adapter applies the factor to numeric
	// quantities itself. Fixed (`=`) quantities are not distinguishable in this parser — a
	// documented fallback limitation; the device test decides whether this path ever runs.
	constructor(private parser: { parse(source: string): { ingredients: { name: string; quantity: string | number; units: string }[]; metadata: unknown } }) {}

	parse(text: string, scale: number): ParsedRecipe {
		const result = this.parser.parse(text);
		const ingredients: ParsedIngredient[] = result.ingredients.map((ing) => {
			// The TS lib has no fixed-quantity syntax — `=` comes through in the amount string;
			// treat it as fixed so it never scales (official conventions).
			const rawFixed = typeof ing.quantity === "string" && ing.quantity.trim().startsWith("=");
			const value = typeof ing.quantity === "number" ? ing.quantity : parseAmount(ing.quantity.replace(/^[=\s]+/, ""));
			return {
				name: ing.name,
				quantity: scaleQuantity(value, ing.units || null, rawFixed ? 1 : scale),
			};
		});
		// cooklang-ts returns empty metadata — extract the YAML frontmatter itself so
		// servings-based ref scaling survives a fallback (factorFor reads recipe.metadata).
		return { ingredients, metadata: { ...frontmatterOf(text), ...metadataToRecord(result.metadata) }, scale };
	}
}

/** Minimal frontmatter key: value extraction — enough for servings/title that scaling needs. */
function frontmatterOf(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	const lines = text.split("\n");
	if (lines[0]?.trim() !== "---") return out;
	for (let i = 1; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line === "---") break;
		const m = line.match(/^([A-Za-z0-9 _-]+):\s*(.*)$/);
		if (m) out[m[1].trim()] = m[2].trim();
	}
	return out;
}

/** "4 1/5" / "1/2" / "3" → number; used by the TS fallback whose quantities may be strings. */
function parseAmount(raw: string): number | null {
	const trimmed = raw.trim();
	const mixed = trimmed.match(/^(\d+)\s+(\d+)\/(\d+)$/);
	if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
	const fraction = trimmed.match(/^(\d+)\/(\d+)$/);
	if (fraction) return Number(fraction[1]) / Number(fraction[2]);
	const n = Number(trimmed);
	return Number.isFinite(n) ? n : null;
}

/**
 * Create the parser. The WASM package is imported dynamically so an init failure routes to
 * the TS fallback instead of killing plugin load. `force` exists for tests: the fallback path
 * must be exercised even where WASM works.
 */
export async function createParser(force?: "wasm" | "ts"): Promise<ParseAdapter> {
	if (force !== "ts") {
		try {
			const mod = await import("@cooklang/cooklang");
			return new WasmAdapter(new mod.Parser());
		} catch (err) {
			if (force === "wasm") {
				throw new Error(`cooklist: WASM parser init failed (${err instanceof Error ? err.message : String(err)})`);
			}
			// fall through to TS
		}
	}
	// cooklang-ts is CJS; interop varies by transform pipeline — accept all shapes.
	const mod = (await import("@cooklang/cooklang-ts")) as unknown as Record<string, unknown>;
	const Ctor = (mod.default as Record<string, unknown> | undefined)?.Parser ?? mod.default ?? mod.Parser;
	if (typeof Ctor !== "function") throw new Error("cooklist: cooklang-ts fallback parser unavailable");
	return new TsAdapter(new (Ctor as new () => TsParserInstance)());
}

export { RecipeNotFoundError };
