import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  // Small pool per serverless instance; Supabase's pooler (Supavisor) multiplexes behind it.
  const max = Number(process.env.DB_POOL_MAX ?? 5);
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, max }) });
}

export const db: PrismaClient = globalForPrisma.prisma ?? create();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
