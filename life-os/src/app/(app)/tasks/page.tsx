import { PageHeader } from "@/components/shell/page-header";
import { Kanban } from "@/components/tasks/kanban";
import { NewTaskForm } from "@/components/tasks/new-task-form";
import { TaskFilters } from "@/components/tasks/task-filters";
import { TaskList } from "@/components/tasks/task-list";
import { listTasks, taskFilterSchema } from "@/lib/services/tasks";
import { pluralize } from "@/lib/utils";

export const metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const sp = await searchParams;
  const pick = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const view = pick("view") === "board" ? "board" : "list";
  const filter = taskFilterSchema.safeParse({ q: pick("q"), area: pick("area"), status: view === "board" ? (pick("status") ?? "ALL") : pick("status"), priority: pick("priority"), due: pick("due"), goalId: pick("goal") });
  const tasks = await listTasks(filter.success ? filter.data : {});
  const boardTasks = view === "board" ? tasks.filter((t) => t.status !== "CANCELED") : tasks;

  return (
    <>
      <PageHeader title="Tasks" description={pluralize(tasks.length, "task")} />
      <div className="mb-4">
        <NewTaskForm />
      </div>
      <TaskFilters />
      {view === "board" ? <Kanban tasks={boardTasks} /> : <TaskList tasks={tasks} emptyTitle="No tasks match" emptyDescription="Try clearing filters, or add one above." />}
    </>
  );
}
