import { fileURLToPath } from "node:url";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
	{ ignores: ["**/node_modules/**", ".local/**", "src/wasm/pkg/**", "main.js", "dist/**"] },
	{
		files: ["src/**/*.{ts,tsx,mts,cts}", "demo/**/*.{ts,tsx,mts,cts}"],
		extends: obsidianmd.configs.recommended,
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: fileURLToPath(new URL(".", import.meta.url)),
			},
		},
	},
	{
		files: ["src/**/*.{ts,tsx,mts,cts}"],
		rules: {
			"obsidianmd/prefer-create-el": "error",
			"no-restricted-imports": ["error", {
				patterns: [{
					group: ["**/demo/**", "**/tests/**", "**/testUtils/**", "**/scripts/**"],
					message: "Plugin code must use its Obsidian platform adapter; development modules cannot ship in the plugin.",
				}],
			}],
		},
	},
]);
