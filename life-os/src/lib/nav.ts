import {
  Activity,
  Bot,
  Briefcase,
  CalendarDays,
  CheckSquare,
  FolderGit2,
  HeartPulse,
  Inbox,
  LayoutDashboard,
  Repeat,
  NotebookPen,
  PlugZap,
  Settings,
  ShieldCheck,
  Sun,
  Target,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Second key of the "g <key>" navigation chord. */
  chord?: string;
  /** Shown in the phone bottom bar. */
  mobile?: boolean;
  group: "main" | "life" | "system";
};

export const NAV: NavItem[] = [
  { href: "/today", label: "Today", icon: Sun, chord: "h", mobile: true, group: "main" },
  { href: "/calendar", label: "Calendar", icon: CalendarDays, chord: "c", mobile: true, group: "main" },
  { href: "/tasks", label: "Tasks", icon: CheckSquare, chord: "t", mobile: true, group: "main" },
  { href: "/goals", label: "Goals", icon: Target, chord: "g", group: "main" },
  { href: "/routines", label: "Routines & Habits", icon: Repeat, chord: "r", group: "main" },
  { href: "/inbox", label: "Inbox", icon: Inbox, chord: "i", mobile: true, group: "main" },
  { href: "/assistant", label: "Assistant", icon: Bot, chord: "a", group: "main" },
  { href: "/business", label: "Business", icon: Briefcase, chord: "b", group: "main" },
  { href: "/dashboard", label: "Rapid Dashboard", icon: LayoutDashboard, chord: "d", group: "main" },
  { href: "/projects", label: "Projects", icon: FolderGit2, chord: "p", group: "main" },
  { href: "/notes", label: "Notes & Journal", icon: NotebookPen, chord: "n", group: "life" },
  { href: "/health", label: "Health", icon: HeartPulse, chord: "e", group: "life" },
  { href: "/money", label: "Money", icon: Wallet, chord: "m", group: "life" },
  { href: "/people", label: "People", icon: Users, chord: "o", group: "life" },
  { href: "/approvals", label: "Approvals", icon: ShieldCheck, chord: "v", group: "system" },
  { href: "/activity", label: "Activity Log", icon: Activity, chord: "l", group: "system" },
  { href: "/settings", label: "Settings", icon: Settings, chord: "s", group: "system" },
  { href: "/setup", label: "Setup", icon: PlugZap, chord: "u", group: "system" },
];

export const NAV_GROUP_LABELS: Record<NavItem["group"], string> = {
  main: "Run the day",
  life: "Life",
  system: "System",
};
