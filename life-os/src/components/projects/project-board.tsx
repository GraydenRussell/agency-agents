"use client";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CircleDot, ExternalLink, FolderGit2, GitCommitHorizontal, GitBranch, Lock, Plus, RefreshCw, Rocket, Trash2 } from "lucide-react";
import type { ProjectStatus } from "@/generated/prisma/enums";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/states";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/ui/use-action";
import { formatDateTime, localDateOf, relativeDayLabel } from "@/lib/time";
import { cn } from "@/lib/utils";
import { createProjectAction, deleteProjectAction, syncProjectsAction, updateProjectAction } from "@/app/(app)/projects/actions";

export type ProjectView = {
  id: string;
  source: string;
  name: string;
  description: string | null;
  stack: string[];
  repoFullName: string | null;
  repoUrl: string | null;
  lastCommitAt: string | null;
  lastCommitMsg: string | null;
  openIssues: number | null;
  isPrivate: boolean | null;
  deployUrl: string | null;
  deployState: string | null;
  deployedAt: string | null;
  launchUrl: string | null;
  localPath: string | null;
  status: ProjectStatus;
  nextStep: string | null;
  notes: string | null;
};

const STATUSES: ProjectStatus[] = ["ACTIVE", "PAUSED", "IDEA", "DONE"];
const DEPLOY_VARIANT: Record<string, "success" | "danger" | "warning" | "secondary"> = { READY: "success", ERROR: "danger", BUILDING: "warning", QUEUED: "warning", CANCELED: "secondary" };

function ago(iso: string | null) {
  return iso ? relativeDayLabel(localDateOf(new Date(iso))) : "–";
}

