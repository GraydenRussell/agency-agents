import { Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Plain link: the browser handles the download, so it works even before JavaScript loads. */
export function ExportCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your data</CardTitle>
        <CardDescription>Download everything as one JSON file: tasks, goals, calendar, notes and journal, health, money, people, projects, assistant memory, approvals and the activity log. Google tokens and other secrets are never included.</CardDescription>
      </CardHeader>
      <CardContent>
        <a href="/api/export" download className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium hover:bg-accent">
          <Download className="size-4" aria-hidden="true" /> Export my data
        </a>
      </CardContent>
    </Card>
  );
}
