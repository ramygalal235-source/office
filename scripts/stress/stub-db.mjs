// ===== محاكاة Prisma في الذاكرة لاختبار الضغوط =====
// تنفّذ فقط ما تستدعيه الوحدات الفعلية (queue / event-log / rules)،
// وتحاكي SQLite كاتبًا واحدًا: المعاملات لا تتراكب (mutex) تمامًا كما
// تفعل قفزة الكتابة في SQLite — وهذا بالضبط ما يعتمد عليه تسلسل السلسلة.
import crypto from "node:crypto";

let idCounter = 0;
const newId = () => `mock_${++idCounter}_${crypto.randomBytes(3).toString("hex")}`;

const stores = {
  job: new Map(),
  eventLog: new Map(),
  notification: new Map(),
  automationRule: new Map(),
};

function matchesWhere(row, where) {
  if (!where) return true;
  for (const [key, cond] of Object.entries(where)) {
    if (cond instanceof Date) {
      if (row[key] !== cond) return false;
      continue;
    }
    if (cond !== null && typeof cond === "object" && !Array.isArray(cond)) {
      if (cond.in !== undefined && !cond.in.includes(row[key])) return false;
      if (cond.not !== undefined && row[key] === cond.not) return false;
      if (cond.not !== null && typeof cond.not === "object" && "not" in cond.not) {
        if (!matchesWhere(row, cond.not)) return false;
      }
      if (cond.lt !== undefined && !(row[key] != null && row[key] < cond.lt)) return false;
      if (cond.lte !== undefined && !(row[key] != null && row[key] <= cond.lte)) return false;
      if (cond.gt !== undefined && !(row[key] != null && row[key] > cond.gt)) return false;
      if (cond.gte !== undefined && !(row[key] != null && row[key] >= cond.gte)) return false;
      if (cond.contains !== undefined && !(typeof row[key] === "string" && row[key].includes(cond.contains))) return false;
      continue;
    }
    if (cond === null || cond === undefined) {
      if (row[key] !== null && row[key] !== undefined) return false;
      continue;
    }
    if (row[key] !== cond) return false;
  }
  return true;
}

function compare(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return a < b ? -1 : 1;
}

function sortRows(rows, orderBy) {
  if (!orderBy) return rows;
  const specs = (Array.isArray(orderBy) ? orderBy : [orderBy]).map((o) => Object.entries(o)[0]);
  return [...rows].sort((a, b) => {
    for (const [f, dir] of specs) {
      const c = compare(a[f], b[f]) * (dir === "desc" ? -1 : 1);
      if (c !== 0) return c;
    }
    return 0;
  });
}

function applyData(row, data) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && "increment" in v) row[k] = (row[k] ?? 0) + v.increment;
    else row[k] = v;
  }
}

function lookup(store, where) {
  const key = Object.keys(where)[0];
  const val = where[key];
  if (key === "id") {
    const r = store.get(val);
    return r ? { ...r } : null;
  }
  const row = [...store.values()].find((r) => r[key] === val);
  return row ? { ...row } : null;
}

// قيم الافتراضات من @default في schema.prisma — يجب أن تطابق النموذج حرفيًا
const DEFAULTS = {
  job: { payload: "{}", status: "PENDING", priority: 100, attempts: 0, maxAttempts: 5, runAt: () => new Date() },
  eventLog: { at: () => new Date(), actor: "system", actorType: "system", entityId: "", prevHash: "" },
  notification: { kind: "INFO", severity: "info" },
  automationRule: { trigger: "EVENT", enabled: true, priority: 100, runCount: 0, errorCount: 0 },
};

function resolveDefaults(defs) {
  const out = {};
  for (const [k, v] of Object.entries(defs ?? {})) out[k] = typeof v === "function" ? v() : v;
  return out;
}

function makeDelegate(name) {
  const store = stores[name];
  return {
    async create({ data }) {
      const row = { id: newId(), createdAt: new Date(), updatedAt: new Date(), ...resolveDefaults(DEFAULTS[name]), ...data };
      store.set(row.id, row);
      return { ...row };
    },
    async findUnique({ where }) {
      return lookup(store, where);
    },
    async findFirst({ where, orderBy } = {}) {
      const rows = sortRows([...store.values()].filter((r) => matchesWhere(r, where)), orderBy);
      return rows[0] ? { ...rows[0] } : null;
    },
    async findMany({ where, orderBy, take, skip, select } = {}) {
      let rows = sortRows([...store.values()].filter((r) => matchesWhere(r, where)), orderBy);
      if (skip) rows = rows.slice(skip);
      if (take != null) rows = rows.slice(0, take);
      return rows.map((r) => {
        if (!select) return { ...r };
        const out = {};
        for (const [k, on] of Object.entries(select)) if (on) out[k] = r[k];
        return out;
      });
    },
    async count({ where } = {}) {
      return [...store.values()].filter((r) => matchesWhere(r, where)).length;
    },
    async update({ where, data }) {
      // يجب تعديل الصف المخزّن نفسه (لا نسخة) — update في Prisma يُلحظ فورًا
      const key = Object.keys(where)[0];
      const val = where[key];
      const row = key === "id" ? store.get(val) : [...store.values()].find((r) => r[key] === val);
      if (!row) throw new Error(`update: ${name} لا يوجد`);
      applyData(row, data);
      row.updatedAt = new Date();
      return { ...row };
    },
    async updateMany({ where, data }) {
      let count = 0;
      for (const row of store.values()) if (matchesWhere(row, where)) { applyData(row, data); count++; }
      return { count };
    },
    async delete({ where }) {
      const r = lookup(store, where);
      if (!r) throw new Error(`delete: ${name} لا يوجد`);
      store.delete(r.id);
      return r;
    },
  };
}

// قفل واحد للكتابة: لا تَتراكم معاملتان أبدًا (نموذج SQLite)
let txTail = Promise.resolve();
function transaction(fn) {
  const run = async () => fn(mock);
  const result = txTail.then(run, run);
  txTail = result.then(() => undefined, () => undefined);
  return result;
}

const mock = {
  $transaction: transaction,
  $queryRaw: async () => [],
  $disconnect: async () => {},
  eventLog: makeDelegate("eventLog"),
  job: makeDelegate("job"),
  notification: makeDelegate("notification"),
  automationRule: makeDelegate("automationRule"),
};

export const db = mock;
export function __stores() { return stores; }
export function __reset() { for (const s of Object.values(stores)) s.clear(); idCounter = 0; }
