/**
 * KTD2 oracle suite: the engine must equal `cook shopping-list -f json` (cookcli 0.35.0)
 * on identical inputs. Runs the real binary in a temp recipe-box built from the vault
 * fixtures. Skips cleanly when the cook binary is absent (e.g. CI without Homebrew).
 */
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { aggregate } from "../../src/engine/aggregate";
import { deduct, parsePantry } from "../../src/engine/pantry";
import { groupByAisle, parseAisle } from "../../src/engine/aisle";
import { parseMenu, resolveMenu } from "../../src/engine/menu";
import { createParser } from "../../src/engine/parser";
import { MemoryReader } from "../../src/engine/reader";

const execFileP = promisify(execFile);
const COOK = "/opt/homebrew/bin/cook";
const hasCook = existsSync(COOK);
const fixtureRoot = join(new URL("..", import.meta.url).pathname, "fixtures");
const fixture = (name: string) => readFileSync(join(fixtureRoot, name), "utf8");

const RECIPES = ["All Allium Frittata.cook", "Kokumaro curry.cook", "Tomato soup.cook"];

function buildRecipeBox(dir: string, pantryText?: string) {
	const box = join(dir, "recipe-box");
	mkdirSync(join(box, "cooking"), { recursive: true });
	mkdirSync(join(box, "config"), { recursive: true });
	for (const r of RECIPES) copyFileSync(join(fixtureRoot, r), join(box, "cooking", r));
	copyFileSync(join(fixtureRoot, "week-2026-09-28.menu.md"), join(box, "week-2026-09-28.menu.md"));
	copyFileSync(join(fixtureRoot, "config", "aisle.conf"), join(box, "config", "aisle.conf"));
	writeFileSync(join(box, "config", "pantry.conf"), pantryText ?? readFileSync(join(fixtureRoot, "config", "pantry.conf"), "utf8"));
	return box;
}

type CliValue = { type: string; value: unknown };
type CliJson = { category: string; items: { name: string; quantity: { unit: string | null; value: CliValue | null }[] }[] }[];

/** Unwrap cooklang-rs quantity values: {type:"regular"|"fraction"|"number", value:...} → number|null. */
function toNumber(v: unknown): number | null {
	if (v === null || v === undefined) return null;
	if (typeof v === "number") return v;
	const obj = v as { type?: string; value?: unknown; whole?: number; num?: number; den?: number; err?: number };
	if (obj.type === "fraction" || obj.err !== undefined) return Number(obj.whole ?? 0) + Number(obj.err ?? (obj.num ?? 0) / (obj.den || 1));
	return toNumber(obj.value);
}

function normalize(value: CliValue | null, unit: string | null) {
	const n = toNumber(value);
	return { value: n, unit: unit ?? null };
}

function cliCategoryMap(json: CliJson) {
	const map = new Map<string, Map<string, { value: number | null; unit: string | null }[]>>();
	const order: string[] = [];
	for (const section of json) {
		order.push(section.category);
		const items = new Map<string, { value: number | null; unit: string | null }[]>();
		for (const item of section.items) {
			items.set(item.name, item.quantity.map((q) => normalize(q.value, q.unit)));
		}
		map.set(section.category, items);
	}
	return { order, map };
}

async function engineSections(box: string) {
	const parser = await createParser("wasm");
	const reader = new MemoryReader(
		Object.fromEntries(RECIPES.map((r) => [`./cooking/${r}`, readFileSync(join(fixtureRoot, r), "utf8")]))
	);
	const menu = parseMenu(readFileSync(join(box, "week-2026-09-28.menu.md"), "utf8"));
	const resolved = await resolveMenu(menu, reader, parser);
	let items = aggregate(resolved);
	items = deduct(items, parsePantry(readFileSync(join(box, "config", "pantry.conf"), "utf8"))).items;
	return groupByAisle(items, parseAisle(readFileSync(join(box, "config", "aisle.conf"), "utf8")));
}

