"use client";
import * as React from "react";
import { Dialog as SheetPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetTitle = SheetPrimitive.Title;
export const SheetDescription = SheetPrimitive.Description;

export function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & { side?: "right" | "left" | "bottom" }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <SheetPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col bg-background shadow-2xl outline-none",
          side === "right" && "inset-y-0 right-0 h-full w-full border-l border-border sm:max-w-md",
          side === "left" && "inset-y-0 left-0 h-full w-72 border-r border-border",
          side === "bottom" && "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-2xl border-t border-border",
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close className="absolute top-4 right-4 rounded-sm opacity-70 hover:opacity-100">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}
