import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { ThemeProvider } from "@/components/shell/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Life OS", template: "%s · Life OS" },
  description: "Grayden's personal operating system: day, business, projects, and an AI assistant.",
  applicationName: "Life OS",
  appleWebApp: { capable: true, title: "Life OS", statusBarStyle: "black-translucent" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#1b1b1c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="dark h-full" suppressHydrationWarning>
      <body className="min-h-full">
        <ThemeProvider>
          <TooltipProvider delayDuration={300}>
            {children}
            <Toaster theme="dark" position="top-center" richColors closeButton />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
