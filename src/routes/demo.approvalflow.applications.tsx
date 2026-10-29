// ApprovalFlow AI — Applications Management
// Route: /demo/approvalflow/applications
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useCallback } from "react";
import { useDemoRole } from "@/lib/demo-role-store";
import {
  afStore,
  storeEvents,
  getDemoUserId,
  isOverdue,
  daysUntil,
  computeSlaStatus,
  stageAgeingDays,
  STAGE_LABELS,
  STAGE_COLORS,
  STAGE_TRANSITIONS,
  APP_TYPE_LABELS,
  type Application,
  type Stage as AppStage,
  type AppType,
  type DocType,
} from "@/lib/approval-flow";

export const Route = createFileRoute("/demo/approvalflow/applications")({
  ssr: false,
  head: () => ({ meta: [{ title: "Applications — ApprovalFlow AI" }] }),
  component: ApplicationsPage,
});

// ── Shared helpers ────────────────────────────────────────────────────────────
function StageBadge({ stage }: { stage: AppStage }) {
  const govColors: Record<AppStage, string> = {
    Submitted: "bg-slate-100 text-slate-700 border border-slate-200",
    Scrutiny: "bg-blue-50 text-blue-700 border border-blue-200",
    Deficiency: "bg-amber-50 text-amber-700 border border-amber-200",
    ReScrutiny: "bg-purple-50 text-purple-700 border border-purple-200",
    EVC: "bg-violet-50 text-violet-700 border border-violet-200",
    Recommendation: "bg-indigo-50 text-indigo-700 border border-indigo-200",
    SAC_SHC: "bg-teal-50 text-teal-700 border border-teal-200",
    Decision: "bg-orange-50 text-orange-700 border border-orange-200",
    Approved: "bg-green-50 text-green-700 border border-green-200",
    Rejected: "bg-red-50 text-red-700 border border-red-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold ${govColors[stage]}`}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}

function OverdueBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
      ⚠ Overdue
    </span>
  );
}

/** SLA status badge — uses computeSlaStatus from the store */
function SlaBadge({ app }: { app: Application }) {
  const { status, daysRemaining } = computeSlaStatus(app, app.currentStage);
  if (status === "completed")
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200">
        ✓ Completed
      </span>
    );
  if (status === "overdue")
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
        ⚠ {Math.abs(daysRemaining)}d Overdue
      </span>
    );
  if (status === "due_soon")
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        ⏳ {daysRemaining}d Due Soon
      </span>
    );
  return (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium bg-[#EEF3F8] text-[#5F6F82] border border-[#E1E7ED]">
      ✓ On Track · {daysRemaining}d
    </span>
  );
}

