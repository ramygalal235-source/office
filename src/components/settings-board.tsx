"use client";

// ===== شاشة الإعدادات: المكتب، المستخدمون، الأمان، الذكاء المستندي،
// النسخ الاحتياطي، وحالة النظام =====
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Database,
  Download,
  FileWarning,
  KeyRound,
  ScanText,
  ServerCog,
  ShieldCheck,
  TestDiag,
  Upload,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiFetch, jsonBody } from "@/lib/client-api";

export interface OfficeBrand {
  name: string;
  subtitle: string;
  primary: string;
}

interface OcrState {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  available: boolean;
}

interface Stats {
  pending: number;
  running: number;
  done: number;
  dead: number;
  failed: number;
  total: number;
  automationRate: number;
}

interface ChainState {
  ok: boolean;
  checked: number;
  breaks: number;
}

interface Counts {
  events: number;
  jobs: number;
  docs: number;
  invoices: number;
  companies: number;
  users: number;
}

export interface UserInfo {
  id: string;
  username: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  isActive: boolean;
  lastLogin: string | null;
  createdAt: string;
}

const ROLE_LABELS: Record<string, string> = { admin: "مدير", accountant: "محاسب", viewer: "مشاهد" };
const PROVIDER_LABELS: Record<string, string> = { ollama: "Ollama (محلي)", zai: "Z.AI سحابي", custom: "مخصص" };

