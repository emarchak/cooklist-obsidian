import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

describe("manifest", () => {
	const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
	const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

	it("targets the right plugin id and platform reach", () => {
		expect(manifest.id).toBe("cooklist");
		expect(manifest.isDesktopOnly).toBe(false);
	});

	it("keeps versions in step across package.json, manifest.json, versions.json", () => {
		expect(manifest.version).toBe(pkg.version);
		const versions = JSON.parse(readFileSync(join(root, "versions.json"), "utf8"));
		expect(versions[manifest.version]).toBe(manifest.minAppVersion);
	});

	it("declares a minAppVersion at least as new as the recipe-viewer plugin's", () => {
		// cooklang-obsidian (death_au) requires 1.8.0; we run in the same vault.
		const min = Number(manifest.minAppVersion.split(".").map((n: string) => n.padStart(2, "0")).join(""));
		expect(min).toBeGreaterThanOrEqual(10800);
	});
});