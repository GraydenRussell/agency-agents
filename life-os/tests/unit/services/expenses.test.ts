import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { executeTool, undoActivity } from "@/lib/assistant/executor";
import { byCategory, deductibleAmount, guessCategory, toCsv } from "@/lib/business/expenses";
import { syncHousecallPro } from "@/lib/services/customers";
import { createExpense, createTrip, createVehicle, deleteExpense, exportYearCsv, listExpenses, logRouteMiles, taxYearSummary, uploadReceipt } from "@/lib/services/expenses";
import { setSetting } from "@/lib/services/settings";
import { today } from "@/lib/time";
import { GET as receiptGET } from "@/app/api/receipts/[id]/route";
import { resetDb } from "../../setup/db";

beforeEach(resetDb);
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4c10000000049454e44ae426082", "hex");

describe("expense helpers", () => {
  it("guesses categories from vendors", () => {
    expect(guessCategory("Circle K #2231")).toBe("Fuel");
    expect(guessCategory("The Home Depot")).toBe("Supplies");
    expect(guessCategory("Discount Tire")).toBe("Vehicle repairs");
    expect(guessCategory("Chick-fil-A")).toBe("Meals");
    expect(guessCategory("Google Ads")).toBe("Advertising");
    expect(guessCategory("Joe's Shop")).toBe("Other");
  });
  it("rolls up by category with deductible amounts, and writes safe CSV", () => {
    const r = byCategory([{ category: "Meals", amount: 20, deductiblePct: 50 }, { category: "Fuel", amount: 60.5, deductiblePct: 100 }, { category: "Meals", amount: 10, deductiblePct: 50 }]);
    expect(r).toEqual([{ category: "Fuel", total: 60.5, deductible: 60.5, count: 1 }, { category: "Meals", total: 30, deductible: 15, count: 2 }]);
    expect(deductibleAmount({ amount: 33.33, deductiblePct: 50 })).toBe(16.67);
    expect(toCsv(["a", "b"], [["=SUM(1)", 'say "hi", ok']])).toBe(`a,b\n'=SUM(1),"say ""hi"", ok"\n`);
  });
});

describe("expenses + receipts", () => {
  it("creates with default deductible %, lists by month, deletes with its receipt", async () => {
    const meal = await createExpense({ date: today(), vendor: "Chipotle", amount: 24.5, category: "Meals" });
    expect(meal.deductiblePct).toBe(50);
    await createExpense({ date: today(), vendor: "Shell", amount: 61.2, category: "Fuel" });
    expect((await listExpenses()).map((e) => e.vendor).sort()).toEqual(["Chipotle", "Shell"]);
    await expect(createExpense({ date: today(), vendor: "", amount: 5, category: "Fuel" })).rejects.toThrow(/paid to/);
    await expect(createExpense({ date: today(), vendor: "X", amount: 0, category: "Fuel" })).rejects.toThrow(/more than \$0/);

    const up = await uploadReceipt({ name: "r.png", type: "image/png", bytes: PNG });
    expect(up.read).toBeNull(); // AI is off in tests
    expect(up.draft).toEqual({ date: today(), receiptId: up.receiptId });
    const e = await createExpense({ date: today(), vendor: "Home Depot", amount: 64, category: "Supplies", receiptId: up.receiptId });
    const res = await receiptGET(new Request("http://x"), { params: Promise.resolve({ id: up.receiptId }) });
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG)).toBe(true);
    await deleteExpense(e.id);
    expect(await db.receiptFile.count()).toBe(0);
  });

  it("rejects HEIC, unknown types, and oversized files", async () => {
    await expect(uploadReceipt({ name: "IMG_1.HEIC", type: "image/heic", bytes: PNG })).rejects.toThrow(/HEIC/);
    await expect(uploadReceipt({ name: "x.txt", type: "text/plain", bytes: PNG })).rejects.toThrow(/photo/);
    await expect(uploadReceipt({ name: "big.jpg", type: "image/jpeg", bytes: Buffer.alloc(6 * 1024 * 1024 + 1) })).rejects.toThrow(/over 6 MB/);
  });

  it("assistant expense_add guesses the category and is undoable", async () => {
    const r = await executeTool("expense_add", { vendor: "QuikTrip", amount: 48 }, { actor: "ASSISTANT" });
    if (r.status !== "ok") throw new Error(JSON.stringify(r));
    expect(r.summary).toBe("Logged $48 at QuikTrip (Fuel)");
    await undoActivity(r.activityId);
    expect(await db.businessExpense.count()).toBe(0);
  });
});

describe("mileage + tax summary", () => {
  it("logs trips and the day's job route once, and totals the deduction", async () => {
    await setSetting("taxes.mileageRate", 0.7);
    const truck = await createVehicle({ name: "Work truck" });
    await createTrip({ vehicleId: truck.id, date: today(), miles: 12.5, purpose: "Supply run" });
    await createTrip({ vehicleId: truck.id, date: today(), miles: 10, purpose: "Personal errand", business: false });
    await syncHousecallPro();
    const routeTrip = await logRouteMiles(today(), truck.id);
    expect(routeTrip).toMatchObject({ source: "ROUTE", business: true });
    expect(routeTrip.purpose).toMatch(/^Job route: Priya Patel, Sun Lakes HOA, Minh Nguyen$/);
    await expect(logRouteMiles(today(), truck.id)).rejects.toThrow(/already logged/);
    await createExpense({ date: today(), vendor: "Shell", amount: 50, category: "Fuel" });
    await createExpense({ date: today(), vendor: "Chipotle", amount: 20, category: "Meals" });

    const s = await taxYearSummary();
    expect(s.businessMiles).toBe(Math.round((12.5 + routeTrip.miles) * 10) / 10);
    expect(s.mileageDeduction).toBe(Math.round(s.businessMiles * 0.7 * 100) / 100);
    expect(s).toMatchObject({ totalSpent: 70, totalDeductible: 60 });

    const csv = await exportYearCsv(today().slice(0, 4));
    expect(csv.expenses.split("\n")[0]).toBe("Date,Vendor,Category,Amount,Deductible %,Deductible amount,Payment,Notes,Has receipt");
    expect(csv.expenses).toContain("Chipotle,Meals,20.00,50,10.00");
    expect(csv.mileage).toContain("Supply run,8.75");
    expect(csv.mileage).toContain("Personal errand,0.00");

    const bad = await executeTool("mileage_log", { vehicleName: "Boat", miles: 3, purpose: "x" }, { actor: "ASSISTANT" });
    expect(bad).toMatchObject({ status: "error", error: expect.stringContaining("Vehicles: Work truck") });
    const ok = await executeTool("mileage_log", { vehicleName: "truck", miles: 3, purpose: "Bank deposit" }, { actor: "ASSISTANT" });
    expect(ok).toMatchObject({ status: "ok", summary: "Logged 3 mi in Work truck" });
  });
});
