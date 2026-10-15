import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/empty.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    // Test files share one database; run them one at a time.
    fileParallelism: false,
    env: {
      STRIPE_SECRET_KEY: "sk_test_123",
      STRIPE_WEBHOOK_SECRET: "whsec_test_secret",
      APP_URL: "http://localhost:3101",
      SMTP_HOST: "",
      ANTHROPIC_API_KEY: "",
    },
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
