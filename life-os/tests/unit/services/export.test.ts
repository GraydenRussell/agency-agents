import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { exportAll } from "@/lib/services/export";
import { createTask } from "@/lib/services/tasks";
import { resetDb } from "../../setup/db";

beforeEach(async () => {
  await resetDb();
});

describe("data export", () => {
  it("includes your data with counts and never includes tokens or push keys", async () => {
    await createTask({ title: "Order squeegee rubbers" });
    await db.note.create({ data: { title: "Pricing", body: "Screens $4 each", tags: ["pricing"] } });
    await db.memory.create({ data: { key: "preference.calls", value: "After 10am", kind: "PREFERENCE" } });
    await db.integrationAccount.create({ data: { provider: "GOOGLE", accountEmail: "g@example.com", encryptedTokens: "TOKEN-CIPHERTEXT-SECRET", scopes: ["gmail"] } });
    await db.pushSubscription.create({ data: { endpoint: "https://push.example/1", p256dh: "P256DH-SECRET", auth: "AUTH-SECRET" } });

    const out = await exportAll();
    expect(out).toMatchObject({ app: "life-os", version: 1 });
    expect(out.counts).toMatchObject({ tasks: 1, notes: 1, memories: 1, integrations: 1 });
    expect(out.data.tasks[0]?.title).toBe("Order squeegee rubbers");
    expect(out.data.integrations[0]).toMatchObject({ provider: "GOOGLE", accountEmail: "g@example.com" });

    const text = JSON.stringify(out);
    for (const secret of ["TOKEN-CIPHERTEXT-SECRET", "P256DH-SECRET", "AUTH-SECRET", "encryptedTokens"]) expect(text).not.toContain(secret);
  });
});
