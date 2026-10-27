// ApprovalFlow AI — Compliance Monitoring Dashboard
// Route: /demo/approvalflow/compliance
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useDemoRole } from "@/lib/demo-role-store";
import {
  afStore, storeEvents, getDemoUserId, isOverdue, daysUntil,
  type Stage as AppStage, type Task,
} from "@/lib/approval-flow";

export const Route = createFileRoute("/demo/approvalflow/compliance")({
  ssr: false,
  head: () => ({ meta: [{ title: "Compliance Monitoring — ApprovalFlow AI" }] }),
  component: ComplianceDashboard,
});

function TaskTypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    Deficiency: "bg-amber-50 text-amber-700 border-amber-200",
    EVCVisit:   "bg-violet-50 text-violet-700 border-violet-200",
    Compliance: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border ${styles[type] ?? "bg-slate-50 text-slate-700 border-slate-200"}`}>
      {type}
    </span>
  );
}

function ComplianceDashboard() {
  const [role] = useDemoRole();
  const userId = getDemoUserId(role as any);
  const roleStr = role as string | null;
  const canAct = roleStr === "aicte_office" || roleStr === "admin";
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "resolved">("open");
  const [filterType, setFilterType] = useState("");
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const unsub = storeEvents.subscribe(() => setTick(t => t + 1));
    return unsub;
  }, []);

  const allTasks = useMemo(() => {
    let tasks = afStore.tasks.filter(t =>
      t.type === "Deficiency" || t.type === "EVCVisit" || t.type === "Compliance"
    );
    if (filterType) tasks = tasks.filter(t => t.type === filterType);
    if (filterStatus === "open") return tasks.filter(t => t.status !== "Resolved" && t.status !== "Closed");
    if (filterStatus === "resolved") return tasks.filter(t => t.status === "Resolved" || t.status === "Closed");
    return tasks;
  }, [filterStatus, filterType, tick]);

  const stats = useMemo(() => ({
    open: afStore.tasks.filter(t => t.status === "Open" || t.status === "InProgress").length,
    resolved: afStore.tasks.filter(t => t.status === "Resolved" || t.status === "Closed").length,
    overdue: afStore.tasks.filter(t => daysUntil(t.dueDate) < 0 && t.status !== "Resolved").length,
  }), [tick]);

  const notify = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  const handleResolve = (taskId: string) => {
    if (!canAct) return notify("You don't have permission to resolve tasks.");
    afStore.resolveTask(taskId, userId, "Resolved via Compliance dashboard");
    notify("Task marked as resolved");
    setTick(t => t + 1);
  };

  const handleForwardToReScrutiny = (appId: string) => {
    if (!canAct) return notify("You don't have permission to perform this action.");
    try {
      afStore.transitionStage(appId, "ReScrutiny", userId, "Deficiency resolved — returned for Re-scrutiny");
      notify("Application returned for Re-scrutiny");
      setTick(t => t + 1);
    } catch (e) {
      notify(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded bg-[#163B65] text-white px-4 py-2.5 text-sm font-medium shadow-xl flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#E99A35]" />
          {toast}
        </div>
      )}

      {/* View-only notice */}
      {!canAct && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-700">
          View-only — Institution users cannot resolve compliance tasks
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Open Tasks", value: stats.open, color: "text-amber-600", border: "border-amber-200" },
          { label: "Overdue Tasks", value: stats.overdue, color: "text-red-600", border: "border-red-200" },
          { label: "Resolved", value: stats.resolved, color: "text-green-700", border: "border-green-200" },
        ].map(s => (
          <div key={s.label} className={`stat-card border-l-4 ${s.border}`}>
            <p className={`kpi-number ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-[#8290A0] mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded border border-[#E1E7ED] p-3 flex flex-wrap gap-2.5 items-center">
        <div className="flex rounded border border-[#D5DDE6] overflow-hidden">
          {(["open", "resolved", "all"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilterStatus(f)}
              className={`px-3 py-1.5 text-[12px] font-medium transition-colors capitalize ${
                filterStatus === f
                  ? "bg-[#163B65] text-white"
                  : "text-[#5F6F82] hover:bg-[#F0F3F6]"
              }`}
            >
              {f === "open" ? "Open" : f === "resolved" ? "Resolved" : "All"}
            </button>
          ))}
        </div>
        <select
          className="rounded border border-[#D5DDE6] px-2.5 py-1.5 text-[13px] text-[#172B40] focus:outline-none focus:ring-2 focus:ring-[#163B65]/15"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
        >
          <option value="">All Types</option>
          <option value="Deficiency">Deficiency</option>
          <option value="EVCVisit">EVC Visit</option>
          <option value="Compliance">Compliance</option>
        </select>
        <span className="ml-auto text-[11px] text-[#8290A0]">{allTasks.length} task{allTasks.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Tasks table */}
      {allTasks.length === 0 ? (
        <div className="bg-white rounded border border-[#E1E7ED] py-16 text-center">
          <p className="text-[14px] text-[#8290A0]">No {filterStatus !== "all" ? filterStatus : ""} compliance tasks found.</p>
        </div>
      ) : (
        <div className="bg-white rounded border border-[#E1E7ED] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full gov-table">
              <thead>
                <tr>
                  <th>Reference No.</th>
                  <th>Institution</th>
                  <th>Task Type</th>
                  <th>Description</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {allTasks.map(task => {
                  const app = afStore.getApplication(task.appId);
                  const inst = app ? afStore.getInstitution(app.institutionId) : null;
                  const dl = daysUntil(task.dueDate);
                  const resolved = task.status === "Resolved" || task.status === "Closed";
                  return (
                    <tr key={task.id} className={resolved ? "opacity-60" : dl < 0 ? "bg-red-50" : ""}>
                      <td>
                        <code className="font-mono text-[11px] text-[#8290A0] bg-[#F0F3F6] px-1.5 py-0.5 rounded">{task.appId}</code>
                      </td>
                      <td>
                        <p className="font-medium text-[13px] text-[#172B40] truncate max-w-[140px]">{inst?.name ?? "—"}</p>
                        <p className="text-[10px] text-[#8290A0]">{app?.region}</p>
                      </td>
                      <td><TaskTypeBadge type={task.type} /></td>
                      <td className="text-[12px] text-[#5F6F82] max-w-[180px]">
                        <span className="line-clamp-2">{task.description}</span>
                      </td>
                      <td>
                        <div>
                          <p className="text-[12px] font-medium text-[#172B40]">{task.dueDate}</p>
                          <p className={`text-[10px] font-semibold ${dl < 0 ? "text-red-600" : dl < 7 ? "text-amber-600" : "text-[#8290A0]"}`}>
                            {dl < 0 ? `${Math.abs(dl)}d overdue` : `${dl}d remaining`}
                          </p>
                        </div>
                      </td>
                      <td>
                        <span className={`text-[11px] font-semibold ${resolved ? "text-green-700" : dl < 0 ? "text-red-600" : "text-amber-600"}`}>
                          {task.status}
                        </span>
                      </td>
                      <td>
                        {!resolved && canAct && (
                          <div className="flex gap-1.5">
                            <button
                              className="rounded bg-green-600 hover:bg-green-700 text-white text-[11px] font-semibold px-2.5 py-1 transition-colors"
                              onClick={() => handleResolve(task.id)}
                            >
                              Resolve
                            </button>
                            {app && task.type === "Deficiency" && (
                              <button
                                className="rounded border border-[#163B65] text-[#163B65] text-[11px] font-medium px-2.5 py-1 hover:bg-[#163B65]/5 transition-colors"
                                onClick={() => handleForwardToReScrutiny(task.appId)}
                              >
                                → Re-Scrutiny
                              </button>
                            )}
                          </div>
                        )}
                        {resolved && (
                          <span className="text-[11px] text-green-700 font-medium">✓ Resolved</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
