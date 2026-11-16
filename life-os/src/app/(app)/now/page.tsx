import { PageHeader } from "@/components/shell/page-header";
import { AskBox, DoNowList } from "@/components/now/do-now-list";
import { doNowCounts, doNowItems } from "@/lib/services/do-now";

export const metadata = { title: "Do Now" };

export default async function DoNowPage() {
  const items = await doNowItems();
  const c = doNowCounts(items);
  const summary = c.total === 0 ? "You're all caught up." : [c.now && `${c.now} need you right now`, c.today && `${c.today} for today`, c.week && `${c.week} this week`].filter(Boolean).join(" · ");
  return (
    <>
      <PageHeader title="Do Now" description={`Everything that needs you, from every part of Life OS. ${summary}`} />
      <div className="space-y-5">
        <AskBox />
        <DoNowList items={items} />
      </div>
    </>
  );
}
