"use server";
import { runAction } from "@/lib/actions";
import { runTest, SETUP_ITEMS, type TestResult } from "@/lib/setup/checklist";
import { db } from "@/lib/db";

/** Live, read-only connection test for one checklist item. */
export async function testSetupItemAction(id: string) {
  return runAction<TestResult>(async () => {
    if (!SETUP_ITEMS.some((i) => i.id === id)) throw new Error("Unknown setup item");
    if (id === "database") {
      const rows = await db.$queryRaw<Array<{ n: bigint }>>`SELECT count(*) AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
      return { ok: true, detail: `Connected; ${Number(rows[0]?.n ?? 0)} migrations applied` };
    }
    return runTest(id, process.env);
  });
}
