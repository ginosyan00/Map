import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// CLI (migrate / db push) should use the direct Neon endpoint when available.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? env("DATABASE_URL"),
  },
});
