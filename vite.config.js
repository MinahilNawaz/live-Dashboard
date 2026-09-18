/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    plugins: [react()],
    resolve: {
        // The dev sandbox this was built in mounts the project directory
        // through a reparse point, so process.cwd() and the realpath'd path
        // diverge; without this, Rollup's output-path calculation in `build`
        // breaks. Harmless on a normal filesystem.
        preserveSymlinks: true,
    },
    test: {
        globals: true,
        environment: "happy-dom",
        setupFiles: "./src/test/setup.ts",
        css: true,
    },
});
