import { defineConfig } from "tsup"

export default defineConfig([
    {
        entry: { index: "src/index.ts" },
        format: ["esm", "cjs"],
        target: "node22",
        platform: "neutral",
        dts: true,
        sourcemap: true,
        treeshake: true,
    },
    {
        entry: { "enderbot-wiki": "src/cli/main.ts" },
        format: ["esm"],
        target: "node22",
        platform: "node",
        dts: false,
        sourcemap: true,
        treeshake: true,
    },
])
