// ApprovalFlow AI — Admin System Report
// Route: /demo/approvalflow/admin
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useDemoRole } from "@/lib/demo-role-store";
import {
  afStore, storeEvents, isOverdue, daysUntil, STAGE_LABELS,
  type Stage as AppStage,
} from "@/lib/approval-flow";

export const Route = createFileRoute("/demo/approvalflow/admin")({
  ssr: false,
  head: () => ({ meta: [{ title: "Admin Report — ApprovalFlow AI" }] }),
  component: AdminDashboard,
});

const STAGES: AppStage[] = [
  "Submitted", "Scrutiny", "Deficiency", "ReScrutiny", "EVC",
  "Recommendation", "SAC_SHC", "Decision", "Approved", "Rejected",
];

function AdminDashboard() {
  const [role] = useDemoRole();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const unsub = storeEvents.subscribe(() => setTick(t => t + 1));
    const interval = setInterval(() => setTick(t => t + 1), 30000);
    return () => { unsub(); clearInterval(interval); };
  }, []);

  const roleStr = role as string | null;
  if (roleStr !== "admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-3">
        <div className="h-14 w-14 rounded-full bg-[#E1E7ED] flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#8290A0" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        </div>
        <h1 className="text-[17px] font-semibold text-[#172B40]">Administrator Access Required</h1>
        <p className="text-[13px] text-[#8290A0] text-center max-w-sm">
          This report dashboard is restricted to System Administrators. Please sign in with an admin account to continue.
        </p>
      </div>
    );
  }

  const stats = afStore.getStats();
  const apps = afStore.applications;
  const institutions = afStore.institutions;

  const regions = Array.from(new Set(apps.map(a => a.region)));
  const regionStats = regions.map(r => ({
    region: r,
    total: apps.filter(a => a.region === r).length,
    overdue: apps.filter(a => a.region === r && isOverdue(a)).length,
    approved: apps.filter(a => a.region === r && a.status === "Approved").length,
  })).sort((a, b) => b.total - a.total);

  const stageFunnel = STAGES.map(s => ({
    stage: s,
    count: apps.filter(a => a.currentStage === s).length,
    overdue: apps.filter(a => a.currentStage === s && isOverdue(a)).length,
  })).filter(s => s.count > 0);

  const recentLogs = [...afStore.auditLogs]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 15);

  const bottleneckStage = stageFunnel.length > 0
    ? stageFunnel.reduce((a, b) => (b.overdue > a.overdue ? b : a))
    : null;
  const maxRegionTotal = Math.max(...regionStats.map(r => r.total));

  return (
    <div className="space-y-5">
      {/* Admin header badge */}
      <div className="flex items-center gap-2">
        <span className="rounded bg-[#163B65] text-white text-[10px] font-bold px-2 py-1 uppercase tracking-wider">Admin View</span>
        <p className="text-[12px] text-[#8290A0]">
          Real-time system overview · {institutions.length} institutions · {apps.length} applications
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Applications", value: stats.total, color: "text-[#163B65]", border: "border-[#163B65]/30" },
          { label: "Pending", value: stats.pending, color: "text-amber-600", border: "border-amber-300" },
          { label: "Overdue", value: stats.overdue, color: "text-red-600", border: "border-red-300" },
          { label: "Approved", value: stats.approved, color: "text-green-700", border: "border-green-300" },
        ].map(k => (
          <div key={k.label} className={`stat-card border-l-4 ${k.border}`}>
            <p className={`kpi-number ${k.color}`}>{k.value}</p>
            <p className="text-[11px] text-[#8290A0] mt-1">{k.label}</p>
          </div>
        ))}
      </div>

      {/* Bottleneck alert */}
      {bottleneckStage && bottleneckStage.overdue > 0 && (
        <div className="rounded border border-red-200 bg-red-50 p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-red-100 border border-red-200 flex items-center justify-center flex-shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C24141" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div>
            <p className="font-semibold text-[13px] text-red-800">Critical Bottleneck: {STAGE_LABELS[bottleneckStage.stage]}</p>
            <p className="text-[12px] text-red-700 mt-0.5">
              {bottleneckStage.overdue} application{bottleneckStage.overdue > 1 ? "s" : ""} overdue at this stage. Immediate escalation recommended.
            </p>
          </div>
        </div>
      )}

      {/* Pipeline + Region */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Stage pipeline */}
        <div className="bg-white rounded border border-[#E1E7ED] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E1E7ED] bg-[#F5F7FA]">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6F82]">Application Pipeline by Stage</h2>
          </div>
          <div className="p-4 space-y-3">
            {stageFunnel.map(({ stage, count, overdue }) => {
              const pct = Math.round((count / apps.length) * 100);
              return (
                <div key={stage}>
                  <div className="flex justify-between text-[12px] mb-1">
                    <span className="text-[#172B40] font-medium">{STAGE_LABELS[stage]}</span>
                    <span className="text-[#8290A0]">
                      {count}
                      {overdue > 0 && <span className="text-red-600 ml-1">({overdue} OD)</span>}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#E1E7ED] overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        overdue > count / 2 ? "bg-red-500" : overdue > 0 ? "bg-amber-500" : "bg-[#163B65]"
                      }`}
                      style={{ width: `${Math.max(3, pct)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Region breakdown */}
        <div className="bg-white rounded border border-[#E1E7ED] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E1E7ED] bg-[#F5F7FA]">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6F82]">Applications by Region</h2>
          </div>
          <div className="p-4 space-y-3">
            {regionStats.map(({ region, total, overdue, approved }) => (
              <div key={region}>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-[#172B40] font-medium">{region}</span>
                  <span className="text-[#8290A0]">
                    {total} total
                    <span className="text-green-700 ml-1">· {approved} ✓</span>
                    {overdue > 0 && <span className="text-red-600 ml-1">· {overdue} OD</span>}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-[#E1E7ED] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#163B65] transition-all"
                    style={{ width: `${(total / maxRegionTotal) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Institutions table */}
      <div className="bg-white rounded border border-[#E1E7ED] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E1E7ED] bg-[#F5F7FA] flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6F82]">
            Registered Institutions ({institutions.length})
          </h2>
          <span className="text-[11px] text-[#8290A0]">Showing top 30</span>
        </div>
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full gov-table">
            <thead className="sticky top-0">
              <tr>
                <th>AICTE ID</th>
                <th>Institution Name</th>
                <th>State</th>
                <th>Applications</th>
                <th>Overdue</th>
              </tr>
            </thead>
            <tbody>
              {institutions.slice(0, 30).map(inst => {
                const instApps = apps.filter(a => a.institutionId === inst.id);
                const od = instApps.filter(isOverdue).length;
                return (
                  <tr key={inst.id}>
                    <td>
                      <code className="font-mono text-[11px] text-[#8290A0]">{inst.aicteId}</code>
                    </td>
                    <td className="text-[13px] text-[#172B40] font-medium">{inst.name}</td>
                    <td className="text-[12px] text-[#5F6F82]">{inst.state}</td>
                    <td className="text-[12px] text-[#5F6F82]">{instApps.length}</td>
                    <td>
                      {od > 0
                        ? <span className="text-[12px] text-red-600 font-bold">{od}</span>
                        : <span className="text-[12px] text-[#8290A0]">—</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent activity feed */}
      <div className="bg-white rounded border border-[#E1E7ED] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#E1E7ED] bg-[#F5F7FA]">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6F82]">Recent System Activity</h2>
        </div>
        <div className="divide-y divide-[#E1E7ED]">
          {recentLogs.map(log => {
            const app = afStore.getApplication(log.appId);
            const inst = app ? afStore.getInstitution(app.institutionId) : null;
            return (
              <div key={log.id} className="flex items-start gap-3 px-4 py-3">
                <div className="h-6 w-6 rounded-full bg-[#163B65]/10 border border-[#163B65]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[9px] text-[#163B65] font-bold">A</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-medium text-[#172B40]">{log.action}</p>
                  <p className="text-[10px] text-[#8290A0] mt-0.5">
                    {inst?.name ?? log.appId} · <code className="font-mono">{log.userId}</code> · {new Date(log.timestamp).toLocaleString("en-IN")}
                  </p>
                  {log.fromStage && log.toStage && (
                    <p className="text-[10px] text-[#163B65] mt-0.5 font-medium">
                      {STAGE_LABELS[log.fromStage]} → {STAGE_LABELS[log.toStage]}
                    </p>
                  )}
                </div>
                <code className="font-mono text-[10px] text-[#8290A0] flex-shrink-0">{log.appId}</code>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