export function ProjectBoard({ projects, githubReady, lastSync }: { projects: ProjectView[]; githubReady: boolean; lastSync: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { pending, run } = useAction();
  const [filter, setFilter] = useState<ProjectStatus | "ALL">("ALL");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const openId = params.get("project");
  const open = projects.find((p) => p.id === openId) ?? null;
  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (id) next.set("project", id);
    else next.delete("project");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const shown = projects.filter((p) => (filter === "ALL" || p.status === filter) && (!q || `${p.name} ${p.description ?? ""} ${p.stack.join(" ")}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg bg-muted p-1 text-sm">
          {(["ALL", ...STATUSES] as const).map((s) => (
            <button key={s} type="button" onClick={() => setFilter(s)} className={cn("rounded-md px-3 py-1 capitalize", filter === s ? "bg-background shadow-sm" : "text-muted-foreground")}>
              {s.toLowerCase()} <span className="text-xs text-muted-foreground">{s === "ALL" ? projects.length : projects.filter((p) => p.status === s).length}</span>
            </button>
          ))}
        </div>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects" className="max-w-56" aria-label="Search projects" />
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground">{lastSync ? `Synced ${formatDateTime(new Date(lastSync))}` : "Never synced"}</span>
        <Button variant="outline" size="sm" disabled={pending || !githubReady} title={githubReady ? undefined : "Set GITHUB_TOKEN to sync"} onClick={() => run(() => syncProjectsAction(), { success: (m) => m })}>
          <RefreshCw className={cn(pending && "animate-spin")} /> Sync GitHub
        </Button>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus /> Add project
        </Button>
      </div>
      {!githubReady && <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">GitHub isn&apos;t connected. Add a fine-grained token as GITHUB_TOKEN to auto-discover your repos (README → Projects hub).</p>}
      {shown.length === 0 ? (
        <EmptyState icon={FolderGit2} title="No projects here" description="Sync GitHub or add one manually." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <ProjectCard key={p.id} p={p} onOpen={() => setOpen(p.id)} />
          ))}
        </div>
      )}
      <Sheet open={Boolean(open)} onOpenChange={(v) => !v && setOpen(null)}>
        <SheetContent className="overflow-y-auto p-5">{open && <ProjectDetail key={open.id} p={open} onDeleted={() => setOpen(null)} />}</SheetContent>
      </Sheet>
      <AddProjectDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}

function launchTarget(p: ProjectView) {
  return p.launchUrl ?? p.deployUrl ?? p.repoUrl;
}

function ProjectCard({ p, onOpen }: { p: ProjectView; onOpen: () => void }) {
  const { run } = useAction();
  const target = launchTarget(p);
  return (
    <Card className="flex flex-col" data-testid="project-card">
      <CardContent className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start gap-2">
          <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
            <p className="flex items-center gap-1.5 truncate font-semibold">
              {p.name}
              {p.isPrivate && <Lock className="size-3 text-muted-foreground" aria-label="Private" />}
            </p>
            {p.description && <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
          </button>
          <NativeSelect aria-label={`Status of ${p.name}`} value={p.status} onChange={(e) => run(() => updateProjectAction(p.id, { status: e.target.value as ProjectStatus }))} className="h-7 w-auto px-1 text-xs">
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase()}
              </option>
            ))}
          </NativeSelect>
        </div>
        {p.stack.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {p.stack.slice(0, 6).map((s) => (
              <Badge key={s} variant="secondary" className="text-[10px]">
                {s}
              </Badge>
            ))}
          </div>
        )}
        <div className="space-y-1 text-xs text-muted-foreground">
          {p.lastCommitAt && (
            <p className="flex items-center gap-1.5 truncate">
              <GitCommitHorizontal className="size-3.5 shrink-0" /> {ago(p.lastCommitAt)}: {p.lastCommitMsg ?? "commit"}
            </p>
          )}
          <p className="flex flex-wrap items-center gap-3">
            {p.openIssues !== null && (
              <span className="flex items-center gap-1">
                <CircleDot className="size-3.5" /> {p.openIssues} open
              </span>
            )}
            {p.deployState && <Badge variant={DEPLOY_VARIANT[p.deployState] ?? "secondary"}>{p.deployState.toLowerCase()}</Badge>}
            {p.source !== "GITHUB" && <Badge variant="outline">{p.source.toLowerCase()}</Badge>}
          </p>
        </div>
        <NextStep p={p} />
        <div className="mt-auto flex gap-2 pt-1">
          {target && (
            <Button asChild size="sm" variant={p.status === "ACTIVE" ? "default" : "outline"}>
              <a href={target} target="_blank" rel="noreferrer">
                <Rocket /> Launch
              </a>
            </Button>
          )}
          {p.repoUrl && (
            <Button asChild size="sm" variant="ghost">
              <a href={p.repoUrl} target="_blank" rel="noreferrer" aria-label={`${p.name} on GitHub`}>
                <GitBranch />
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function NextStep({ p }: { p: ProjectView }) {
  const { run } = useAction();
  const [v, setV] = useState(p.nextStep ?? "");
  return (
    <label className="block text-xs">
      <span className="text-muted-foreground">Next step</span>
      <Input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== (p.nextStep ?? "") && run(() => updateProjectAction(p.id, { nextStep: v || null }), { success: "Next step saved" })}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        placeholder="What's the next move?"
        className="mt-1 h-8 text-sm"
      />
    </label>
  );
}

function ProjectDetail({ p, onDeleted }: { p: ProjectView; onDeleted: () => void }) {
  const { run } = useAction();
  const [notes, setNotes] = useState(p.notes ?? "");
  const [launch, setLaunch] = useState(p.launchUrl ?? "");
  return (
    <div className="space-y-4">
      <div className="pr-8">
        <SheetTitle className="font-heading text-3xl tracking-wide">{p.name}</SheetTitle>
        <SheetDescription className="text-sm text-muted-foreground">{p.description ?? "No description"}</SheetDescription>
      </div>
      <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Repo</dt>
        <dd className="truncate">{p.repoUrl ? <a className="underline" href={p.repoUrl} target="_blank" rel="noreferrer">{p.repoFullName}</a> : "–"}</dd>
        <dt className="text-muted-foreground">Deploy</dt>
        <dd className="truncate">{p.deployUrl ? <a className="underline" href={p.deployUrl} target="_blank" rel="noreferrer">{p.deployUrl.replace(/^https?:\/\//, "")} <ExternalLink className="inline size-3" /></a> : "–"} {p.deployState && `(${p.deployState.toLowerCase()}${p.deployedAt ? `, ${ago(p.deployedAt)}` : ""})`}</dd>
        <dt className="text-muted-foreground">Last commit</dt>
        <dd>{p.lastCommitAt ? `${formatDateTime(new Date(p.lastCommitAt))} · ${p.lastCommitMsg ?? ""}` : "–"}</dd>
        <dt className="text-muted-foreground">Local path</dt>
        <dd className="truncate font-mono text-xs">{p.localPath ?? "–"}</dd>
      </dl>
      <div className="space-y-1.5">
        <Label htmlFor="launch">Launch URL (overrides deploy URL)</Label>
        <Input id="launch" value={launch} onChange={(e) => setLaunch(e.target.value)} onBlur={() => launch !== (p.launchUrl ?? "") && run(() => updateProjectAction(p.id, { launchUrl: launch || null }), { success: "Saved" })} placeholder="https://… or vscode://file/…" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" rows={10} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (p.notes ?? "") && run(() => updateProjectAction(p.id, { notes: notes || null }), { success: "Notes saved" })} placeholder="Decisions, TODOs, credentials location (not the credentials)…" />
      </div>
      {p.source !== "GITHUB" && (
        <Button variant="ghost" className="text-red-400" onClick={() => confirm(`Delete ${p.name}?`) && run(() => deleteProjectAction(p.id), { success: "Project deleted", onSuccess: onDeleted })}>
          <Trash2 /> Delete project
        </Button>
      )}
    </div>
  );
}

function AddProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { pending, run } = useAction();
  const [v, setV] = useState({ name: "", description: "", repoUrl: "", deployUrl: "", stack: "", status: "IDEA" as ProjectStatus, nextStep: "" });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add project</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                createProjectAction({
                  name: v.name,
                  description: v.description || null,
                  repoUrl: v.repoUrl || null,
                  deployUrl: v.deployUrl || null,
                  stack: v.stack.split(",").map((s) => s.trim()).filter(Boolean),
                  status: v.status,
                  nextStep: v.nextStep || null,
                }),
              { success: "Project added", onSuccess: () => onOpenChange(false) },
            );
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="p-name">Name</Label>
            <Input id="p-name" required value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-desc">Description</Label>
            <Input id="p-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-repo">Repo URL</Label>
              <Input id="p-repo" type="url" value={v.repoUrl} onChange={(e) => setV({ ...v, repoUrl: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-deploy">Live URL</Label>
              <Input id="p-deploy" type="url" value={v.deployUrl} onChange={(e) => setV({ ...v, deployUrl: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-stack">Stack</Label>
              <Input id="p-stack" value={v.stack} onChange={(e) => setV({ ...v, stack: e.target.value })} placeholder="Next.js, Supabase" />
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <NativeSelect value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as ProjectStatus })}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.toLowerCase()}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-next">Next step</Label>
            <Input id="p-next" value={v.nextStep} onChange={(e) => setV({ ...v, nextStep: e.target.value })} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