describe.skipIf(!hasCook)("CLI oracle (KTD2): engine equals cook shopping-list -f json", () => {
	it("matches on the real vault menu with the real confs", async () => {
		const dir = mkdtempSync(join(tmpdir(), "cooklist-oracle-"));
		try {
			const box = buildRecipeBox(dir);
			const { stdout } = await execFileP(COOK, [
				"shopping-list",
				"-a",
				"config/aisle.conf",
				"--pantry",
				"config/pantry.conf",
				"week-2026-09-28.menu.md",
				"-f",
				"json",
			], { cwd: box });
			const cli = cliCategoryMap(JSON.parse(stdout) as CliJson);
			const engine = await engineSections(box);

			// Same category sequence (aisle.conf order + other last)
			expect(engine.map((s) => s.name)).toEqual(cli.order);

			// Same items, same quantities per category
			const problems: string[] = [];
			for (const section of engine) {
				const cliItems = cli.map.get(section.name)!;
				const engineItems = new Map(section.items.map((i) => [i.name, i.quantities.map((q) => ({ value: q.value, unit: q.unit }))]));
				const eKeys = [...engineItems.keys()].sort();
				const cKeys = [...cliItems.keys()].sort();
				if (JSON.stringify(eKeys) !== JSON.stringify(cKeys)) {
					problems.push(`KEYS ${section.name}: engine-only ${JSON.stringify(eKeys.filter((k) => !cKeys.includes(k)))} cli-only ${JSON.stringify(cKeys.filter((k) => !eKeys.includes(k)))}`);
				}
				for (const [name, quantities] of engineItems) {
					if (JSON.stringify(quantities) !== JSON.stringify(cliItems.get(name))) {
						problems.push(`QTY ${section.name}/${name}: engine ${JSON.stringify(quantities)} cli ${JSON.stringify(cliItems.get(name))}`);
					}
				}
			}
			expect(problems).toEqual([]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("AE1: eggs need-minus-6 matches the CLI", async () => {
		const dir = mkdtempSync(join(tmpdir(), "cooklist-ae1-"));
		try {
			const pantry = `[pantry]\n"eggs" = "6"\n`;
			const box = buildRecipeBox(dir, pantry);
			writeFileSync(join(box, "cooking/Egg dish.cook"), ["---", "servings: 4", "---", "", "Crack @eggs{12} into a bowl.", ""].join("\n"));
			writeFileSync(join(box, "ae1.menu.md"), ["== Day 1 (2026-10-01) ==", "@./cooking/Egg dish{4%servings}", ""].join("\n"));

			const { stdout } = await execFileP(COOK, [
				"shopping-list",
				"-a",
				"config/aisle.conf",
				"--pantry",
				"config/pantry.conf",
				"ae1.menu.md",
				"-f",
				"json",
			], { cwd: box });
			const cli = cliCategoryMap(JSON.parse(stdout) as CliJson);
			const engine = await engineSections2(box, "ae1.menu.md", pantry);

			for (const section of engine) {
				const cliItems = cli.map.get(section.name)!;
				for (const item of section.items) {
					if (item.name === "eggs") {
						const engineQty = item.quantities.map((q) => ({ value: q.value, unit: q.unit }));
						expect(engineQty).toEqual(cliItems.get("eggs"));
						expect(engineQty[0].value).toBeCloseTo(6); // 12 needed × (4/4 servings) − 6 stocked
					}
				}
			}
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

async function engineSections2(box: string, menuName: string, pantryText: string) {
	const parser = await createParser("wasm");
	const reader = new MemoryReader({ "./cooking/Egg dish.cook": readFileSync(join(box, "cooking/Egg dish.cook"), "utf8") });
	const menu = parseMenu(readFileSync(join(box, menuName), "utf8"));
	const resolved = await resolveMenu(menu, reader, parser);
	let items = aggregate(resolved);
	items = deduct(items, parsePantry(pantryText)).items;
	return groupByAisle(items, parseAisle(readFileSync(join(box, "config", "aisle.conf"), "utf8")));
}