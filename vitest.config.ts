import { defineConfig } from "vitest/config";
import { viteWasmInline } from "./scripts/wasm-inline.mjs";

export default defineConfig({
	plugins: [viteWasmInline],
	test: {
		environment: "node",
		include: ["test/**/*.spec.ts"],
	},
});