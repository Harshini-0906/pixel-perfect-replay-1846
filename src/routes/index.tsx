import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, Clock, FileText, LayoutDashboard, Scale, Workflow } from "lucide-react";
import { CASES, DEMO_DOCS, REGIONS, TODAY, TODAY_DATE } from "@/lib/mock-data";
import {
  RULES, STAGE_LABEL, docValidity, slaStatus, transition,
  type Action, type AppType, type Role, type Stage, type SlaStatus,
} from "@/lib/workflow";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ApprovalFlow AI — AICTE approval workflow" },
      { name: "description", content: "Prototype for routing, deadline tracking and compliance of AICTE institution approvals." },
      { property: "og:title", content: "ApprovalFlow AI — AICTE approval workflow" },
      { property: "og:description", content: "Routing, deadlines, compliance checklists and dashboards for AICTE approvals." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

type Tab = "dashboard" | "case" | "rules";

const SLA_STYLE: Record<SlaStatus, string> = {
  on_track: "bg-success/15 text-success",
  due_soon: "bg-warning/20 text-accent-foreground",
  overdue: "bg-destructive/15 text-destructive",
  escalated: "bg-destructive text-destructive-foreground",
};
const SLA_LABEL: Record<SlaStatus, string> = { on_track: "On track", due_soon: "Due soon", overdue: "Overdue", escalated: "Escalated" };

function Index() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const nav: { id: Tab; label: string; icon: typeof Workflow }[] = [
    { id: "dashboard", label: "Pendency dashboard", icon: LayoutDashboard },
    { id: "case", label: "Demo case", icon: FileText },
    { id: "rules", label: "Rule engine", icon: Scale },
  ];
  return (
    <div className="flex min-h-screen font-sans">
      <aside className="hidden w-64 shrink-0 flex-col bg-sidebar p-6 text-sidebar-foreground md:flex">
        <div className="flex items-center gap-2">
          <Workflow className="h-6 w-6 text-sidebar-primary" />
          <span className="font-display text-xl font-semibold">ApprovalFlow AI</span>
        </div>
        <p className="mt-1 text-xs opacity-70">AICTE approval process · APH 2024-27</p>
        <nav className="mt-10 space-y-1">
          {nav.map((n) => (
            <button key={n.id} onClick={() => setTab(n.id)}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition ${tab === n.id ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60"}`}>
              <n.icon className="h-4 w-4" /> {n.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto font-mono text-xs opacity-60">Today: {TODAY_DATE}</div>
      </aside>
      <main className="flex-1 overflow-x-hidden">
        <div className="flex gap-2 border-b border-border p-3 md:hidden">
          {nav.map((n) => (
            <button key={n.id} onClick={() => setTab(n.id)} className={`rounded px-3 py-1 text-sm ${tab === n.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{n.label}</button>
          ))}
        </div>
        <div className="mx-auto max-w-6xl p-6 md:p-10">
          {tab === "dashboard" && <Dashboard />}
          {tab === "case" && <DemoCase />}
          {tab === "rules" && <Rules />}
        </div>
      </main>
    </div>
  );
}

function Header({ kicker, title, sub }: { kicker: string; title: string; sub?: string }) {
  return (
    <header className="mb-8">
      <p className="font-mono text-xs uppercase tracking-widest text-accent">{kicker}</p>
      <h1 className="mt-1 font-display text-3xl font-semibold md:text-4xl">{title}</h1>
      {sub && <p className="mt-2 max-w-2xl text-muted-foreground">{sub}</p>}
    </header>
  );
}

function Dashboard() {
  const [region, setRegion] = useState("All");
  const [q, setQ] = useState("");
  const rows = useMemo(() => CASES.map((c) => ({ ...c, sla: slaStatus(c.stageStartDay, c.slaDays, TODAY) })), []);
  const filtered = rows.filter((r) => (region === "All" || r.region === region) && (q === "" || `${r.id} ${r.institution}`.toLowerCase().includes(q.toLowerCase())));
  const byRegion = REGIONS.map((reg) => ({ region: reg, cases: rows.filter((r) => r.region === reg).length, overdue: rows.filter((r) => r.region === reg && (r.sla.status === "overdue" || r.sla.status === "escalated")).length }));
  const stages: Stage[] = ["Scrutiny", "Deficiency", "ReScrutiny", "EVC", "Recommendation", "SAC_SHC", "Decision"];
  const byStage = stages.map((s) => {
    const inS = filtered.filter((r) => r.stage === s);
    return { s, n: inS.length, avg: inS.length ? Math.round(inS.reduce((a, r) => a + r.sla.pct, 0) / inS.length) : 0 };
  });
  const overdue = filtered.filter((r) => r.sla.status === "overdue" || r.sla.status === "escalated");

  return (
    <>
      <Header kicker="Officer view" title="Pendency across regions" sub="Live status of every application by stage, with SLA breaches and escalations." />
      <div className="grid gap-4 sm:grid-cols-4">
        {[["Open cases", filtered.length, Clock], ["Overdue", overdue.length, AlertTriangle], ["Escalated", filtered.filter((r) => r.sla.status === "escalated").length, AlertTriangle], ["In EVC", filtered.filter((r) => r.stage === "EVC").length, CheckCircle2]].map(([l, v, I]) => {
          const Icon = I as typeof Clock;
          return (
            <div key={l as string} className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center justify-between text-sm text-muted-foreground">{l as string}<Icon className="h-4 w-4" /></div>
              <div className="mt-2 font-display text-4xl font-semibold">{v as number}</div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <section className="rounded-lg border border-border bg-card p-5 lg:col-span-3">
          <h2 className="font-semibold">Cases by region</h2>
          <div className="mt-4 h-64">
            <ResponsiveContainer>
              <BarChart data={byRegion}>
                <XAxis dataKey="region" fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                <Tooltip />
                <Bar dataKey="cases" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="overdue" fill="var(--chart-4)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
          <h2 className="font-semibold">Bottlenecks by stage</h2>
          <p className="text-xs text-muted-foreground">Average % of time limit used</p>
          <ul className="mt-4 space-y-3">
            {byStage.map((b) => (
              <li key={b.s}>
                <div className="flex justify-between text-sm"><span>{STAGE_LABEL[b.s]} <span className="text-muted-foreground">({b.n})</span></span><span className="font-mono">{b.avg}%</span></div>
                <div className="mt-1 h-2 rounded bg-muted"><div className={`h-2 rounded ${b.avg > 100 ? "bg-destructive" : b.avg >= 75 ? "bg-warning" : "bg-success"}`} style={{ width: `${Math.min(b.avg, 200) / 2}%` }} /></div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="mt-6 rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <h2 className="mr-auto font-semibold">All cases</h2>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search case or institution" className="rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
          <select value={region} onChange={(e) => setRegion(e.target.value)} className="rounded-md border border-input bg-background px-3 py-1.5 text-sm">
            <option>All</option>{REGIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div className="max-h-96 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs uppercase text-muted-foreground">
              <tr>{["Case", "Institution", "Type", "Region", "Stage", "Assignee", "Time limit"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody>
              {filtered.sort((a, b) => b.sla.pct - a.sla.pct).map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2 font-mono text-xs">{r.id}</td>
                  <td className="px-4 py-2">{r.institution}</td>
                  <td className="px-4 py-2 text-muted-foreground">{RULES[r.type].label}</td>
                  <td className="px-4 py-2">{r.region}</td>
                  <td className="px-4 py-2">{STAGE_LABEL[r.stage]}</td>
                  <td className="px-4 py-2 text-muted-foreground">{r.assignee}</td>
                  <td className="px-4 py-2"><span className={`rounded px-2 py-0.5 text-xs font-medium ${SLA_STYLE[r.sla.status]}`}>{SLA_LABEL[r.sla.status]} · {r.sla.pct}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

type LogEntry = { day: number; who: string; text: string; kind?: "alert" | "decision" };

const ROLE_LABEL: Record<Role, string> = {
  SYSTEM_ADMIN: "System Admin", REGIONAL_OFFICER: "Regional Officer", SCRUTINY_OFFICER: "Scrutiny Officer",
  COMMITTEE_MEMBER: "Committee Member", INSTITUTION_LIAISON: "Institution Liaison",
};

function DemoCase() {
  const type: AppType = "NEW_INSTITUTION";
  const [stage, setStage] = useState<Stage>("Submitted");
  const [role, setRole] = useState<Role>("SCRUTINY_OFFICER");
  const [day, setDay] = useState(0);
  const [stageStart, setStageStart] = useState(0);
  const [cycles, setCycles] = useState(0);
  const [fireRenewed, setFireRenewed] = useState(false);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [log, setLog] = useState<LogEntry[]>([
    { day: 0, who: "Institution Liaison", text: "Application submitted with 7 documents. Fee paid." },
    { day: 0, who: "System", text: "Rule engine applied APH-2024-27 v1.3: 7 checklist items, stage plan created." },
    { day: 0, who: "AI pre-check", text: "Fire NOC expires 15-01-2027, before session start.", kind: "alert" },
  ]);

  const slaDays = RULES[type].stages.find((s) => s.stage === stage)?.sla ?? 0;
  const sla = slaDays ? slaStatus(stageStart, slaDays, day) : null;
  const add = (e: LogEntry) => setLog((l) => [e, ...l]);

  const act = (action: Action) => {
    const r = transition(type, stage, action, role, cycles);
    if (!r.ok) { setError(r.error); return; }
    setError("");
    if (action === "RAISE_DEFICIENCY") setCycles((c) => c + 1);
    if (action === "RESPOND") setFireRenewed(true);
    add({ day, who: ROLE_LABEL[role], text: `${action.replace("_", " ").toLowerCase()} → moved to ${STAGE_LABEL[r.to]}${action === "RAISE_DEFICIENCY" ? " (Fire NOC renewal needed, reply within 7 days)" : ""}${action === "RESPOND" ? " (renewed Fire NOC valid to 2029 uploaded)" : ""}`, kind: "decision" });
    if (r.to === "EVC") add({ day, who: "Calendar (mock)", text: `EVC visit booked for day ${day + 7}; invite sent to 3 committee members.` });
    add({ day, who: "Email/SMS (mock)", text: `Notified the next person responsible for ${STAGE_LABEL[r.to]}.` });
    setStage(r.to); setStageStart(day);
  };

  const passTime = (n: number) => {
    const nd = day + n;
    setDay(nd);
    if (slaDays) {
      const s = slaStatus(stageStart, slaDays, nd);
      const prev = slaStatus(stageStart, slaDays, day);
      if (s.status !== prev.status && s.status !== "on_track") {
        const msg = { due_soon: "Reminder sent to the person responsible (75% of time used).", overdue: "Overdue — Regional Officer notified by email + SMS.", escalated: "Escalated to Regional Director." }[s.status];
        add({ day: nd, who: "Deadline monitor", text: `${STAGE_LABEL[stage]}: ${msg}`, kind: "alert" });
      }
    }
  };

  const actions: Action[] = ["APPROVE", "RAISE_DEFICIENCY", "RESPOND", "REFER_HEARING", "REJECT"];
  const path: Stage[] = ["Submitted", "Scrutiny", "Deficiency", "ReScrutiny", "EVC", "Recommendation", "Decision", "Approved"];
  const curIdx = path.indexOf(stage);

  return (
    <>
      <Header kicker="APP-2027-S-0142 · New Institution · South" title="Sri Venkateswara Institute of Technology" sub="Switch roles, take actions and let time pass to see routing, deficiency handling, EVC scheduling and escalations." />

      <ol className="flex flex-wrap gap-2">
        {path.map((s, i) => (
          <li key={s} className={`rounded-full border px-3 py-1 text-xs ${s === stage ? "border-primary bg-primary text-primary-foreground" : i < curIdx ? "border-success bg-success/10 text-success" : "border-border text-muted-foreground"}`}>{STAGE_LABEL[s]}</li>
        ))}
        {stage === "Rejected" && <li className="rounded-full bg-destructive px-3 py-1 text-xs text-destructive-foreground">Rejected</li>}
      </ol>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="space-y-4 rounded-lg border border-border bg-card p-5 lg:col-span-1">
          <div>
            <label className="text-xs uppercase text-muted-foreground">Acting as</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          <div className="rounded-md bg-muted p-3 text-sm">
            <div className="flex justify-between"><span>Day</span><span className="font-mono">{day}</span></div>
            <div className="flex justify-between"><span>Stage time limit</span><span className="font-mono">{slaDays ? `${slaDays} days` : "—"}</span></div>
            {sla && <div className="mt-2"><span className={`rounded px-2 py-0.5 text-xs font-medium ${SLA_STYLE[sla.status]}`}>{SLA_LABEL[sla.status]} · {sla.pct}%</span></div>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => passTime(1)} className="flex-1 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">+1 day</button>
            <button onClick={() => passTime(5)} className="flex-1 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">+5 days</button>
          </div>
          <div className="space-y-2">
            {actions.map((a) => {
              const allowed = transition(type, stage, a, role, cycles).ok;
              return (
                <button key={a} onClick={() => act(a)} disabled={!allowed}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm font-medium transition ${allowed ? (a === "REJECT" ? "bg-destructive text-destructive-foreground" : a === "RAISE_DEFICIENCY" ? "bg-accent text-accent-foreground" : "bg-primary text-primary-foreground hover:opacity-90") : "cursor-not-allowed bg-muted text-muted-foreground"}`}>
                  {{ APPROVE: "Approve / forward", RAISE_DEFICIENCY: "Raise deficiency", RESPOND: "Respond to deficiency", REFER_HEARING: "Refer to SAC/SHC", REJECT: "Reject" }[a]}
                </button>
              );
            })}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-card p-5 lg:col-span-2">
          <h2 className="font-semibold">Compliance checklist</h2>
          <ul className="mt-3 divide-y divide-border text-sm">
            {DEMO_DOCS.map((d) => {
              const exp = d.code === "FIRE_NOC" && fireRenewed ? "2029-06-30" : d.expiry;
              const v = docValidity(exp, "2027-08-01");
              return (
                <li key={d.code} className="flex flex-wrap items-center gap-3 py-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">{d.label} <span className="text-xs text-muted-foreground">· {d.ref}</span></span>
                  {exp && <span className="font-mono text-xs text-muted-foreground">to {exp}</span>}
                  <span className={`rounded px-2 py-0.5 text-xs ${v === "expired" ? "bg-destructive/15 text-destructive" : v === "expiring" ? "bg-warning/20 text-accent-foreground" : "bg-success/15 text-success"}`}>{v === "no_expiry" ? "verified" : v}</span>
                  {d.flag && !fireRenewed && <p className="w-full pl-7 text-xs text-destructive">{d.flag}</p>}
                </li>
              );
            })}
          </ul>

          <h2 className="mt-6 font-semibold">Case history</h2>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (comment.trim()) { add({ day, who: ROLE_LABEL[role], text: `💬 ${comment}` }); setComment(""); } }}>
            <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment for the team" className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm" />
            <button className="rounded-md bg-secondary px-3 text-sm">Post</button>
          </form>
          <ul className="mt-3 max-h-80 space-y-2 overflow-auto text-sm">
            {log.map((l, i) => (
              <li key={i} className={`rounded-md border-l-2 bg-muted/50 px-3 py-2 ${l.kind === "alert" ? "border-destructive" : l.kind === "decision" ? "border-primary" : "border-border"}`}>
                <span className="font-mono text-xs text-muted-foreground">Day {l.day} · {l.who}</span>
                <div>{l.text}</div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function Rules() {
  const [t, setT] = useState<AppType>("NEW_INSTITUTION");
  const r = RULES[t];
  return (
    <>
      <Header kicker="Configuration" title="Rule engine" sub="Each application type maps to its own stages, time limits, responsible roles and required documents." />
      <div className="flex flex-wrap gap-2">
        {(Object.keys(RULES) as AppType[]).map((k) => (
          <button key={k} onClick={() => setT(k)} className={`rounded-md px-4 py-2 text-sm ${k === t ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{RULES[k].label}</button>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-semibold">Stages</h2>
          <ol className="mt-3 space-y-2 text-sm">
            {r.stages.map((s, i) => (
              <li key={s.stage} className="flex items-center gap-3 rounded-md bg-muted/60 px-3 py-2">
                <span className="font-mono text-xs text-muted-foreground">{i + 1}</span>
                <span className="flex-1 font-medium">{STAGE_LABEL[s.stage]}</span>
                <span className="text-xs text-muted-foreground">{ROLE_LABEL[s.role]}</span>
                <span className="font-mono text-xs">{s.sla}d</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="rounded-lg border border-border bg-card p-5">
          <h2 className="font-semibold">Required documents</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {r.docs.map((d) => <li key={d.code} className="flex justify-between rounded-md bg-muted/60 px-3 py-2"><span>{d.label}</span><span className="text-xs text-muted-foreground">{d.ref}</span></li>)}
          </ul>
          <h3 className="mt-6 text-sm font-semibold">Escalation ladder</h3>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>75% of time used → reminder email</li>
            <li>100% → Regional Officer notified (email + SMS)</li>
            <li>150% → Regional Director</li>
            <li>200% → Member Secretary</li>
          </ul>
        </section>
      </div>
    </>
  );
}
