import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js convention: secrets live in .env.local (never committed).
config({ path: ".env.local" });
config();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection on Supabase.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
