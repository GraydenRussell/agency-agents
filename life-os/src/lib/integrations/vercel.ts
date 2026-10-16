import "server-only";
import { z } from "zod";
import { isMock } from "./mode";

export type VercelProjectInfo = {
  id: string;
  name: string;
  repo: string | null; // "owner/name"
  productionUrl: string | null;
  deployState: string | null; // READY | ERROR | BUILDING | QUEUED | CANCELED
  deployedAt: Date | null;
};

const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  link: z.object({ org: z.string().optional(), repo: z.string().optional(), type: z.string().optional() }).nullish(),
  targets: z.object({ production: z.object({ alias: z.array(z.string()).optional(), url: z.string().optional() }).nullish() }).nullish(),
  latestDeployments: z.array(z.object({ readyState: z.string().optional(), state: z.string().optional(), createdAt: z.number().optional(), url: z.string().optional(), target: z.string().nullish() })).optional(),
});

export function parseVercelProject(p: z.infer<typeof projectSchema>): VercelProjectInfo {
  const prodDeploy = p.latestDeployments?.find((d) => d.target === "production") ?? p.latestDeployments?.[0];
  const alias = p.targets?.production?.alias?.[0] ?? p.targets?.production?.url ?? prodDeploy?.url ?? null;
  return {
    id: p.id,
    name: p.name,
    repo: p.link?.org && p.link?.repo ? `${p.link.org}/${p.link.repo}` : null,
    productionUrl: alias ? (alias.startsWith("http") ? alias : `https://${alias}`) : null,
    deployState: prodDeploy?.readyState ?? prodDeploy?.state ?? null,
    deployedAt: prodDeploy?.createdAt ? new Date(prodDeploy.createdAt) : null,
  };
}

export async function listVercelProjects(): Promise<VercelProjectInfo[]> {
  if (isMock()) {
    return [
      { id: "prj_dash", name: "rapid-windows-dash", repo: "GraydenRussell/Rapid-Windows-dash", productionUrl: "https://dash.rapidwindowcleaning.example", deployState: "READY", deployedAt: new Date(Date.now() - 2 * 86_400_000) },
      { id: "prj_predixy", name: "predixyai", repo: "GraydenRussell/predixyai", productionUrl: "https://predixy.example.com", deployState: "ERROR", deployedAt: new Date(Date.now() - 40 * 86_400_000) },
    ];
  }
  const token = process.env.VERCEL_TOKEN;
  if (!token) return [];
  const team = process.env.VERCEL_TEAM_ID ? `&teamId=${encodeURIComponent(process.env.VERCEL_TEAM_ID)}` : "";
  const res = await fetch(`https://api.vercel.com/v9/projects?limit=100${team}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Vercel ${res.status}`);
  const data = z.object({ projects: z.array(projectSchema) }).parse(await res.json());
  return data.projects.map(parseVercelProject);
}
