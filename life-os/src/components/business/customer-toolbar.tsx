"use client";
import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/ui/use-action";
import { createCustomerAction, syncHousecallAction } from "@/app/(app)/business/actions";
import { cn } from "@/lib/utils";

export function CustomerToolbar({ q, housecallReady }: { q: string; housecallReady: boolean }) {
  const router = useRouter();
  const sync = useAction();
  const [adding, setAdding] = useState(false);
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <form action="/business/customers" className="flex w-full gap-2 sm:w-auto sm:flex-1" role="search">
        <Input name="q" defaultValue={q} placeholder="Search name, address, phone, email" aria-label="Search customers" className="min-w-0 flex-1 sm:max-w-sm" />
        <Button type="submit" variant="outline">Search</Button>
      </form>
      {housecallReady && (
        <Button variant="outline" disabled={sync.pending} onClick={() => sync.run(() => syncHousecallAction(), { success: (m) => m })}>
          <RefreshCw className={cn(sync.pending && "animate-spin")} /> Sync Housecall Pro
        </Button>
      )}
      <Button onClick={() => setAdding(true)}>
        <Plus /> Customer
      </Button>
      <AddCustomerDialog open={adding} onOpenChange={setAdding} onCreated={(id) => router.push(`/business/customers/${id}`)} />
    </div>
  );
}

function AddCustomerDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (id: string) => void }) {
  const { pending, run } = useAction();
  const [v, setV] = useState({ name: "", phone: "", email: "", address: "", city: "" });
  const field = (k: keyof typeof v, label: string, type = "text") => (
    <div className="space-y-1.5">
      <Label htmlFor={`c-${k}`}>{label}</Label>
      <Input id={`c-${k}`} type={type} required={k === "name"} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
    </div>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add customer</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => createCustomerAction(v), { success: "Customer added", onSuccess: (id) => { onOpenChange(false); onCreated(id); } });
          }}
        >
          {field("name", "Name")}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {field("phone", "Phone", "tel")}
            {field("email", "Email", "email")}
            {field("address", "Street address")}
            {field("city", "City")}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>Add customer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
