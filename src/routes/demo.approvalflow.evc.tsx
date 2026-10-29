// ApprovalFlow AI — EVC Scheduler Dashboard
// Route: /demo/approvalflow/evc
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useDemoRole } from "@/lib/demo-role-store";
import {
  afStore,
  storeEvents,
  getDemoUserId,
  isOverdue,
  daysUntil,
  stageAgeingDays,
  STAGE_LABELS,
  type Application,
  type Stage as AppStage,
} from "@/lib/approval-flow";

export const Route = createFileRoute("/demo/approvalflow/evc")({
  ssr: false,
  head: () => ({ meta: [{ title: "EVC Scheduler — ApprovalFlow AI" }] }),
  component: EVCDashboard,
});

function EVCDashboard() {
  const [role] = useDemoRole();
  const userId = getDemoUserId(role);
  const roleStr = role as string | null;
  const canAct = roleStr === "aicte_office" || roleStr === "admin";
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState("");
  const [schedulingApp, setSchedulingApp] = useState<string | null>(null);
  const [evcDate, setEvcDate] = useState("");
  const [evcCommittee, setEvcCommittee] = useState("Dr. Mohan, Dr. Nair");

  useEffect(() => {
    const unsub = storeEvents.subscribe(() => setTick((t) => t + 1));
    return unsub;
  }, []);

  const apps = useMemo(() => {
    let list = afStore.applications.filter((a) => a.currentStage === "EVC");
    if (filterOverdue) list = list.filter(isOverdue);
    return list;
  }, [filterOverdue, tick]);

  const scheduled = useMemo(() => apps.filter((a) => !!a.evcDate), [apps]);
  const unscheduled = useMemo(() => apps.filter((a) => !a.evcDate), [apps]);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handleSchedule = (appId: string) => {
    if (!canAct) return notify("You don't have permission to schedule EVC visits.");
    if (!evcDate) return notify("Please select a visit date.");
    const committee = evcCommittee
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    afStore.scheduleEVC(appId, evcDate, committee, userId);
    notify(`EVC visit scheduled for ${evcDate}`);
    setSchedulingApp(null);
    setEvcDate("");
    setTick((t) => t + 1);
  };

  const handleMoveToRecommendation = (appId: string) => {
    if (!canAct) return notify("You don't have permission to perform this action.");
    afStore.transitionStage(
      appId,
      "Recommendation",
      userId,
      "EVC completed — forwarding to Recommendation stage",
    );
    notify("Application moved to Recommendation stage");
    setTick((t) => t + 1);
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
          View-only — Only AICTE officers can schedule EVC visits
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          {
            label: "Total in EVC Stage",
            value: apps.length,
            color: "text-violet-700",
            border: "border-violet-200",
          },
          {
            label: "Pending Scheduling",
            value: unscheduled.length,
            color: "text-amber-600",
            border: "border-amber-200",
          },
          {
            label: "Overdue",
            value: apps.filter(isOverdue).length,
            color: "text-red-600",
            border: "border-red-200",
          },
        ].map((s) => (
          <div key={s.label} className={`stat-card border-l-4 ${s.border}`}>
            <p className={`kpi-number ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-[#8290A0] mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded border border-[#E1E7ED] p-3 flex items-center gap-3">
        <label className="flex items-center gap-2 text-[13px] text-[#5F6F82] cursor-pointer">
          <input
            type="checkbox"
            checked={filterOverdue}
            onChange={(e) => setFilterOverdue(e.target.checked)}
            className="rounded border-[#D5DDE6] accent-[#163B65]"
          />
          Overdue only
        </label>
        <span className="ml-auto text-[11px] text-[#8290A0]">
          {apps.length} application{apps.length !== 1 ? "s" : ""} in EVC stage
        </span>
      </div>

      {apps.length === 0 && (
        <div className="bg-white rounded border border-[#E1E7ED] py-16 text-center">
          <p className="text-[14px] text-[#8290A0]">
            No applications are currently awaiting EVC scheduling.
          </p>
        </div>
      )}

      {/* Pending Scheduling */}
      {unscheduled.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6F82]">
              Pending Scheduling
            </h2>
            <span className="rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 border border-amber-200">
              {unscheduled.length}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {unscheduled.map((app) => {
              const inst = afStore.getInstitution(app.institutionId);
              const overdue = isOverdue(app);
              const dl = daysUntil(app.slaDeadline);
              return (
                <div
                  key={app.id}
                  className={`bg-white rounded border ${overdue ? "border-red-200" : "border-[#E1E7ED]"} overflow-hidden`}
                >
                  <div
                    className={`px-4 py-3 border-b ${overdue ? "border-red-200 bg-red-50" : "border-[#E1E7ED] bg-[#F5F7FA]"} flex items-start justify-between`}
                  >
                    <div>
                      <div className="flex items-center flex-wrap gap-1.5 mb-0.5">
                        <code className="font-mono text-[10px] text-[#8290A0]">{app.id}</code>
                        {overdue && (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                            ⚠ Overdue
                          </span>
                        )}
                        {(() => {
                          const days = stageAgeingDays(app);
                          if (days === null) return null;
                          const cls =
                            days > 14
                              ? "bg-red-50 text-red-700 border-red-200"
                              : days > 7
                                ? "bg-amber-50 text-amber-700 border-amber-200"
                                : "bg-[#EEF3F8] text-[#5F6F82] border-[#E1E7ED]";
                          return (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-medium border ${cls}`}
                            >
                              {days}d at stage
                            </span>
                          );
                        })()}
                      </div>
                      <p className="font-semibold text-[13px] text-[#172B40]">{inst?.name}</p>
                      <p className="text-[11px] text-[#8290A0]">
                        {app.region} · {inst?.state}
                      </p>
                    </div>
                    <span
                      className={`text-[12px] font-bold flex-shrink-0 ${dl < 0 ? "text-red-600" : dl < 7 ? "text-amber-600" : "text-[#5F6F82]"}`}
                    >
                      {dl < 0 ? `${Math.abs(dl)}d OD` : `${dl}d left`}
                    </span>
                  </div>
                  <div className="px-4 py-3">
                    {schedulingApp === app.id ? (
                      <div className="space-y-2">
                        <label className="block">
                          <span className="text-[11px] font-medium text-[#5F6F82] uppercase tracking-wide">
                            Visit Date
                          </span>
                          <input
                            type="date"
                            className="mt-1 w-full rounded border border-[#D5DDE6] px-3 py-2 text-[13px] text-[#172B40] focus:outline-none focus:ring-2 focus:ring-[#163B65]/15 focus:border-[#163B65]"
                            value={evcDate}
                            onChange={(e) => setEvcDate(e.target.value)}
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] font-medium text-[#5F6F82] uppercase tracking-wide">
                            Committee Members
                          </span>
                          <input
                            className="mt-1 w-full rounded border border-[#D5DDE6] px-3 py-2 text-[13px] text-[#172B40] focus:outline-none focus:ring-2 focus:ring-[#163B65]/15"
                            placeholder="Comma-separated names"
                            value={evcCommittee}
                            onChange={(e) => setEvcCommittee(e.target.value)}
                          />
                        </label>
                        <div className="flex gap-2 pt-1">
                          <button
                            className="rounded bg-[#163B65] hover:bg-[#102F52] text-white text-[11px] font-semibold px-3 py-1.5 transition-colors"
                            onClick={() => handleSchedule(app.id)}
                          >
                            Confirm Schedule
                          </button>
                          <button
                            className="rounded border border-[#D5DDE6] text-[#5F6F82] text-[11px] px-3 py-1.5 hover:bg-[#F0F3F6] transition-colors"
                            onClick={() => setSchedulingApp(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        disabled={!canAct}
                        className={`rounded px-3 py-1.5 text-[11px] font-semibold border transition-colors ${
                          canAct
                            ? "border-violet-300 text-violet-700 hover:bg-violet-50"
                            : "border-[#E1E7ED] text-[#8290A0] cursor-not-allowed"
                        }`}
                        onClick={() => setSchedulingApp(app.id)}
                      >
                        Schedule EVC Visit
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Scheduled */}
      {scheduled.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6F82]">
              Scheduled Visits
            </h2>
            <span className="rounded-full bg-green-100 text-green-700 text-[10px] font-bold px-2 py-0.5 border border-green-200">
              {scheduled.length}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {scheduled.map((app) => {
              const inst = afStore.getInstitution(app.institutionId);
              return (
                <div
                  key={app.id}
                  className="bg-white rounded border border-green-200 overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-green-200 bg-green-50 flex items-start justify-between">
                    <div>
                      <code className="font-mono text-[10px] text-[#8290A0]">{app.id}</code>
                      <p className="font-semibold text-[13px] text-[#172B40]">{inst?.name}</p>
                      <p className="text-[11px] text-[#8290A0]">{app.region}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[12px] text-green-700 font-semibold">
                        Visit: {app.evcDate}
                      </p>
                      {app.evcCommittee && (
                        <p className="text-[10px] text-[#8290A0]">{app.evcCommittee.join(", ")}</p>
                      )}
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <button
                      disabled={!canAct}
                      className={`rounded px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                        canAct
                          ? "bg-green-600 hover:bg-green-700 text-white"
                          : "bg-[#E1E7ED] text-[#8290A0] cursor-not-allowed"
                      }`}
                      onClick={() => handleMoveToRecommendation(app.id)}
                    >
                      Mark EVC Complete → Recommendation
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
