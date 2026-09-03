import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // The SDK is published as one file per module with extension-less
    // relative imports and JSON import attributes — the shape the host's
    // bundler expects, not Node's. Inlining it lets Vite resolve it the same
    // way the build preset does.
    server: { deps: { inline: [/@ham2k\/extension-sdk/] } },
  },
})
