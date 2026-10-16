import { PageHeader } from "@/components/shell/page-header";
import { GoalBoard, type GoalNodeView } from "@/components/goals/goal-board";
import { goalTree, type GoalNode } from "@/lib/services/goals";

export const metadata = { title: "Goals" };

function toView(n: GoalNode): GoalNodeView {
  return {
    ...n,
    periodStart: n.periodStart.toISOString().slice(0, 10),
    periodEnd: n.periodEnd.toISOString().slice(0, 10),
    children: n.children.map(toView),
  };
}

export default async function GoalsPage() {
  const tree = await goalTree();
  return (
    <>
      <PageHeader title="Goals" description="Yearly → quarterly → weekly. Link tasks to goals to drive progress." />
      <GoalBoard tree={tree.map(toView)} />
    </>
  );
}
