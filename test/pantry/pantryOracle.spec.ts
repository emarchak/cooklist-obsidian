import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { pantrySet } from "../../src/pantry/pantryEditor";

const cook = "/opt/homebrew/bin/cook";

describe.skipIf(process.env.CI)("pantry oracle: cook pantry list agrees with the pane (AE4)", () => {
	it("an added simple item is visible to the CLI", () => {
		const dir = mkdtempSync(join(tmpdir(), "cooklist-pantry-"));
		try {
			mkdirSync(join(dir, "config"), { recursive: true });
			writeFileSync(join(dir, "config", "pantry.conf"), '[pantry]\n"kosher salt" = "400%tsp"\n');
			const text = readFileSync(join(dir, "config", "pantry.conf"), "utf8");
			writeFileSync(join(dir, "config", "pantry.conf"), pantrySet(text, "eggs", { value: 10, unit: null }));
			const out = execFileSync(cook, ["pantry", "-b", dir, "list"], { encoding: "utf8" });
			expect(out).toContain("eggs - 10");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