export function SettingsBoard({
  brand,
  ocr: initialOcr,
  stats,
  chain,
  counts,
  lastBackupAt,
  initialUsers,
}: {
  brand: OfficeBrand;
  ocr: OcrState;
  stats: Stats;
  chain: ChainState;
  counts: Counts;
  lastBackupAt: string | null;
  initialUsers: UserInfo[];
}) {
  const router = useRouter();

  // ---------------- المكتب ----------------
  const [officeName, setOfficeName] = useState(brand.name);
  const [officeSubtitle, setOfficeSubtitle] = useState(brand.subtitle);
  const [savingOffice, setSavingOffice] = useState(false);

  async function saveOffice() {
    setSavingOffice(true);
    const res = await apiFetch("/api/settings", {
      method: "PUT",
      ...jsonBody({ name: officeName, subtitle: officeSubtitle }),
      successMessage: "تم حفظ بيانات المكتب",
    });
    setSavingOffice(false);
    if (res.ok) router.refresh();
  }

  // ---------------- المستخدمون ----------------
  const [users, setUsers] = useState<UserInfo[]>(initialUsers);
  const [userDialogOpen, setUserDialogOpen] = useState(false);
  const [newUser, setNewUser] = useState({ username: "", name: "", password: "", role: "accountant", email: "" });
  const [creatingUser, setCreatingUser] = useState(false);

  function refreshUsers() {
    apiFetch<{ users: UserInfo[] }>("/api/users", { silent: true }).then((r) => {
      if (r.ok && r.data) setUsers(r.data.users);
    });
  }

  async function createUser() {
    setCreatingUser(true);
    const res = await apiFetch("/api/users", {
      method: "POST",
      ...jsonBody(newUser),
      successMessage: "تم إنشاء المستخدم",
    });
    setCreatingUser(false);
    if (res.ok) {
      setUserDialogOpen(false);
      setNewUser({ username: "", name: "", password: "", role: "accountant", email: "" });
      refreshUsers();
    }
  }

  async function updateUser(id: string, data: Record<string, unknown>, msg?: string) {
    const res = await apiFetch(`/api/users/${id}`, { method: "PUT", ...jsonBody(data), successMessage: msg });
    if (res.ok) refreshUsers();
  }

  async function resetPassword(u: UserInfo) {
    const pw = window.prompt(`كلمة مرور جديدة لـ ${u.name} (${u.username}) — 6 أحرف على الأقل:`);
    if (pw === null) return;
    await updateUser(u.id, { password: pw }, "تمت إعادة تعيين كلمة المرور");
  }

  // ---------------- الأمان ----------------
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [changingPw, setChangingPw] = useState(false);

  async function changePassword() {
    if (pw.next !== pw.confirm) return toast.error("تأكيد كلمة المرور غير مطابق");
    setChangingPw(true);
    const res = await apiFetch("/api/auth/password", {
      method: "POST",
      ...jsonBody({ currentPassword: pw.current, newPassword: pw.next }),
      successMessage: "تم تغيير كلمة المرور",
    });
    setChangingPw(false);
    if (res.ok) setPw({ current: "", next: "", confirm: "" });
  }

  // ---------------- الذكاء المستندي ----------------
  const [ocr, setOcr] = useState<OcrState>(initialOcr);
  const [savingOcr, setSavingOcr] = useState(false);
  const [testingOcr, setTestingOcr] = useState(false);
  const [ocrTest, setOcrTest] = useState<{ ok: boolean; message: string; models: string[] } | null>(null);

  async function saveOcr() {
    setSavingOcr(true);
    const res = await apiFetch<{ effective: OcrState }>("/api/settings/ocr", {
      method: "PUT",
      ...jsonBody(ocr),
      successMessage: "تم حفظ إعدادات الاستخراج",
    });
    setSavingOcr(false);
    if (res.ok && res.data) {
      setOcr({ ...res.data.effective, available: false }); // الحالة تُعرف بزر الاختبار
      setOcrTest(null);
    }
  }

  async function testOcr() {
    // نحفظ أولًا ليجري الاختبار على الإعدادات الجديدة
    setSavingOcr(true);
    const save = await apiFetch("/api/settings/ocr", { method: "PUT", ...jsonBody(ocr), silent: true });
    setSavingOcr(false);
    if (!save.ok) return;
    setTestingOcr(true);
    const res = await apiFetch<{ ok: boolean; message: string; models: string[] }>("/api/settings/ocr/test", {
      method: "POST",
    });
    setTestingOcr(false);
    if (res.ok && res.data) setOcrTest(res.data);
  }

  // ---------------- النسخ الاحتياطي ----------------
  const [exporting, setExporting] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function exportBackup() {
    setExporting(true);
    try {
      const res = await fetch("/api/backup");
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        toast.error(j?.error ?? "فشل إنشاء النسخة الاحتياطية");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dafatir-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("تم تنزيل النسخة الاحتياطية");
      router.refresh();
    } finally {
      setExporting(false);
    }
  }

  async function importBackup() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setRestoring(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/backup", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        toast.error(json?.error ?? "تعذّر استلام النسخة");
        return;
      }
      toast.success(json.data?.message ?? "تم استلام النسخة");
      router.refresh();
    } finally {
      setRestoring(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">الإعدادات</h1>
        <p className="mt-1 text-sm text-muted-foreground">إدارة المكتب والمستخدمين والأمان والنسخ الاحتياطي</p>
      </div>

      <Tabs defaultValue="office">
        <TabsList className="flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger value="office" className="gap-1.5"><ServerCog className="size-3.5" />المكتب</TabsTrigger>
          <TabsTrigger value="users" className="gap-1.5"><Users className="size-3.5" />المستخدمون</TabsTrigger>
          <TabsTrigger value="security" className="gap-1.5"><ShieldCheck className="size-3.5" />الأمان</TabsTrigger>
          <TabsTrigger value="ocr" className="gap-1.5"><ScanText className="size-3.5" />الذكاء المستندي</TabsTrigger>
          <TabsTrigger value="backup" className="gap-1.5"><Database className="size-3.5" />النسخ الاحتياطي</TabsTrigger>
          <TabsTrigger value="status" className="gap-1.5"><Activity className="size-3.5" />حالة النظام</TabsTrigger>
        </TabsList>

        {/* ================= المكتب ================= */}
        <TabsContent value="office">
          <Card>
            <CardHeader>
              <CardTitle>بيانات المكتب</CardTitle>
              <CardDescription>تظهر هذه البيانات في واجهة النظام وعند الطباعة والتقارير</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>اسم المكتب</Label>
                <Input value={officeName} onChange={(e) => setOfficeName(e.target.value)} maxLength={80} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>الوصف</Label>
                <Input value={officeSubtitle} onChange={(e) => setOfficeSubtitle(e.target.value)} maxLength={120} />
              </div>
              <div className="flex justify-start">
                <Button onClick={saveOffice} disabled={savingOffice}>{savingOffice ? "جارٍ الحفظ..." : "حفظ"}</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= المستخدمون ================= */}
        <TabsContent value="users">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>المستخدمون</CardTitle>
                <CardDescription>أدوار: مدير (كل شيء) — محاسب (بدون حذف) — مشاهد (قراءة فقط)</CardDescription>
              </div>
              <Button size="sm" onClick={() => setUserDialogOpen(true)}><UserPlus className="size-3.5" />مستخدم جديد</Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="pb-2 text-start font-medium">المستخدم</th>
                      <th className="pb-2 text-start font-medium">الدور</th>
                      <th className="pb-2 text-start font-medium">الحالة</th>
                      <th className="pb-2 text-start font-medium">آخر دخول</th>
                      <th className="pb-2 text-end font-medium">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-b last:border-0">
                        <td className="py-2.5">
                          <div className="font-medium">{u.name}</div>
                          <div className="text-xs text-muted-foreground" dir="ltr">@{u.username}</div>
                        </td>
                        <td className="py-2.5">
                          <Select value={u.role} onValueChange={(v) => updateUser(u.id, { role: v }, "تم تغيير الدور")}>
                            <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">مدير</SelectItem>
                              <SelectItem value="accountant">محاسب</SelectItem>
                              <SelectItem value="viewer">مشاهد</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2.5">
                          <Badge variant={u.isActive ? "success" : "muted"}>{u.isActive ? "نشط" : "معطل"}</Badge>
                        </td>
                        <td className="py-2.5 text-xs text-muted-foreground">{u.lastLogin ? new Date(u.lastLogin).toLocaleDateString("ar-EG") : "—"}</td>
                        <td className="py-2.5">
                          <div className="flex justify-end gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => resetPassword(u)}><KeyRound className="size-3.5" /></Button>
                            <Button
                              size="sm"
                              variant={u.isActive ? "destructive" : "outline"}
                              onClick={() => updateUser(u.id, { isActive: !u.isActive }, u.isActive ? "تم تعطيل المستخدم" : "تم تفعيل المستخدم")}
                            >
                              {u.isActive ? "تعطيل" : "تفعيل"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= الأمان ================= */}
        <TabsContent value="security">
          <Card className="max-w-lg">
            <CardHeader>
              <CardTitle>تغيير كلمة المرور</CardTitle>
              <CardDescription>كلمة المرور الحالية والمتجددة — 6 أحرف على الأقل</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>كلمة المرور الحالية</Label>
                <Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>كلمة المرور الجديدة</Label>
                <Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>تأكيد كلمة المرور الجديدة</Label>
                <Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" />
              </div>
              <div className="flex justify-start">
                <Button onClick={changePassword} disabled={changingPw || !pw.current || !pw.next}>{changingPw ? "جارٍ التغيير..." : "تغيير كلمة المرور"}</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= الذكاء المستندي ================= */}
        <TabsContent value="ocr">
          <Card>
            <CardHeader>
              <CardTitle>استخراج البيانات من الوثائق</CardTitle>
              <CardDescription>
                {ocr.available ? "الخدمة متصلة حاليًا" : "الخدمة غير متصلة حاليًا"} — كل المزودين يتكلمون بروتوكول OpenAI-compatible
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>المزود</Label>
                  <Select value={ocr.provider} onValueChange={(v) => setOcr({ ...ocr, provider: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ollama">{PROVIDER_LABELS.ollama}</SelectItem>
                      <SelectItem value="zai">{PROVIDER_LABELS.zai}</SelectItem>
                      <SelectItem value="custom">{PROVIDER_LABELS.custom}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>النموذج</Label>
                  <Input value={ocr.model} onChange={(e) => setOcr({ ...ocr, model: e.target.value })} dir="ltr" placeholder="qwen2.5vl:7b" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>عنوان الخادم</Label>
                <Input value={ocr.baseUrl} onChange={(e) => setOcr({ ...ocr, baseUrl: e.target.value })} dir="ltr" placeholder="http://127.0.0.1:11434/v1" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>مفتاح API (اختياري — غير مطلوب مع Ollama المحلي)</Label>
                <Input type="password" value={ocr.apiKey} onChange={(e) => setOcr({ ...ocr, apiKey: e.target.value })} dir="ltr" placeholder="••••••••" />
              </div>

              {ocrTest && (
                <div
                  className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
                    ocrTest.ok ? "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
                  }`}
                >
                  <Play className="mt-0.5 size-4 shrink-0" />
                  <div>
                    <p>{ocrTest.message}</p>
                    {ocrTest.models.length > 1 && (
                      <p className="mt-1 text-xs opacity-80">نماذج أخرى متاحة: {ocrTest.models.filter((m) => m !== ocr.model).slice(0, 4).join("، ")}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button onClick={testOcr} disabled={testingOcr}>{testingOcr ? "جارٍ الاختبار..." : "اختبار الاتصال"}</Button>                <Button variant="outline" onClick={saveOcr} disabled={savingOcr}>{savingOcr ? "جارٍ الحفظ..." : "حفظ الإعدادات"}</Button>
              </div>

              <Separator />
              <p className="text-xs leading-relaxed text-muted-foreground">
                التوصية: <b>Ollama محليًا</b> (مجاني، بلا إنترنت، الخصوصية الكاملة لوثائق العملاء). تُثبَّت Ollama مرة
                واحدة من ollama.com ثم يُحمَّل النموذج: <code dir="ltr">ollama pull qwen2.5vl:7b</code>. عند التغيير إلى
                مزود سحابي يُملأ العنوان والمفتاح ويُختبر الاتصال.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= النسخ الاحتياطي ================= */}
        <TabsContent value="backup">
          <Card>
            <CardHeader>
              <CardTitle>النسخ الاحتياطي والاستعادة</CardTitle>
              <CardDescription>النسخة الكاملة: قاعدة البيانات + كل الوثائق المحفوظة. احتفظ بها على فلاشة أو قرص خارجي.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {lastBackupAt && (
                <p className="text-sm text-muted-foreground">
                  آخر نسخة احتياطية: <span className="font-medium text-foreground">{new Date(lastBackupAt).toLocaleString("ar-EG")}</span>
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={exportBackup} disabled={exporting}>
                  <Download className="size-4" />
                  {exporting ? "جارٍ الإنشاء..." : "تنزيل نسخة احتياطية"}
                </Button>
                <input ref={fileRef} type="file" accept=".zip" className="hidden" />
                <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={restoring}>
                  <Upload className="size-4" />
                  {restoring ? "جارٍ الاستلام..." : "استعادة من ملف"}
                </Button>
              </div>
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>
                  الاستعادة تُطبَّق عند <b>الإقلاع التالي</b>: تُستلم النسخ هنا، ثم أُغلق البرنامج وأُعيد تشغيله.
                  الاستعادة تستبدل كل البيانات الحالية بما في النسخة.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ================= حالة النظام ================= */}
        <TabsContent value="status">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader><CardTitle className="text-base">سجل الأحداث (سلسلة التجزئة)</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <FileWarning className={`size-4 ${chain.ok ? "text-emerald-600" : "text-red-600"}`} />
                  <Badge variant={chain.ok ? "success" : "destructive"}>{chain.ok ? "سلسلة سليمة" : `توجد انكسارات (${chain.breaks})`}</Badge>
                </div>
                <p className="text-muted-foreground">{counts.events} حدثًا مسجلًا — فُحص أحدث {chain.checked}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">طابور الأتمتة</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">بانتظار التنفيذ</span><span>{stats.pending}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">قيد التنفيذ</span><span>{stats.running}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">مكتمل</span><span>{stats.done}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">متعثر (يتطلب مراجعة)</span><span className={stats.dead > 0 ? "font-bold text-red-600" : ""}>{stats.dead}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">معدل الإنجاز</span><span>{stats.automationRate}%</span></div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">المحتوى</CardTitle></CardHeader>
              <CardContent className="flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">شركات العملاء</span><span>{counts.companies}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">المستندات المالية</span><span>{counts.invoices}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">الوثائق المحفوظة</span><span>{counts.docs}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">المستخدمون</span><span>{counts.users}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">مهام الأتمتة</span><span>{counts.jobs}</span></div>
              </CardContent>
            </Card>
          </div>
          <p className="text-xs text-muted-foreground">
            كل عملية في النظام مسجلة في سجل الأحداث بسلسلة تجزئة — لا يمكن تعديل أو حذف أي حدث دون كسر السلسلة وكشفه.
            البيانات محفوظة محليًا على هذا الجهاز فقط.
          </p>
        </TabsContent>
      </Tabs>

      {/* ---------------- نافذة مستخدم جديد ---------------- */}
      <Dialog open={userDialogOpen} onOpenChange={setUserDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>مستخدم جديد</DialogTitle>
            <DialogDescription>الدور يحدد الصلاحيات — مدير كل شيء، محاسب بدون حذف، مشاهد قراءة فقط</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>اسم المستخدم</Label>
                <Input value={newUser.username} onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} dir="ltr" placeholder="ahmed" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>الاسم الكامل</Label>
                <Input value={newUser.name} onChange={(e) => setNewUser({ ...newUser, name: e.target.value })} placeholder="أحمد محمد" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>كلمة المرور</Label>
                <Input type="password" value={newUser.password} onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} dir="ltr" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>الدور</Label>
                <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">مدير</SelectItem>
                    <SelectItem value="accountant">محاسب</SelectItem>
                    <SelectItem value="viewer">مشاهد</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>البريد (اختياري)</Label>
              <Input type="email" value={newUser.email} onChange={(e) => setNewUser({ ...newUser, email: e.target.value })} dir="ltr" placeholder="ahmed@office.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUserDialogOpen(false)}>إلغاء</Button>
            <Button onClick={createUser} disabled={creatingUser || !newUser.username || !newUser.name || !newUser.password}>
              {creatingUser ? "جارٍ الإنشاء..." : "إنشاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
