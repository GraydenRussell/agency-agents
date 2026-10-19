/**
 * Seeds realistic sample data so every screen is clickable before real accounts are connected.
 * Dates are relative to "today" in Phoenix so the demo always looks current.
 *
 *   npm run db:seed          (wipes and reseeds the DATABASE_URL database)
 */
import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { addDays, atLocalMinutes, isoWeekday, monthRange, today, weekRange } from "../src/lib/time";

config({ path: ".env.local" });
config();

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

const T = today();
const at = (dayOffset: number, h: number, m = 0) => atLocalMinutes(addDays(T, dayOffset), h * 60 + m);

async function wipe() {
  const rows = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length) {
    await db.$executeRawUnsafe(`TRUNCATE ${rows.map((r) => `"public"."${r.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }
}

async function seedGoalsAndTasks() {
  const year = T.slice(0, 4);
  const month = Number(T.slice(5, 7));
  const q = Math.ceil(month / 3);
  const qStart = `${year}-${String((q - 1) * 3 + 1).padStart(2, "0")}-01`;
  const qEnd = monthRange(`${year}-${String(q * 3).padStart(2, "0")}-01`).end;
  const wk = weekRange(T);

  const yRevenue = await db.goal.create({
    data: { title: "Grow Rapid Window Cleaning to $500k revenue", level: "YEAR", area: "BUSINESS", periodStart: new Date(`${year}-01-01`), periodEnd: new Date(`${year}-12-31`), targetValue: 500000, currentValue: 341000, unit: "$" },
  });
  const yHealth = await db.goal.create({
    data: { title: "Run a half marathon under 1:50", level: "YEAR", area: "HEALTH", periodStart: new Date(`${year}-01-01`), periodEnd: new Date(`${year}-12-31`) },
  });
  const qLeads = await db.goal.create({
    data: { title: `Q${q}: 120 new residential leads`, level: "QUARTER", area: "BUSINESS", parentId: yRevenue.id, periodStart: new Date(qStart), periodEnd: new Date(qEnd), targetValue: 120, currentValue: 74, unit: "leads" },
  });
  const qSystems = await db.goal.create({
    data: { title: `Q${q}: Hire and train a second crew lead`, level: "QUARTER", area: "BUSINESS", parentId: yRevenue.id, periodStart: new Date(qStart), periodEnd: new Date(qEnd) },
  });
  const qRun = await db.goal.create({
    data: { title: `Q${q}: Build to 25 miles/week`, level: "QUARTER", area: "HEALTH", parentId: yHealth.id, periodStart: new Date(qStart), periodEnd: new Date(qEnd), targetValue: 25, currentValue: 18, unit: "mi/wk" },
  });
  const wLeads = await db.goal.create({
    data: { title: "Launch fall solar-screen promo", level: "WEEK", area: "BUSINESS", parentId: qLeads.id, periodStart: new Date(wk.start), periodEnd: new Date(wk.end) },
  });
  const wHire = await db.goal.create({
    data: { title: "Interview 3 crew lead candidates", level: "WEEK", area: "BUSINESS", parentId: qSystems.id, periodStart: new Date(wk.start), periodEnd: new Date(wk.end) },
  });

  type TaskData = Parameters<typeof db.task.create>[0]["data"];
  const tasks: TaskData[] = [
    { title: "Approve Meta ad creative for solar-screen promo", priority: 1, area: "BUSINESS", dueAt: at(0, 12), top3Date: T, goalId: wLeads.id, estimateMinutes: 30 },
    { title: "Call back Mesa HOA about quarterly contract", priority: 1, area: "BUSINESS", dueAt: at(0, 15), top3Date: T, estimateMinutes: 20 },
    { title: "Long run: 8 miles easy", priority: 2, area: "HEALTH", dueAt: at(0, 18), top3Date: T, goalId: qRun.id, estimateMinutes: 75 },
    { title: "Review crew lead applications", priority: 2, area: "BUSINESS", dueAt: at(1, 17), goalId: wHire.id, status: "DOING" },
    { title: "Order 2 new water-fed poles + resin filters", priority: 2, area: "BUSINESS", dueAt: at(2, 17) },
    { title: "Send Q3 numbers to accountant", priority: 1, area: "MONEY", dueAt: at(-2, 17) },
    { title: "Renew truck registration", priority: 2, area: "PERSONAL", dueAt: at(-1, 17) },
    { title: "Update Google Business Profile photos", priority: 3, area: "BUSINESS", dueAt: at(3, 17) },
    { title: "Read: The E-Myth Revisited (ch. 6–8)", priority: 4, area: "LEARNING" },
    { title: "Meal prep for the week", priority: 3, area: "HEALTH", dueAt: at(isoWeekday(T) === 7 ? 0 : 7 - isoWeekday(T), 16) },
    { title: "Pay credit card", priority: 2, area: "MONEY", dueAt: at(4, 12) },
    { title: "Book dentist appointment", priority: 4, area: "PERSONAL" },
    { title: "Draft SOP: first-time customer walkthrough", priority: 3, area: "BUSINESS", goalId: qSystems.id, status: "DOING" },
    { title: "Post before/after reel on Instagram", priority: 3, area: "BUSINESS", status: "DONE", completedAt: at(-1, 14) },
    { title: "Stretch + mobility 15 min", priority: 3, area: "HEALTH", status: "DONE", completedAt: at(0, 6, 40) },
  ];
  for (const [i, data] of tasks.entries()) await db.task.create({ data: { ...data, sortOrder: i } });

  const parent = await db.task.create({
    data: { title: "Prep for Saturday commercial job (Chandler Fashion Center storefronts)", priority: 2, area: "BUSINESS", dueAt: at(1, 18), sortOrder: 50 },
  });
  for (const [i, title] of ["Confirm access time with property manager", "Load lift + extra squeegee channels", "Print safety checklist"].entries()) {
    await db.task.create({ data: { title, parentId: parent.id, area: "BUSINESS", sortOrder: i, status: i === 0 ? "DONE" : "TODO", completedAt: i === 0 ? at(0, 9) : null } });
  }

  await db.task.create({
    data: { title: "Weekly invoice follow-ups", priority: 2, area: "BUSINESS", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO", dueAt: at(7 - isoWeekday(T) + 1, 10), sortOrder: 60 },
  });
}

async function seedRoutines() {
  const weekday = await db.routineTemplate.create({ data: { name: "Weekday", dayType: "WEEKDAY", days: [1, 2, 3, 4, 5] } });
  const weekend = await db.routineTemplate.create({ data: { name: "Weekend", dayType: "WEEKEND", days: [6, 7] } });
  const blocks = (rows: Array<[string, string, number, number]>) => rows.map(([title, kind, s, e], i) => ({ title, kind: kind as never, startMin: s, endMin: e, sortOrder: i }));
  await db.routineBlock.createMany({
    data: blocks([
      ["Wake + morning routine", "WAKE", 5 * 60, 5 * 60 + 45],
      ["Gym", "GYM", 5 * 60 + 45, 7 * 60],
      ["Deep work: business", "WORK", 7 * 60 + 30, 10 * 60 + 30],
      ["Field / crew check-ins", "WORK", 10 * 60 + 30, 14 * 60],
      ["Admin + email", "ADMIN", 14 * 60, 15 * 60 + 30],
      ["Wind-down", "WIND_DOWN", 21 * 60, 22 * 60],
    ]).map((b) => ({ ...b, templateId: weekday.id })),
  });
  await db.routineBlock.createMany({
    data: blocks([
      ["Sleep in + coffee", "WAKE", 6 * 60 + 30, 7 * 60 + 30],
      ["Long run / hike", "GYM", 7 * 60 + 30, 9 * 60],
      ["Weekly review", "ADMIN", 17 * 60, 18 * 60],
      ["Wind-down", "WIND_DOWN", 21 * 60 + 30, 22 * 60 + 30],
    ]).map((b) => ({ ...b, templateId: weekend.id })),
  });

  const morning = await db.checklist.create({ data: { name: "Morning", kind: "MORNING" } });
  const evening = await db.checklist.create({ data: { name: "Evening", kind: "EVENING" } });
  const mItems = ["Water + electrolytes", "10 min stretch", "Review Today + Top 3", "Check crew schedule", "Inbox zero pass (10 min)"];
  const eItems = ["Plan tomorrow's Top 3", "Journal 3 lines", "Lay out gear for tomorrow", "Phone on charger outside bedroom"];
  for (const [i, label] of mItems.entries()) await db.checklistItem.create({ data: { checklistId: morning.id, label, sortOrder: i } });
  for (const [i, label] of eItems.entries()) await db.checklistItem.create({ data: { checklistId: evening.id, label, sortOrder: i } });
  const firstTwo = await db.checklistItem.findMany({ where: { checklistId: morning.id }, orderBy: { sortOrder: "asc" }, take: 2 });
  await db.checklistRun.create({ data: { checklistId: morning.id, date: T, checkedItemIds: firstTwo.map((i) => i.id) } });
}

async function seedHabits() {
  const habits = [
    { name: "Workout", area: "HEALTH" as const, target: 1, icon: "dumbbell" },
    { name: "Water", area: "HEALTH" as const, target: 8, unit: "glasses", icon: "droplet" },
    { name: "Read 20 min", area: "LEARNING" as const, target: 1, icon: "book" },
    { name: "No phone after 9:30", area: "PERSONAL" as const, target: 1, icon: "moon" },
  ];
  for (const [i, h] of habits.entries()) {
    const habit = await db.habit.create({ data: { ...h, sortOrder: i } });
    // Deterministic pseudo-random history for streaks.
    for (let d = 1; d <= 30; d++) {
      const hit = (d * (i + 3)) % 5 !== 0 || d <= 4;
      if (hit) await db.habitLog.create({ data: { habitId: habit.id, date: addDays(T, -d), value: h.target } });
    }
  }
}

async function seedNotes() {
  await db.note.createMany({
    data: [
      { title: "Pricing ideas for 2027", body: "- Bundle solar screen cleaning with exterior windows (+$40)\n- Quarterly plan discount 10%\n- Commercial: per-pane vs per-hour bids", tags: ["business", "pricing"], pinned: true },
      { title: "Crew lead interview questions", body: "1. Tell me about a time a customer was unhappy.\n2. How do you handle a ladder safety issue?\n3. Walk me through a 2-story job setup.", tags: ["hiring"] },
      { title: "Half marathon plan", body: "Build 10% per week, one long run Saturday, tempo Wednesday. Race: Phoenix half in Feb.", tags: ["health", "running"] },
      { title: "Journal", body: "Good day in the field. The new resin filters cut spotting a lot. Need to delegate more of the quoting.", isJournal: true, journalDate: addDays(T, -1), prompt: "What's one thing you'd do differently today?" },
      { title: "Journal", body: "Closed the HOA deal verbally. Tyce crushed the Gilbert route.", isJournal: true, journalDate: addDays(T, -2), prompt: "What are you proud of today?" },
    ],
  });
}

async function seedPeopleMoneyHealth() {
  await db.person.createMany({
    data: [
      { name: "Tyce", relation: "Business partner", phone: "+1 480 555 0101", notes: "Co-owner. Runs East Valley routes.", lastContactedAt: at(0, 8), followUpDays: 1 },
      { name: "Linda Park", relation: "Customer", company: "Mesa Verde HOA", email: "linda@mesaverdehoa.org", notes: "HOA board president, wants quarterly contract.", lastContactedAt: at(-9, 10), followUpDays: 7, nextFollowUpAt: at(-2, 9) },
      { name: "Marcus Reyes", relation: "Vendor", company: "Desert Pure Water Supply", email: "marcus@desertpure.example", notes: "Resin + DI filters. Ask about bulk pricing.", lastContactedAt: at(-20, 10), followUpDays: 30, nextFollowUpAt: at(10, 9) },
      { name: "Mom", relation: "Family", phone: "+1 480 555 0199", lastContactedAt: at(-6, 19), followUpDays: 7, nextFollowUpAt: at(1, 18) },
    ],
  });

  const cats = [
    ["Groceries", 600, "#22c55e"],
    ["Dining out", 250, "#f97316"],
    ["Gas", 220, "#eab308"],
    ["Gym & health", 120, "#06b6d4"],
    ["Subscriptions", 80, "#a855f7"],
    ["Fun", 200, "#ec4899"],
  ] as const;
  const catIds: Record<string, string> = {};
  for (const [name, monthlyLimit, color] of cats) catIds[name] = (await db.budgetCategory.create({ data: { name, monthlyLimit, color } })).id;
  const tx: Array<[number, number, string, string]> = [
    [-1, 84.12, "Fry's", "Groceries"],
    [-2, 42.5, "Cafe Zupas", "Dining out"],
    [-3, 61.0, "QuikTrip", "Gas"],
    [-5, 15.99, "Spotify", "Subscriptions"],
    [-6, 129.4, "Costco", "Groceries"],
    [-8, 55.0, "Topgolf", "Fun"],
    [-9, 49.0, "EōS Fitness", "Gym & health"],
    [-11, 58.75, "Shell", "Gas"],
  ];
  for (const [d, amount, merchant, cat] of tx) await db.transaction.create({ data: { date: addDays(T, d), amount, merchant, categoryId: catIds[cat] } });
  await db.bill.createMany({
    data: [
      { name: "Rent", amount: 1850, dueDay: 1 },
      { name: "Truck payment", amount: 612, dueDay: 15, autopay: true },
      { name: "SRP Electric", amount: 180, dueDay: 22 },
      { name: "Phone", amount: 85, dueDay: 8, autopay: true },
      { name: "Car insurance", amount: 142, dueDay: 27 },
    ],
  });

  for (let d = 1; d <= 14; d++) {
    await db.sleepLog.create({ data: { date: addDays(T, -d), hours: Math.round((6.2 + ((d * 7) % 20) / 10) * 10) / 10, quality: 3 + (d % 3) } });
    await db.waterLog.create({ data: { date: addDays(T, -d), ounces: 60 + ((d * 13) % 50) } });
    if (d % 2 === 0 || d % 5 === 0) {
      await db.workout.create({ data: { date: addDays(T, -d), type: d % 4 === 0 ? "Run" : "Strength", durationMin: d % 4 === 0 ? 50 : 60, intensity: 3 + (d % 3) } });
    }
  }
}

async function seedProjects() {
  await db.project.createMany({
    data: [
      { source: "GITHUB", repoFullName: "GraydenRussell/Rapid-Windows-dash", name: "Rapid-Windows-dash", description: "Admin dashboard: Housecall Pro sync, daily brief, analytics.", stack: ["Next.js", "TypeScript", "Supabase", "Prisma"], repoUrl: "https://github.com/GraydenRussell/Rapid-Windows-dash", isPrivate: true, status: "ACTIVE", nextStep: "Push code and add /api/life-os/summary endpoint", lastCommitAt: at(-120, 14) },
      { source: "GITHUB", repoFullName: "GraydenRussell/predixyai", name: "predixyai", description: "AI prediction side project.", stack: ["TypeScript"], repoUrl: "https://github.com/GraydenRussell/predixyai", isPrivate: true, status: "PAUSED", nextStep: "Decide: revive or archive", lastCommitAt: at(-131, 10) },
      { source: "GITHUB", repoFullName: "GraydenRussell/housecallpro-mcp", name: "housecallpro-mcp", description: "MCP server for Housecall Pro (fork).", stack: ["TypeScript", "MCP"], repoUrl: "https://github.com/GraydenRussell/housecallpro-mcp", isPrivate: false, status: "IDEA", lastCommitAt: at(-480, 10) },
      { source: "MANUAL", name: "Life OS", description: "This app.", stack: ["Next.js", "Supabase", "Anthropic"], status: "ACTIVE", nextStep: "Finish Phase 2" },
    ],
  });
}

async function seedSettingsAndMemory() {
  await db.memory.createMany({
    data: [
      { kind: "FACT", key: "business.name", value: "Rapid Window Cleaning (AZ Rapid Washers LLC), Chandler AZ. Co-owned with partner Tyce.", source: "seed" },
      { kind: "FACT", key: "location", value: "Chandler, Arizona. Timezone America/Phoenix (no DST). Outdoor work is weather-sensitive (heat, wind, monsoon).", source: "seed" },
      { kind: "PREFERENCE", key: "schedule.mornings", value: "Gym early (5:45). Protect 7:30–10:30 for deep work.", source: "seed" },
      { kind: "STYLE", key: "email.voice", value: "Friendly, direct, short. Signs off 'Thanks, Grayden'. Uses first names. No corporate filler.", source: "seed" },
    ],
  });
}

async function seedLeads() {
  const ago = (min: number) => new Date(Date.now() - min * 60_000);
  await db.lead.createMany({
    data: [
      { source: "WEBSITE", sourceDetail: "Contact page", name: "Jennifer Alvarez", phone: "480-555-0185", email: "jen.alvarez@example.com", address: "980 N Alma School Rd, Chandler", message: "Hi! We're selling our house and have an open house next weekend. 2 story, maybe 30 windows, need inside and out plus screens. Can you come this week?", score: 88, scoredBy: "rules", scoreReason: "has a phone number, in Chandler, wants it soon, bigger job.", draftReply: "Hi Jennifer, this is Grayden with Rapid Window Cleaning. Congrats on the sale! We can absolutely get you sparkling before the open house. Does Thursday or Friday morning work? For ~30 windows inside and out with screens on a 2-story, I'll send a firm quote right after.", receivedAt: ago(22), alertedAt: ago(22) },
      { source: "META", sourceDetail: "Fall window special", name: "Ashley Romero", phone: "+14805550147", email: "ashley.r@example.com", message: "City: Gilbert\nhow_many_windows?: about 25, two story", score: 74, scoredBy: "rules", scoreReason: "has a phone number, in Gilbert, bigger job.", draftReply: "Hi Ashley, this is Grayden with Rapid Window Cleaning. Thanks for grabbing the fall special! For about 25 windows on a 2-story, do you want inside and out, and any screens or hard-water spots? I can get you on the schedule this week.", receivedAt: ago(6), alertedAt: ago(6) },
      { source: "EMAIL", sourceDetail: "manager@mesaverdehoa.example", name: "Mesa Verde HOA", email: "manager@mesaverdehoa.example", message: "Requesting a bid for quarterly exterior window cleaning of our clubhouse and two pool buildings.", status: "CONTACTED", score: 81, scoredBy: "rules", scoreReason: "sounds commercial or recurring.", draftReply: null, receivedAt: ago(60 * 26), firstResponseAt: ago(60 * 25), alertedAt: ago(60 * 26) },
    ],
  });
}

async function main() {
  console.log(`Seeding ${url?.replace(/:[^:@/]+@/, ":***@")} for local date ${T} …`);
  await wipe();
  await seedGoalsAndTasks();
  await seedRoutines();
  await seedHabits();
  await seedNotes();
  await seedPeopleMoneyHealth();
  await seedProjects();
  await seedSettingsAndMemory();
  await seedLeads();
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
