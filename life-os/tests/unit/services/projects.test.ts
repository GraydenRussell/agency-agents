import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { detectStack } from "@/lib/integrations/github";
import { parseVercelProject } from "@/lib/integrations/vercel";
import { initialStatus, repoFromRemote, syncProjects, updateProject, upsertLocalProjects } from "@/lib/services/projects";
import { POST as localPOST } from "@/app/api/projects/local/route";
import { resetDb } from "../../setup/db";

beforeEach(resetDb);
afterEach(() => {
  process.env.INTEGRATION_MODE = "mock";
  vi.unstubAllGlobals();
});

describe("project helpers", () => {
  it("detects stack from deps, languages, topics", () => {
    expect(detectStack({ TypeScript: 9000, CSS: 500 }, ["saas"], { dependencies: { next: "16", "@prisma/client": "7" } })).toEqual(["Next.js", "Prisma", "TypeScript", "saas"]);
    expect(detectStack({ Python: 100 }, [], null)).toEqual(["Python"]);
  });
  it("parses remotes and initial status", () => {
    expect(repoFromRemote("git@github.com:GraydenRussell/life-os.git")).toBe("GraydenRussell/life-os");
    expect(repoFromRemote("https://github.com/a/b")).toBe("a/b");
    expect(repoFromRemote("https://gitlab.com/a/b")).toBeNull();
    const now = Date.now();
    expect(initialStatus({ archived: false, pushedAt: new Date(now - 5 * 86_400_000) }, now)).toBe("ACTIVE");
    expect(initialStatus({ archived: false, pushedAt: new Date(now - 90 * 86_400_000) }, now)).toBe("PAUSED");
    expect(initialStatus({ archived: true, pushedAt: new Date(now) }, now)).toBe("DONE");
  });
  it("maps Vercel projects to repo + production URL + state", () => {
    const v = parseVercelProject({ id: "p", name: "dash", link: { org: "GraydenRussell", repo: "Rapid-Windows-dash" }, targets: { production: { alias: ["dash.example.com"] } }, latestDeployments: [{ readyState: "READY", createdAt: 1760000000000, target: "production" }] });
    expect(v).toMatchObject({ repo: "GraydenRussell/Rapid-Windows-dash", productionUrl: "https://dash.example.com", deployState: "READY" });
  });
});

describe("project sync", () => {
  it("creates repos with Vercel data and preserves user fields on re-sync", async () => {
    const r = await syncProjects();
    expect(r.created).toBe(4);
    const dash = await db.project.findFirstOrThrow({ where: { name: "Rapid-Windows-dash" } });
    expect(dash).toMatchObject({ deployState: "READY", status: "ACTIVE" });
    await updateProject(dash.id, { status: "PAUSED", nextStep: "Add API endpoint", notes: "keep me" });
    const again = await syncProjects();
    expect(again).toMatchObject({ created: 0, updated: 4 });
    expect(await db.project.findUniqueOrThrow({ where: { id: dash.id } })).toMatchObject({ status: "PAUSED", nextStep: "Add API endpoint", notes: "keep me" });
  });

  it("requires a token in live mode", async () => {
    process.env.INTEGRATION_MODE = "live";
    delete process.env.GITHUB_TOKEN;
    await expect(syncProjects()).rejects.toThrow("GITHUB_TOKEN");
  });

  it("live GitHub sync paginates, filters owners, and enriches recent repos", async () => {
    process.env.INTEGRATION_MODE = "live";
    process.env.GITHUB_TOKEN = "t";
    process.env.GITHUB_OWNERS = "GraydenRussell";
    delete process.env.VERCEL_TOKEN;
    const repo = (owner: string, name: string, days: number) => ({ full_name: `${owner}/${name}`, name, description: null, html_url: `https://github.com/${owner}/${name}`, homepage: null, private: true, fork: false, archived: false, default_branch: "main", pushed_at: new Date(Date.now() - days * 86_400_000).toISOString(), open_issues_count: 2, topics: [], owner: { login: owner } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/user/repos")) return Response.json(url.includes("page=1") ? [repo("GraydenRussell", "life-os", 1), repo("someone-else", "x", 1), repo("GraydenRussell", "old", 400)] : []);
        if (url.endsWith("/languages")) return Response.json({ TypeScript: 100 });
        if (url.includes("/commits")) return Response.json([{ commit: { message: "feat: phase 7\n\nbody", committer: { date: new Date().toISOString() } } }]);
        if (url.includes("/contents/package.json")) return Response.json({ content: Buffer.from(JSON.stringify({ dependencies: { next: "16" } })).toString("base64"), encoding: "base64" });
        return new Response("not found", { status: 404 });
      }),
    );
    const r = await syncProjects();
    expect(r.total).toBe(2);
    const p = await db.project.findFirstOrThrow({ where: { name: "life-os" } });
    expect(p).toMatchObject({ lastCommitMsg: "feat: phase 7", stack: ["Next.js", "TypeScript"], openIssues: 2 });
    expect((await db.project.findFirstOrThrow({ where: { name: "old" } })).status).toBe("PAUSED");
  });
});

describe("local projects", () => {
  it("matches by GitHub remote or creates LOCAL projects", async () => {
    await syncProjects();
    const r = await upsertLocalProjects([
      { name: "dash", path: "/Users/g/Projects/dash", remote: "git@github.com:GraydenRussell/Rapid-Windows-dash.git" },
      { name: "scratch", path: "/Users/g/Projects/scratch", remote: null, stack: ["Python"] },
    ]);
    expect(r).toEqual({ matched: 1, created: 1 });
    expect((await db.project.findFirstOrThrow({ where: { name: "Rapid-Windows-dash" } })).localPath).toBe("/Users/g/Projects/dash");
    expect(await db.project.count({ where: { source: "LOCAL" } })).toBe(1);
  });

  it("endpoint requires the sync token", async () => {
    process.env.PROJECTS_SYNC_TOKEN = "sync-token-0123456789abcdef";
    const body = JSON.stringify({ projects: [{ name: "x", path: "/x" }] });
    expect((await localPOST(new Request("http://x", { method: "POST", body }))).status).toBe(401);
    const ok = await localPOST(new Request("http://x", { method: "POST", body, headers: { authorization: "Bearer sync-token-0123456789abcdef" } }));
    expect(ok.status).toBe(200);
  });
});