/** Stage ageing chip — shows days at current stage from stageEntered */
function AgeingChip({ app }: { app: Application }) {
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
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border ${cls}`}
    >
      {days}d here
    </span>
  );
}

function SlaIndicator({ slaDeadline }: { slaDeadline: string }) {
  const dl = daysUntil(slaDeadline);
  if (dl < 0)
    return <span className="text-[11px] font-semibold text-red-600">{Math.abs(dl)}d overdue</span>;
  if (dl < 7) return <span className="text-[11px] font-semibold text-amber-600">{dl}d left</span>;
  return <span className="text-[11px] text-[#8290A0]">{dl}d left</span>;
}

// ── Workflow timeline ─────────────────────────────────────────────────────────
const ALL_STAGES: AppStage[] = [
  "Submitted",
  "Scrutiny",
  "Deficiency",
  "ReScrutiny",
  "EVC",
  "Recommendation",
  "SAC_SHC",
  "Decision",
  "Approved",
  "Rejected",
];

function WorkflowTimeline({ currentStage }: { currentStage: AppStage }) {
  const mainFlow: AppStage[] = [
    "Submitted",
    "Scrutiny",
    "EVC",
    "Recommendation",
    "SAC_SHC",
    "Decision",
    "Approved",
  ];
  const currentIdx = mainFlow.indexOf(currentStage);
  return (
    <div className="overflow-x-auto">
      <div className="flex items-center min-w-[500px]">
        {mainFlow.map((stage, idx) => {
          const isDone = currentIdx > idx;
          const isCurrent = currentStage === stage || (currentIdx === -1 && stage === "Submitted");
          const isRejected = currentStage === "Rejected";
          return (
            <div key={stage} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all
                  ${
                    isDone
                      ? "bg-[#163B65] text-white"
                      : isCurrent
                        ? "bg-[#E99A35] text-white ring-2 ring-[#E99A35]/30 ring-offset-1"
                        : isRejected && idx === mainFlow.length - 1
                          ? "bg-red-500 text-white"
                          : "bg-[#E1E7ED] text-[#8290A0]"
                  }`}
                >
                  {isDone ? "✓" : idx + 1}
                </div>
                <span
                  className={`text-[9px] mt-1 text-center leading-tight w-14
                  ${isCurrent ? "text-[#E99A35] font-semibold" : isDone ? "text-[#163B65] font-medium" : "text-[#8290A0]"}`}
                >
                  {STAGE_LABELS[stage]}
                </span>
              </div>
              {idx < mainFlow.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mb-4 mx-1 ${isDone ? "bg-[#163B65]" : "bg-[#E1E7ED]"}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Application detail panel ──────────────────────────────────────────────────
function ApplicationDetail({
  app,
  userId,
  canEdit,
  onClose,
  onRefresh,
}: {
  app: Application;
  userId: string;
  canEdit: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [activeTab, setActiveTab] = useState<"overview" | "docs" | "tasks" | "timeline">(
    "overview",
  );
  const [toast, setToast] = useState("");
  const [transitionStage, setTransitionStage] = useState<AppStage | null>(null);
  const [transitionRemarks, setTransitionRemarks] = useState("");
  const [defDesc, setDefDesc] = useState("");
  const [defDue, setDefDue] = useState("");
  const [showDefForm, setShowDefForm] = useState(false);
  const [uploadType, setUploadType] = useState<DocType>("LAND_DOC");
  const [uploadName, setUploadName] = useState("");
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [comment, setComment] = useState("");
  const [evcDate, setEvcDate] = useState("");

  const inst = afStore.getInstitution(app.institutionId);
  const docs = afStore.getDocumentsForApp(app.id);
  const tasks = afStore.getTasksForApp(app.id);
  const auditLogs = afStore.getAuditLogsForApp(app.id);
  const allowed = STAGE_TRANSITIONS[app.currentStage] ?? [];
  const dl = daysUntil(app.slaDeadline);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const doTransition = () => {
    if (!transitionStage) return;
    try {
      afStore.transitionStage(app.id, transitionStage, userId, transitionRemarks || undefined);
      notify(`Moved to ${STAGE_LABELS[transitionStage]}`);
      setTransitionStage(null);
      setTransitionRemarks("");
      onRefresh();
    } catch (e) {
      notify(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const doRaiseDeficiency = () => {
    if (!defDesc) return notify("Please enter a deficiency description");
    if (!defDue) return notify("Please select a due date");
    afStore.raiseDeficiency(app.id, defDesc, defDue, userId, userId);
    afStore.transitionStage(app.id, "Deficiency", userId, "Deficiency raised");
    notify("Deficiency notice raised and stage updated");
    setDefDesc("");
    setDefDue("");
    setShowDefForm(false);
    onRefresh();
  };

  const doUpload = () => {
    if (!uploadName) return notify("Please enter the file name");
    afStore.uploadDocument(app.id, uploadType, uploadName, userId);
    notify(`${uploadName} uploaded successfully`);
    setUploadName("");
    setShowUploadForm(false);
    onRefresh();
  };

  const doComment = () => {
    if (!comment) return;
    afStore.addAuditComment(app.id, userId, comment);
    notify("Comment added to audit log");
    setComment("");
    onRefresh();
  };

  const doScheduleEVC = () => {
    if (!evcDate) return notify("Please select an EVC date");
    afStore.scheduleEVC(app.id, evcDate, ["Dr. Mohan", "Dr. Nair"], userId);
    afStore.transitionStage(app.id, "EVC", userId, `EVC scheduled on ${evcDate}`);
    notify(`EVC visit scheduled for ${evcDate}`);
    setEvcDate("");
    onRefresh();
  };

  const TABS = ["overview", "docs", "tasks", "timeline"] as const;
  const TAB_LABELS = {
    overview: "Overview",
    docs: `Documents (${docs.length})`,
    tasks: `Tasks (${tasks.length})`,
    timeline: `Activity Timeline (${auditLogs.length})`,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded bg-[#163B65] text-white px-4 py-2.5 text-sm font-medium shadow-xl flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#E99A35]" />
          {toast}
        </div>
      )}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative h-full w-full max-w-2xl bg-white border-l border-[#E1E7ED] overflow-auto shadow-2xl flex flex-col">
        {/* Panel header */}
        <div className="p-5 border-b border-[#E1E7ED] bg-[#F5F7FA]">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center flex-wrap gap-1.5 mb-1">
                <code className="text-[11px] font-mono text-[#8290A0] bg-white border border-[#E1E7ED] px-1.5 py-0.5 rounded">
                  {app.id}
                </code>
                <StageBadge stage={app.currentStage} />
                {isOverdue(app) && <OverdueBadge />}
              </div>
              <h2 className="text-[17px] font-semibold text-[#172B40]">
                {inst?.name ?? app.institutionId}
              </h2>
              <p className="text-xs text-[#5F6F82] mt-0.5">
                {APP_TYPE_LABELS[app.appType]} · {app.region} · {inst?.state}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded hover:bg-[#E1E7ED] text-[#8290A0] hover:text-[#172B40] transition-colors"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M1 1l12 12M13 1L1 13" />
              </svg>
            </button>
          </div>

          {/* SLA progress bar */}
          <div className="mt-4">
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-[#8290A0]">
                SLA Deadline: <span className="font-medium text-[#172B40]">{app.slaDeadline}</span>
              </span>
              <SlaIndicator slaDeadline={app.slaDeadline} />
            </div>
            <div className="h-1.5 rounded-full bg-[#E1E7ED] overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${dl < 0 ? "bg-red-500 w-full" : dl < 7 ? "bg-amber-500" : "bg-[#163B65]"}`}
                style={{ width: dl < 0 ? "100%" : `${Math.max(5, 100 - (dl / 60) * 100)}%` }}
              />
            </div>
          </div>

          {/* Workflow timeline */}
          <div className="mt-4">
            <WorkflowTimeline currentStage={app.currentStage} />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#E1E7ED] bg-white">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-[12px] font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-[#163B65] text-[#163B65]"
                  : "border-transparent text-[#8290A0] hover:text-[#172B40]"
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {/* Panel body */}
        <div className="p-5 space-y-4 flex-1 overflow-auto bg-[#F5F7FA]">
          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <>
              <div className="bg-white rounded border border-[#E1E7ED] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-[#E1E7ED] bg-[#F5F7FA]">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6F82]">
                    Application Details
                  </p>
                </div>
                <div className="grid grid-cols-2 divide-x divide-y divide-[#E1E7ED]">
                  {(
                    [
                      ["Institution", inst?.name ?? "-"],
                      ["AICTE ID", inst?.aicteId ?? "-"],
                      ["Region / State", `${app.region} · ${inst?.state ?? "-"}`],
                      ["Application Type", APP_TYPE_LABELS[app.appType]],
                      ["Submitted On", app.submittedOn],
                      ["SLA Deadline", app.slaDeadline],
                      ["Deficiency Count", String(app.deficiencyCount)],
                      ["Status", app.status],
                    ] as [string, string][]
                  ).map(([k, v]) => (
                    <div key={k} className="px-4 py-2.5">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8290A0] mb-0.5">
                        {k}
                      </p>
                      <p className="text-[13px] font-medium text-[#172B40]">{v}</p>
                    </div>
                  ))}
                </div>
                {/* Stage ageing row */}
                {(() => {
                  const ageDays = stageAgeingDays(app);
                  if (ageDays === null) return null;
                  return (
                    <div className="px-4 py-2.5 border-t border-[#E1E7ED] flex items-center justify-between">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8290A0]">
                        Time at Current Stage
                      </p>
                      <AgeingChip app={app} />
                    </div>
                  );
                })()}
                {/* SLA status row */}
                <div className="px-4 py-2.5 border-t border-[#E1E7ED] flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8290A0]">
                    SLA Status
                  </p>
                  <SlaBadge app={app} />
                </div>
              </div>

              {/* Stage Transition */}
              {canEdit && allowed.length > 0 && (
                <div className="bg-white rounded border border-[#E1E7ED]">
                  <div className="px-4 py-2.5 border-b border-[#E1E7ED] bg-[#F5F7FA]">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6F82]">
                      Stage Transition
                    </p>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="flex gap-2 flex-wrap">
                      {allowed.map((s) => (
                        <button
                          key={s}
                          onClick={() => setTransitionStage(s)}
                          className={`rounded px-3 py-1.5 text-[12px] font-medium border transition-colors ${
                            transitionStage === s
                              ? "bg-[#163B65] text-white border-[#163B65]"
                              : "border-[#D5DDE6] text-[#5F6F82] hover:border-[#163B65] hover:text-[#163B65]"
                          }`}
                        >
                          → {STAGE_LABELS[s]}
                        </button>
                      ))}
                    </div>
                    {transitionStage && (
                      <>
                        <textarea
                          className="w-full rounded border border-[#D5DDE6] bg-white px-3 py-2 text-[13px] text-[#172B40] resize-none focus:outline-none focus:ring-2 focus:ring-[#163B65]/20 focus:border-[#163B65]"
                          rows={2}
                          placeholder="Officer remarks (optional)"
                          value={transitionRemarks}
                          onChange={(e) => setTransitionRemarks(e.target.value)}
                        />
                        <button
                          className="rounded bg-[#163B65] hover:bg-[#102F52] text-white font-semibold text-[12px] px-4 py-2 transition-colors"
                          onClick={doTransition}
                        >
                          Confirm → {STAGE_LABELS[transitionStage]}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Raise Deficiency */}
              {canEdit &&
                (app.currentStage === "Scrutiny" || app.currentStage === "ReScrutiny") && (
                  <div className="bg-white rounded border border-amber-200">
                    <div className="px-4 py-2.5 border-b border-amber-200 bg-amber-50 flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
                        Raise Deficiency Notice
                      </p>
                      <button
                        onClick={() => setShowDefForm(!showDefForm)}
                        className="text-[11px] text-amber-600 underline hover:no-underline"
                      >
                        {showDefForm ? "Cancel" : "Add Notice"}
                      </button>
                    </div>
                    {showDefForm && (
                      <div className="p-4 space-y-2">
                        <textarea
                          className="w-full rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-[#172B40] resize-none focus:outline-none focus:ring-2 focus:ring-amber-300"
                          rows={2}
                          placeholder="Describe the deficiency…"
                          value={defDesc}
                          onChange={(e) => setDefDesc(e.target.value)}
                        />
                        <input
                          type="date"
                          className="w-full rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-[#172B40] focus:outline-none focus:ring-2 focus:ring-amber-300"
                          value={defDue}
                          onChange={(e) => setDefDue(e.target.value)}
                        />
                        <button
                          className="rounded bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[12px] px-4 py-2 transition-colors"
                          onClick={doRaiseDeficiency}
                        >
                          Raise Deficiency Notice
                        </button>
                      </div>
                    )}
                  </div>
                )}

              {/* EVC Scheduling */}
              {canEdit && app.currentStage === "EVC" && (
                <div className="bg-white rounded border border-violet-200">
                  <div className="px-4 py-2.5 border-b border-violet-200 bg-violet-50">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700">
                      Schedule Expert Visit Committee
                    </p>
                  </div>
                  <div className="p-4">
                    <div className="flex gap-2">
                      <input
                        type="date"
                        className="rounded border border-[#D5DDE6] px-3 py-2 text-[13px] text-[#172B40] focus:outline-none focus:ring-2 focus:ring-violet-300 flex-1"
                        value={evcDate}
                        onChange={(e) => setEvcDate(e.target.value)}
                      />
                      <button
                        className="rounded bg-violet-600 hover:bg-violet-700 text-white font-semibold text-[12px] px-4 py-2 transition-colors"
                        onClick={doScheduleEVC}
                      >
                        Schedule Visit
                      </button>
                    </div>
                    {app.evcDate && (
                      <p className="text-[11px] text-violet-600 mt-2">
                        Currently scheduled: <strong>{app.evcDate}</strong>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Add comment */}
              <div className="bg-white rounded border border-[#E1E7ED]">
                <div className="px-4 py-2.5 border-b border-[#E1E7ED] bg-[#F5F7FA]">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6F82]">
                    Add Remark
                  </p>
                </div>
                <div className="p-4">
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded border border-[#D5DDE6] px-3 py-2 text-[13px] text-[#172B40] focus:outline-none focus:ring-2 focus:ring-[#163B65]/20 focus:border-[#163B65]"
                      placeholder="Enter officer remark or note…"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && doComment()}
                    />
                    <button
                      className="rounded bg-[#163B65] hover:bg-[#102F52] text-white font-semibold text-[12px] px-4 py-2 transition-colors"
                      onClick={doComment}
                    >
                      Post
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* DOCUMENTS TAB */}
          {activeTab === "docs" && (
            <div className="bg-white rounded border border-[#E1E7ED]">
              <div className="px-4 py-2.5 border-b border-[#E1E7ED] bg-[#F5F7FA] flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6F82]">
                  Uploaded Documents
                </p>
                {canEdit && (
                  <button
                    onClick={() => setShowUploadForm(!showUploadForm)}
                    className="text-[11px] text-[#163B65] underline hover:no-underline"
                  >
                    {showUploadForm ? "Cancel" : "+ Upload Document"}
                  </button>
                )}
              </div>

              {showUploadForm && canEdit && (
                <div className="p-4 border-b border-[#E1E7ED] bg-blue-50 space-y-2">
                  <select
                    className="w-full rounded border border-[#D5DDE6] bg-white px-3 py-2 text-[13px] text-[#172B40]"
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value as DocType)}
                  >
                    {(
                      [
                        "LAND_DOC",
                        "BUILDING_PLAN",
                        "OCC_CERT",
                        "FIRE_NOC",
                        "NOC_STATE",
                        "AFFIDAVIT",
                        "FDR",
                        "LEASE_RENEWAL",
                        "FACULTY_LIST",
                      ] as DocType[]
                    ).map((t) => (
                      <option key={t} value={t}>
                        {t.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  <input
                    className="w-full rounded border border-[#D5DDE6] bg-white px-3 py-2 text-[13px] text-[#172B40] focus:outline-none focus:ring-2 focus:ring-[#163B65]/20"
                    placeholder="File name (e.g. land_certificate.pdf)"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                  />
                  <button
                    className="rounded bg-[#163B65] hover:bg-[#102F52] text-white font-semibold text-[12px] px-4 py-2 transition-colors"
                    onClick={doUpload}
                  >
                    Upload Document
                  </button>
                </div>
              )}

              {docs.length === 0 ? (
                <p className="p-8 text-center text-[13px] text-[#8290A0]">
                  No documents have been uploaded for this application.
                </p>
              ) : (
                <div className="divide-y divide-[#E1E7ED]">
                  {docs.map((doc) => (
                    <div
                      key={doc.id}
                      className={`flex items-start justify-between px-4 py-3 ${doc.verified ? "bg-green-50" : ""}`}
                    >
                      <div>
                        <p className="font-semibold text-[13px] text-[#172B40]">
                          {doc.type.replace(/_/g, " ")}
                        </p>
                        <p className="text-[11px] text-[#8290A0] font-mono">{doc.fileName}</p>
                        {doc.flags?.map((f, i) => (
                          <p key={i} className="text-[10px] text-amber-600 mt-0.5">
                            ⚠ {f}
                          </p>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        {doc.verified ? (
                          <span className="text-[11px] text-green-700 font-semibold bg-green-100 border border-green-200 px-2 py-0.5 rounded">
                            ✓ Verified
                          </span>
                        ) : canEdit ? (
                          <button
                            className="text-[11px] bg-[#163B65] hover:bg-[#102F52] text-white font-semibold px-3 py-1 rounded transition-colors"
                            onClick={() => {
                              afStore.verifyDocument(doc.id, userId);
                              notify("Document verified");
                              onRefresh();
                            }}
                          >
                            Verify
                          </button>
                        ) : (
                          <span className="text-[11px] text-amber-600 font-medium">Pending</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TASKS TAB */}
          {activeTab === "tasks" && (
            <div className="bg-white rounded border border-[#E1E7ED]">
              <div className="px-4 py-2.5 border-b border-[#E1E7ED] bg-[#F5F7FA]">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6F82]">
                  Compliance Tasks
                </p>
              </div>
              {tasks.length === 0 ? (
                <p className="p-8 text-center text-[13px] text-[#8290A0]">
                  No compliance tasks for this application.
                </p>
              ) : (
                <div className="divide-y divide-[#E1E7ED]">
                  {tasks.map((task) => {
                    const dl2 = daysUntil(task.dueDate);
                    const resolved = task.status === "Resolved";
                    return (
                      <div key={task.id} className={`px-4 py-3 ${resolved ? "opacity-60" : ""}`}>
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold text-[13px] text-[#172B40]">{task.type}</p>
                            <p className="text-[12px] text-[#5F6F82] mt-0.5">{task.description}</p>
                            <p
                              className={`text-[11px] mt-1 font-medium ${dl2 < 0 ? "text-red-600" : dl2 < 7 ? "text-amber-600" : "text-[#8290A0]"}`}
                            >
                              Due: {task.dueDate} (
                              {dl2 < 0 ? `${Math.abs(dl2)}d overdue` : `${dl2}d remaining`})
                            </p>
                          </div>
                          {!resolved && canEdit ? (
                            <button
                              className="text-[11px] bg-green-600 hover:bg-green-700 text-white font-semibold px-3 py-1 rounded transition-colors flex-shrink-0"
                              onClick={() => {
                                afStore.resolveTask(task.id, userId);
                                notify("Task resolved");
                                onRefresh();
                              }}
                            >
                              Mark Resolved
                            </button>
                          ) : resolved ? (
                            <span className="text-[11px] text-green-700 font-semibold">
                              Resolved
                            </span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ACTIVITY TIMELINE TAB */}
          {activeTab === "timeline" && (
            <div className="bg-white rounded border border-[#E1E7ED] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#E1E7ED] bg-[#F5F7FA]">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6F82]">
                  Activity Timeline
                </p>
              </div>
              <div className="p-4">
                <ActivityTimeline appId={app.id} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Applications Page ────────────────────────────────────────────────────
function ApplicationsPage() {
  const [role] = useDemoRole();
  const userId = getDemoUserId(role);
  const roleStr = role as string | null;
  const canEdit = roleStr === "aicte_office" || roleStr === "admin" || roleStr === "institution";
  const [search, setSearch] = useState("");
  const [filterStage, setFilterStage] = useState<AppStage | "">("");
  const [filterRegion, setFilterRegion] = useState("");
  const [filterType, setFilterType] = useState<AppType | "">("");
  const [selectedApp, setSelectedApp] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const unsub = storeEvents.subscribe(() => setTick((t) => t + 1));
    return unsub;
  }, []);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const apps = useMemo(() => {
    return afStore.applications.filter((app) => {
      if (filterStage && app.currentStage !== filterStage) return false;
      if (filterRegion && app.region !== filterRegion) return false;
      if (filterType && app.appType !== filterType) return false;
      if (roleStr === "institution" && app.institutionId !== "inst-1") return false;
      if (search) {
        const term = search.toLowerCase();
        const inst = afStore.getInstitution(app.institutionId);
        return (
          app.id.toLowerCase().includes(term) ||
          inst?.name?.toLowerCase().includes(term) ||
          inst?.aicteId?.toLowerCase().includes(term) ||
          app.region.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [search, filterStage, filterRegion, filterType, role, tick]);

  const regions = Array.from(new Set(afStore.applications.map((a) => a.region)));
  const stats = afStore.getStats();

  return (
    <div className="space-y-5">
      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: "Total Applications",
            value: stats.total,
            color: "text-[#163B65]",
            border: "border-[#E1E7ED]",
          },
          {
            label: "Pending",
            value: stats.pending,
            color: "text-amber-600",
            border: "border-amber-200",
          },
          {
            label: "Overdue",
            value: stats.overdue,
            color: "text-red-600",
            border: "border-red-200",
          },
          {
            label: "Approved",
            value: stats.approved,
            color: "text-green-700",
            border: "border-green-200",
          },
        ].map((s) => (
          <div key={s.label} className={`stat-card border-l-4 ${s.border}`}>
            <p className={`kpi-number ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-[#8290A0] mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded border border-[#E1E7ED] p-3 flex flex-wrap gap-2.5 items-center">
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8290A0]"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            className="pl-8 pr-3 py-1.5 rounded border border-[#D5DDE6] bg-white text-[13px] text-[#172B40] placeholder-[#8290A0] focus:outline-none focus:ring-2 focus:ring-[#163B65]/15 focus:border-[#163B65] w-56"
            placeholder="Search institution, ID, region…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="rounded border border-[#D5DDE6] px-2.5 py-1.5 text-[13px] text-[#172B40] focus:outline-none focus:ring-2 focus:ring-[#163B65]/15 focus:border-[#163B65]"
          value={filterStage}
          onChange={(e) => setFilterStage(e.target.value as AppStage)}
        >
          <option value="">All Stages</option>
          {Object.entries(STAGE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          className="rounded border border-[#D5DDE6] px-2.5 py-1.5 text-[13px] text-[#172B40] focus:outline-none focus:ring-2 focus:ring-[#163B65]/15 focus:border-[#163B65]"
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
        <select
          className="rounded border border-[#D5DDE6] px-2.5 py-1.5 text-[13px] text-[#172B40] focus:outline-none focus:ring-2 focus:ring-[#163B65]/15 focus:border-[#163B65]"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as AppType)}
        >
          <option value="">All Types</option>
          {(["NEW_INSTITUTION", "EOA", "INTAKE_INCREASE"] as AppType[]).map((t) => (
            <option key={t} value={t}>
              {APP_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        {(search || filterStage || filterRegion || filterType) && (
          <button
            className="text-[11px] text-[#5F6F82] hover:text-[#163B65] underline"
            onClick={() => {
              setSearch("");
              setFilterStage("");
              setFilterRegion("");
              setFilterType("");
            }}
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-[11px] text-[#8290A0]">
          {apps.length} of {stats.total} applications
        </span>
      </div>

      {/* Applications table */}
      <div className="bg-white rounded border border-[#E1E7ED] overflow-hidden">
        {apps.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-[14px] text-[#8290A0]">
              No applications match the selected filters.
            </p>
            <p className="text-[12px] text-[#8290A0]/70 mt-1">
              Try adjusting your search or filter criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full gov-table">
              <thead>
                <tr>
                  <th>Reference No.</th>
                  <th>Institution</th>
                  <th>Type</th>
                  <th>Region</th>
                  <th>Stage / Ageing</th>
                  <th>SLA Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => {
                  const inst = afStore.getInstitution(app.institutionId);
                  const overdue = isOverdue(app);
                  return (
                    <tr
                      key={app.id}
                      className={`cursor-pointer ${overdue ? "bg-red-50" : ""}`}
                      onClick={() => setSelectedApp(app.id)}
                    >
                      <td>
                        <code className="font-mono text-[11px] text-[#5F6F82] bg-[#F0F3F6] px-1.5 py-0.5 rounded">
                          {app.id}
                        </code>
                      </td>
                      <td>
                        <p className="font-semibold text-[13px] text-[#172B40]">{inst?.name}</p>
                        <p className="text-[10px] text-[#8290A0] font-mono">{inst?.aicteId}</p>
                      </td>
                      <td className="text-[12px] text-[#5F6F82]">{APP_TYPE_LABELS[app.appType]}</td>
                      <td className="text-[12px] text-[#5F6F82]">{app.region}</td>
                      <td>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <StageBadge stage={app.currentStage} />
                          <AgeingChip app={app} />
                        </div>
                      </td>
                      <td>
                        <SlaBadge app={app} />
                      </td>
                      <td>
                        <span className="text-[12px] text-[#163B65] font-medium hover:underline">
                          View →
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Application detail panel */}
      {selectedApp && afStore.getApplication(selectedApp) && (
        <ApplicationDetail
          app={afStore.getApplication(selectedApp)!}
          userId={userId}
          canEdit={canEdit}
          onClose={() => setSelectedApp(null)}
          onRefresh={refresh}
        />
      )}
    </div>
  );
}

/** Activity timeline – chronological display of stored audit events */
function ActivityTimeline({ appId }: { appId: string }) {
  const logs = [...afStore.getAuditLogsForApp(appId)].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
  if (logs.length === 0)
    return <p className="p-8 text-center text-[13px] text-[#8290A0]">No audit events found.</p>;

  const iconForAction = (action: string): string => {
    if (action.toLowerCase().includes("submitted")) return "📋";
    if (action.toLowerCase().includes("assigned")) return "👤";
    if (action.toLowerCase().includes("uploaded")) return "📎";
    if (action.toLowerCase().includes("verified")) return "✅";
    if (action.toLowerCase().includes("deficiency")) return "⚠";
    if (action.toLowerCase().includes("evc")) return "🔍";
    if (action.toLowerCase().includes("resolved")) return "✔";
    if (action.toLowerCase().includes("approved")) return "🎉";
    if (action.toLowerCase().includes("rejected")) return "❌";
    if (action.toLowerCase().includes("comment")) return "💬";
    if (action.toLowerCase().includes("transition") || action.toLowerCase().includes("moved"))
      return "➡";
    return "📌";
  };

  return (
    <div className="relative pl-6 py-2">
      <div className="absolute left-[11px] top-0 bottom-0 w-0.5 bg-[#E1E7ED]" />
      <div className="space-y-1">
        {logs.map((log) => (
          <div key={log.id} className="relative flex gap-3 pb-3">
            <div className="absolute -left-6 flex items-start">
              <div className="mt-0.5 h-5 w-5 rounded-full bg-white border-2 border-[#163B65]/30 flex items-center justify-center text-[10px] z-10">
                {iconForAction(log.action)}
              </div>
            </div>
            <div className="flex-1 min-w-0 bg-white border border-[#E1E7ED] rounded px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-[12px] font-semibold text-[#172B40] leading-snug">
                  {log.action}
                </p>
                <span className="text-[10px] text-[#8290A0] shrink-0">
                  {new Date(log.timestamp).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              {log.fromStage && log.toStage && (
                <p className="text-[10px] text-[#163B65] mt-0.5 font-medium">
                  {STAGE_LABELS[log.fromStage]} → {STAGE_LABELS[log.toStage]}
                </p>
              )}
              {!log.fromStage && log.toStage && (
                <p className="text-[10px] text-[#163B65] mt-0.5">
                  Stage: {STAGE_LABELS[log.toStage]}
                </p>
              )}
              <p className="text-[10px] text-[#8290A0] mt-0.5">
                Officer: <code className="font-mono">{log.userId}</code>
              </p>
              {log.remarks && (
                <p className="text-[11px] italic text-[#5F6F82] mt-1 border-l-2 border-[#163B65]/20 pl-2">
                  &ldquo;{log.remarks}&rdquo;
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
