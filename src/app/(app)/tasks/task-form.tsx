"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { apiFetch, jsonBody } from "@/lib/client-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  TASK_CATEGORIES,
  TASK_CATEGORY_LABELS,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "@/lib/domain";
import { priorityLabel, taskStatusLabel } from "@/components/status-badge";

type Option = { id: string; nameAr?: string; name?: string; code?: string };
type UserOption = { id: string; name: string };

const EMPTY = {
  title: "",
  description: "",
  companyId: "",
  assignedTo: "",
  priority: "MEDIUM",
  status: "TODO",
  category: "GENERAL",
  dueDate: "",
  notes: "",
};

export function TaskForm({
  companies,
  users,
}: {
  companies: Option[];
  users: UserOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const set = (key: keyof typeof EMPTY, value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    const res = await apiFetch("/api/tasks", {
      method: "POST",
      ...jsonBody(form),
      successMessage: "تمت إضافة المهمة",
    });
    setSaving(false);
    if (res.ok) {
      setForm(EMPTY);
      setOpen(false);
      router.refresh();
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> مهمة جديدة
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>إضافة مهمة</DialogTitle>
          <DialogDescription>أسند المهمة لزميل وحدّد موعد إنجازها.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="t-title">عنوان المهمة *</Label>
              <Input
                id="t-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="مثال: إعداد إقرار القيمة المضافة لشهر مارس"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="t-company">شركة العميل</Label>
              <Select value={form.companyId} onValueChange={(v) => set("companyId", v)}>
                <SelectTrigger id="t-company">
                  <SelectValue placeholder="اختياري" />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nameAr ?? c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="t-assignee">مسندة إلى</Label>
              <Select value={form.assignedTo} onValueChange={(v) => set("assignedTo", v)}>
                <SelectTrigger id="t-assignee">
                  <SelectValue placeholder="اختياري" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="t-priority">الأولوية</Label>
              <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                <SelectTrigger id="t-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {priorityLabel(p).label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="t-category">التصنيف</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger id="t-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {TASK_CATEGORY_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="t-due">موعد الإنجاز</Label>
              <Input
                id="t-due"
                type="date"
                value={form.dueDate}
                onChange={(e) => set("dueDate", e.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="t-status">الحالة</Label>
              <Select value={form.status} onValueChange={(v) => set("status", v)}>
                <SelectTrigger id="t-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {taskStatusLabel(s).label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 sm:col-span-2">
              <Label htmlFor="t-desc">الوصف</Label>
              <Textarea
                id="t-desc"
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "جارٍ الحفظ..." : "حفظ المهمة"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
