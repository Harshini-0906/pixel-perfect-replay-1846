// ApprovalFlow AI — Scrutiny & Verification Dashboard
// Route: /demo/approvalflow/scrutiny
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

export const Route = createFileRoute("/demo/approvalflow/scrutiny")({
  ssr: false,
  head: () => ({ meta: [{ title: "Scrutiny & Verification — ApprovalFlow AI" }] }),
  component: ScrutinyDashboard,
});

function StageBadge({ stage }: { stage: AppStage }) {
  const govColors: Record<string, string> = {
    Scrutiny: "bg-blue-50 text-blue-700 border border-blue-200",
    ReScrutiny: "bg-purple-50 text-purple-700 border border-purple-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${govColors[stage] ?? "bg-slate-100 text-slate-600 border border-slate-200"}`}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}

function SlaBar({ slaDeadline }: { slaDeadline: string }) {
  const dl = daysUntil(slaDeadline);
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-[#8290A0]">SLA: {slaDeadline}</span>
        <span
          className={`font-semibold ${dl < 0 ? "text-red-600" : dl < 7 ? "text-amber-600" : "text-green-700"}`}
        >
          {dl < 0 ? `${Math.abs(dl)}d overdue` : `${dl}d remaining`}
        </span>
      </div>
      <div className="h-1 rounded-full bg-[#E1E7ED] overflow-hidden">
        <div
          className={`h-full rounded-full ${dl < 0 ? "bg-red-500 w-full" : dl < 7 ? "bg-amber-500" : "bg-[#163B65]"}`}
          style={{ width: dl < 0 ? "100%" : `${Math.max(5, 100 - (dl / 30) * 100)}%` }}
        />
      </div>
    </div>
  );
}

function ScrutinyDashboard() {
  const [role] = useDemoRole();
  const userId = getDemoUserId(role);
  const roleStr = role as string | null;
  const canAct = roleStr === "aicte_office" || roleStr === "admin";
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [filterRegion, setFilterRegion] = useState("");
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState("");
  const [defDesc, setDefDesc] = useState("");
  const [defDue, setDefDue] = useState("");
  const [showDefForm, setShowDefForm] = useState<string | null>(null);

  useEffect(() => {
    const unsub = storeEvents.subscribe(() => setTick((t) => t + 1));
    return unsub;
  }, []);

  const apps = useMemo(() => {
    let list = afStore.applications.filter(
      (a) => a.currentStage === "Scrutiny" || a.currentStage === "ReScrutiny",
    );
    if (filterOverdue) list = list.filter(isOverdue);
    if (filterRegion) list = list.filter((a) => a.region === filterRegion);
    return list;
  }, [filterOverdue, filterRegion, tick]);

  const regions = Array.from(new Set(afStore.applications.map((a) => a.region)));

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  const handle = (
    appId: string,
    action: "approve" | "raise_deficiency" | "send_evc" | "send_recommendation",
  ) => {
    if (!canAct) return notify("You don't have permission to take this action.");
    try {
      if (action === "approve") {
        afStore.transitionStage(
          appId,
          "Recommendation",
          userId,
          "Scrutiny approved — forwarded to recommendation",
        );
        notify("Application forwarded to Recommendation stage");
      } else if (action === "send_evc") {
        afStore.transitionStage(appId, "EVC", userId, "Sent for Expert Visit Committee scheduling");
        notify("Application sent for EVC scheduling");
      } else if (action === "send_recommendation") {
        afStore.transitionStage(
          appId,
          "Recommendation",
          userId,
          "Forwarded directly to Recommendation",
        );
        notify("Application forwarded to Recommendation");
      } else if (action === "raise_deficiency") {
        if (!defDesc || !defDue)
          return notify("Please fill in the deficiency description and due date");
        afStore.raiseDeficiency(appId, defDesc, defDue, userId, userId);
        afStore.transitionStage(appId, "Deficiency", userId, `Deficiency notice: ${defDesc}`);
        notify("Deficiency notice raised successfully");
        setShowDefForm(null);
        setDefDesc("");
        setDefDue("");
      }
      setTick((t) => t + 1);
    } catch (e) {
      notify(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // Stats
  const totalInScrutiny = afStore.applications.filter((a) => a.currentStage === "Scrutiny").length;
  const totalInReScrutiny = afStore.applications.filter(
    (a) => a.currentStage === "ReScrutiny",
  ).length;
  const overdueCount = apps.filter(isOverdue).length;

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
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-700 flex items-center gap-2">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          View-only — Institution users cannot perform scrutiny actions
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          {
            label: "In Scrutiny",
            value: totalInScrutiny,
            color: "text-blue-700",
            border: "border-blue-200",
          },
          {
            label: "In Re-Scrutiny",
            value: totalInReScrutiny,
            color: "text-purple-700",
            border: "border-purple-200",
          },
          {
            label: "Overdue",
            value: overdueCount,
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
      <div className="bg-white rounded border border-[#E1E7ED] p-3 flex flex-wrap gap-3 items-center">
        <label className="flex items-center gap-2 text-[13px] text-[#5F6F82] cursor-pointer">
          <input
            type="checkbox"
            checked={filterOverdue}
            onChange={(e) => setFilterOverdue(e.target.checked)}
            className="rounded border-[#D5DDE6] accent-[#163B65]"
          />
          Overdue only
        </label>
        <select
          className="rounded border border-[#D5DDE6] px-2.5 py-1.5 text-[13px] text-[#172B40] focus:outline-none focus:ring-2 focus:ring-[#163B65]/15"
          value={filterRegion}
          onChange={(e) => setFilterRegion(e.target.value)}
        >
          <option value="">All Regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <span className="ml-auto text-[11px] text-[#8290A0]">
          {apps.length} application{apps.length !== 1 ? "s" : ""} in scrutiny
        </span>
      </div>

      {/* Application cards */}
      {apps.length === 0 ? (
        <div className="bg-white rounded border border-[#E1E7ED] py-16 text-center">
          <p className="text-[14px] text-[#8290A0]">
            No applications awaiting scrutiny{filterOverdue ? " (overdue)" : ""}.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {apps.map((app) => {
            const inst = afStore.getInstitution(app.institutionId);
            const overdue = isOverdue(app);
            const defTasks = afStore
              .getTasksForApp(app.id)
              .filter((t) => t.type === "Deficiency" && t.status !== "Resolved");
            const docs = afStore.getDocumentsForApp(app.id);
            const verifiedDocs = docs.filter((d) => d.verified).length;
            return (
              <div
                key={app.id}
                className={`bg-white rounded border ${overdue ? "border-red-200 bg-red-50" : "border-[#E1E7ED]"} overflow-hidden`}
              >
                {/* Card header */}
                <div
                  className={`px-4 py-3 border-b ${overdue ? "border-red-200 bg-red-50" : "border-[#E1E7ED] bg-[#F5F7FA]"} flex items-start justify-between`}
                >
                  <div>
                    <div className="flex items-center flex-wrap gap-1.5 mb-0.5">
                      <code className="font-mono text-[10px] text-[#8290A0]">{app.id}</code>
                      <StageBadge stage={app.currentStage} />
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
                  {app.deficiencyCount > 0 && (
                    <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">
                      {app.deficiencyCount} deficienc{app.deficiencyCount > 1 ? "ies" : "y"}
                    </span>
                  )}
                </div>

                {/* Card body */}
                <div className="px-4 py-3 space-y-3">
                  <SlaBar slaDeadline={app.slaDeadline} />

                  {/* Document status */}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[#5F6F82]">Documents verified</span>
                    <span
                      className={`font-semibold ${verifiedDocs === docs.length && docs.length > 0 ? "text-green-700" : "text-amber-600"}`}
                    >
                      {verifiedDocs} / {docs.length}
                    </span>
                  </div>

                  {defTasks.length > 0 && (
                    <div className="rounded bg-amber-50 border border-amber-200 px-3 py-2">
                      <p className="text-[11px] text-amber-700 font-medium">
                        ⚠ {defTasks.length} open deficiency task{defTasks.length > 1 ? "s" : ""}
                      </p>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2 flex-wrap pt-1">
                    <button
                      disabled={!canAct}
                      className={`rounded px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                        canAct
                          ? "bg-[#163B65] hover:bg-[#102F52] text-white"
                          : "bg-[#E1E7ED] text-[#8290A0] cursor-not-allowed"
                      }`}
                      onClick={() => handle(app.id, "approve")}
                    >
                      Forward to Recommendation
                    </button>
                    <button
                      disabled={!canAct}
                      className={`rounded px-3 py-1.5 text-[11px] font-semibold border transition-colors ${
                        canAct
                          ? "border-violet-300 text-violet-700 hover:bg-violet-50"
                          : "border-[#E1E7ED] text-[#8290A0] cursor-not-allowed"
                      }`}
                      onClick={() => handle(app.id, "send_evc")}
                    >
                      Send to EVC
                    </button>
                    <button
                      disabled={!canAct}
                      className={`rounded px-3 py-1.5 text-[11px] font-semibold border transition-colors ${
                        canAct
                          ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                          : "border-[#E1E7ED] text-[#8290A0] cursor-not-allowed"
                      }`}
                      onClick={() => setShowDefForm(showDefForm === app.id ? null : app.id)}
                    >
                      Raise Deficiency
                    </button>
                  </div>

                  {/* Inline deficiency form */}
                  {showDefForm === app.id && canAct && (
                    <div className="rounded border border-amber-200 bg-amber-50 p-3 space-y-2">
                      <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">
                        Deficiency Notice
                      </p>
                      <textarea
                        className="w-full rounded border border-amber-200 bg-white px-3 py-2 text-[13px] text-[#172B40] resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
                        rows={2}
                        placeholder="Describe the deficiency or missing requirement…"
                        value={defDesc}
                        onChange={(e) => setDefDesc(e.target.value)}
                      />
                      <input
                        type="date"
                        className="w-full rounded border border-amber-200 bg-white px-3 py-2 text-[13px] text-[#172B40] focus:outline-none focus:ring-2 focus:ring-amber-300"
                        value={defDue}
                        onChange={(e) => setDefDue(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button
                          className="rounded bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold px-3 py-1.5 transition-colors"
                          onClick={() => handle(app.id, "raise_deficiency")}
                        >
                          Issue Notice
                        </button>
                        <button
                          className="rounded border border-[#D5DDE6] text-[#5F6F82] text-[11px] px-3 py-1.5 hover:bg-[#F0F3F6] transition-colors"
                          onClick={() => setShowDefForm(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
