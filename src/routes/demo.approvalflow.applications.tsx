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
import { postApprovalStore } from "@/lib/post-approval";
import {
  caseIntelligenceService,
  type CaseIntelligenceResult,
  type CommunicationDraft,
  type CommunicationDraftType,
} from "@/lib/case-intelligence";

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
  const [role] = useDemoRole();
  const roleStr = role as string | null;
  const [activeTab, setActiveTab] = useState<
    "overview" | "case-intelligence" | "docs" | "tasks" | "timeline"
  >("overview");
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
  const [conditionTitle, setConditionTitle] = useState("");
  const [conditionDesc, setConditionDesc] = useState("");
  const [conditionDue, setConditionDue] = useState("");
  const [hasConditions, setHasConditions] = useState(false);

  // Case Intelligence state
  const [intel, setIntel] = useState<CaseIntelligenceResult | null>(null);
  const [loadingIntel, setLoadingIntel] = useState(false);
  const [intelError, setIntelError] = useState<string | null>(null);
  const [draftType, setDraftType] = useState<CommunicationDraftType>("DEFICIENCY_NOTICE");
  const [draftInstructions, setDraftInstructions] = useState("");
  const [currentDraft, setCurrentDraft] = useState<CommunicationDraft | null>(null);
  const [isDrafting, setIsDrafting] = useState(false);

  const fetchIntelligence = useCallback(async () => {
    setLoadingIntel(true);
    setIntelError(null);
    try {
      const res = await caseIntelligenceService.getCaseIntelligence(app.id);
      setIntel(res);
    } catch (e) {
      setIntelError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingIntel(false);
    }
  }, [app.id]);

  useEffect(() => {
    fetchIntelligence();
  }, [fetchIntelligence]);

  const handleGenerateDraft = async (typeToGen?: CommunicationDraftType) => {
    const t = typeToGen || draftType;
    setIsDrafting(true);
    try {
      const d = await caseIntelligenceService.generateDraft(
        app.id,
        t,
        draftInstructions.trim() || undefined,
      );
      setCurrentDraft(d);
      notify(`${d.title} generated.`);
    } catch (e) {
      notify(`Failed to generate draft: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsDrafting(false);
    }
  };

  const handleSaveDraft = () => {
    if (!currentDraft) return;
    caseIntelligenceService.saveDraftToAuditTrail({
      appId: app.id,
      draft: currentDraft,
      userId,
    });
    notify("Draft saved to application audit trail.");
    onRefresh();
  };

  const handleDispatchDraft = () => {
    if (!currentDraft) return;
    caseIntelligenceService.dispatchDraftNotification({
      appId: app.id,
      draft: currentDraft,
      targetRole: "institution",
    });
    notify("Official notification dispatched to institution portal.");
    onRefresh();
  };

  const handleCopyDraft = () => {
    if (!currentDraft) return;
    navigator.clipboard.writeText(currentDraft.body);
    notify("Draft copied to clipboard.");
  };

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

      // If approved with conditions, generate undertaking
      if (transitionStage === "Approved" && hasConditions && conditionTitle.trim()) {
        postApprovalStore.createUndertaking({
          appId: app.id,
          institutionId: app.institutionId,
          title: conditionTitle.trim(),
          conditionDescription: conditionDesc.trim() || conditionTitle.trim(),
          assignedResponsibility: "Head of Institution / Principal",
          dueDate: conditionDue || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
          userId,
        });
        notify(`Application Approved & Mandatory Undertaking recorded.`);
      } else {
        notify(`Moved to ${STAGE_LABELS[transitionStage]}`);
      }

      setTransitionStage(null);
      setTransitionRemarks("");
      setConditionTitle("");
      setConditionDesc("");
      setConditionDue("");
      setHasConditions(false);
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

  const TABS = ["overview", "case-intelligence", "docs", "tasks", "timeline"] as const;
  const TAB_LABELS: Record<(typeof TABS)[number], string> = {
    overview: "Overview",
    "case-intelligence": "Case Intelligence ✦",
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

                        {/* If transitioning to Approved, allow recording conditional undertakings */}
                        {transitionStage === "Approved" && (
                          <div className="border border-amber-200 bg-amber-50/50 rounded p-3 space-y-2.5">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={hasConditions}
                                onChange={(e) => setHasConditions(e.target.checked)}
                                className="rounded border-amber-300 text-[#163B65]"
                              />
                              <span className="text-[12px] font-semibold text-[#172B40]">
                                Grant Approval with Post-Approval Undertaking / Condition
                              </span>
                            </label>

                            {hasConditions && (
                              <div className="space-y-2 pt-1">
                                <div>
                                  <label className="text-[10px] uppercase font-semibold text-[#5F6F82]">
                                    Undertaking Title
                                  </label>
                                  <input
                                    type="text"
                                    className="w-full mt-0.5 rounded border border-[#D5DDE6] bg-white px-2.5 py-1.5 text-[12px] text-[#172B40]"
                                    placeholder="e.g. Fire NOC Renewal / Faculty Cadre Fulfillment"
                                    value={conditionTitle}
                                    onChange={(e) => setConditionTitle(e.target.value)}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] uppercase font-semibold text-[#5F6F82]">
                                    Condition Description & Obligation
                                  </label>
                                  <textarea
                                    className="w-full mt-0.5 rounded border border-[#D5DDE6] bg-white px-2.5 py-1.5 text-[12px] text-[#172B40]"
                                    rows={2}
                                    placeholder="Detail the statutory condition to be complied with post-approval..."
                                    value={conditionDesc}
                                    onChange={(e) => setConditionDesc(e.target.value)}
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] uppercase font-semibold text-[#5F6F82]">
                                    Compliance Due Date
                                  </label>
                                  <input
                                    type="date"
                                    className="w-full mt-0.5 rounded border border-[#D5DDE6] bg-white px-2.5 py-1.5 text-[12px] text-[#172B40]"
                                    value={conditionDue}
                                    onChange={(e) => setConditionDue(e.target.value)}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}

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

          {/* CASE INTELLIGENCE TAB */}
          {activeTab === "case-intelligence" && (
            <div className="space-y-4">
              {/* Header Bar */}
              <div className="bg-white rounded border border-[#E1E7ED] p-3 flex flex-wrap items-center justify-between gap-2 shadow-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  {intel?.providerMode === "llm" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-800 px-3 py-1 text-xs font-semibold border border-emerald-300 shadow-sm">
                      <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
                      Gemini Live ({intel.providerName || "gemini-3.5-flash-lite"})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-slate-800 px-3 py-1 text-xs font-semibold border border-slate-300">
                      <span className="h-2 w-2 rounded-full bg-slate-500" />
                      Rule-Based Demo Mode (Deterministic Fallback)
                    </span>
                  )}
                  <span className="text-[11px] text-[#5F6F82]">
                    Mode:{" "}
                    <strong className="text-[#172B40]">
                      {intel?.providerMode === "llm"
                        ? "Gemini Live (Google Gen AI SDK · Cloud-Native)"
                        : "Rule-Based Demo Mode (Deterministic Heuristics Engine)"}
                    </strong>
                  </span>
                  {intel?.generatedAt && (
                    <span className="text-[10px] text-[#8290A0]">
                      Generated: {new Date(intel.generatedAt).toLocaleTimeString("en-IN")}
                    </span>
                  )}
                </div>
                <button
                  onClick={fetchIntelligence}
                  disabled={loadingIntel}
                  className="rounded bg-[#163B65] hover:bg-[#102F52] text-white text-[11px] font-medium px-3 py-1.5 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <svg
                    className={`h-3 w-3 ${loadingIntel ? "animate-spin" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  {loadingIntel ? "Re-Analyzing..." : "Refresh Intelligence"}
                </button>
              </div>

              {/* Official AICTE Human-in-the-Loop Safeguard Notice */}
              <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded p-3 text-[11px] leading-relaxed flex items-start gap-2 shadow-sm">
                <span className="font-bold text-amber-700 shrink-0 text-xs">
                  ⚠️ ADVISORY NOTICE:
                </span>
                <span>
                  This Case Intelligence briefing is an advisory decision-support tool. In
                  compliance with statutory guidelines, AI algorithms cannot approve, reject, or
                  modify application status independently. Every action requires authorized human
                  verification and confirmation.
                </span>
              </div>

              {intelError && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded p-3 text-xs">
                  Error generating intelligence: {intelError}
                </div>
              )}

              {loadingIntel && !intel && (
                <div className="bg-white rounded border border-[#E1E7ED] p-8 text-center text-sm text-[#5F6F82]">
                  Analyzing application timeline, statutory compliance, and documents...
                </div>
              )}

              {intel && (
                <>
                  {/* FEATURE 3: APPLICATION RISK & ATTENTION EXPLANATION */}
                  <div
                    className={`rounded border p-4 shadow-sm ${
                      intel.attention.tier === "CRITICAL"
                        ? "bg-red-50/70 border-red-300 text-red-950"
                        : intel.attention.tier === "HIGH_ATTENTION"
                          ? "bg-amber-50/70 border-amber-300 text-amber-950"
                          : intel.attention.tier === "MODERATE"
                            ? "bg-yellow-50/70 border-yellow-300 text-yellow-950"
                            : "bg-emerald-50/70 border-emerald-300 text-emerald-950"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider ${
                              intel.attention.tier === "CRITICAL"
                                ? "bg-red-600 text-white"
                                : intel.attention.tier === "HIGH_ATTENTION"
                                  ? "bg-amber-600 text-white"
                                  : intel.attention.tier === "MODERATE"
                                    ? "bg-yellow-600 text-white"
                                    : "bg-emerald-600 text-white"
                            }`}
                          >
                            Attention Tier: {intel.attention.tier.replace(/_/g, " ")}
                          </span>
                          <span className="text-xs font-semibold text-[#172B40] bg-white px-2 py-0.5 rounded border border-[#E1E7ED]">
                            Heuristic Risk Score: {intel.attention.score}/100
                          </span>
                        </div>
                        <p className="text-xs font-medium mt-1">{intel.attention.summary}</p>
                      </div>
                    </div>

                    {/* 6-Dimension Factor Breakdown Table */}
                    <div className="mt-3 bg-white rounded border border-[#E1E7ED] overflow-hidden text-xs">
                      <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#E1E7ED] font-semibold text-[11px] text-[#5F6F82]">
                        Operational Risk Factor Breakdown
                      </div>
                      <div className="divide-y divide-[#E1E7ED]">
                        {intel.attention.factors.map((f, i) => (
                          <div
                            key={i}
                            className="p-2.5 flex flex-wrap items-center justify-between gap-2"
                          >
                            <div className="space-y-0.5 flex-1 min-w-[200px]">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-[#172B40]">{f.dimension}</span>
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase ${
                                    f.severity === "CRITICAL"
                                      ? "bg-red-100 text-red-800"
                                      : f.severity === "HIGH"
                                        ? "bg-amber-100 text-amber-800"
                                        : f.severity === "MEDIUM"
                                          ? "bg-yellow-100 text-yellow-800"
                                          : "bg-green-100 text-green-800"
                                  }`}
                                >
                                  {f.severity}
                                </span>
                                {f.isFact && (
                                  <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 rounded border border-blue-200">
                                    Verified Fact
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-[#5F6F82]">{f.observation}</p>
                            </div>
                            <span className="text-[10px] text-[#8290A0] italic">
                              {f.supportingEvidence}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="text-[10px] text-[#8290A0] mt-2 italic">
                      {intel.attention.disclaimer}
                    </p>
                  </div>

                  {/* FEATURE 1: AI CASE SUMMARY & STAGE ROADMAP */}
                  <div className="bg-white rounded border border-[#E1E7ED] overflow-hidden shadow-sm">
                    <div className="px-4 py-2.5 bg-[#F5F7FA] border-b border-[#E1E7ED] flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6F82]">
                        Executive Case Summary
                      </p>
                      <span className="text-[10px] text-[#8290A0]">
                        Template: {app.workflowTemplate}
                      </span>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded text-[12px] text-[#172B40] leading-relaxed">
                        {intel.summary.executiveNarrative}
                      </div>

                      {/* Workflow Stage Roadmap */}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8290A0] mb-1.5">
                          Workflow Roadmap & Progress
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs">
                          {intel.summary.completedStages.map((s) => (
                            <span
                              key={s}
                              className="inline-flex items-center gap-1 rounded bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 text-[11px]"
                            >
                              ✓ {STAGE_LABELS[s]}
                            </span>
                          ))}
                          <span className="inline-flex items-center gap-1 rounded bg-[#163B65] text-white px-2.5 py-0.5 text-[11px] font-semibold shadow-xs">
                            ● {STAGE_LABELS[intel.summary.currentStage]} (Current)
                          </span>
                          {intel.summary.pendingStages.map((s) => (
                            <span
                              key={s}
                              className="rounded bg-gray-50 text-gray-500 border border-gray-200 px-2 py-0.5 text-[11px]"
                            >
                              {STAGE_LABELS[s]}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Summary Metrics Row */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#E1E7ED] text-xs">
                        <div className="p-2 bg-[#F5F7FA] rounded border border-[#E1E7ED]">
                          <p className="text-[10px] text-[#8290A0]">Open Deficiencies</p>
                          <p className="font-semibold text-[#172B40]">
                            {intel.summary.openDeficiencies.length}
                          </p>
                        </div>
                        <div className="p-2 bg-[#F5F7FA] rounded border border-[#E1E7ED]">
                          <p className="text-[10px] text-[#8290A0]">Doc Validity Concerns</p>
                          <p className="font-semibold text-[#172B40]">
                            {intel.summary.documentValidityIssues.length}
                          </p>
                        </div>
                        <div className="p-2 bg-[#F5F7FA] rounded border border-[#E1E7ED]">
                          <p className="text-[10px] text-[#8290A0]">Overdue Undertakings</p>
                          <p className="font-semibold text-red-600">
                            {intel.summary.undertakingsSummary.overdue}
                          </p>
                        </div>
                        <div className="p-2 bg-[#F5F7FA] rounded border border-[#E1E7ED]">
                          <p className="text-[10px] text-[#8290A0]">SLA Status</p>
                          <p className="font-semibold text-[#172B40]">
                            {intel.summary.slaStatus.toUpperCase()} (
                            {intel.summary.daysRemainingOrOverdue}d)
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* FEATURE 2 & 7: INTELLIGENT ISSUE DETECTION & EVIDENCE */}
                  <div className="bg-white rounded border border-[#E1E7ED] overflow-hidden shadow-sm">
                    <div className="px-4 py-2.5 bg-[#F5F7FA] border-b border-[#E1E7ED] flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6F82]">
                          Detected Actionable Issues ({intel.issues.length})
                        </p>
                      </div>
                      <span className="text-[10px] text-[#8290A0]">
                        Empirical Source Verification
                      </span>
                    </div>

                    {intel.issues.length === 0 ? (
                      <div className="p-4 text-center text-xs text-green-700 bg-green-50">
                        ✓ No pending operational issues or compliance violations detected for this
                        application.
                      </div>
                    ) : (
                      <div className="divide-y divide-[#E1E7ED]">
                        {intel.issues.map((issue) => (
                          <div key={issue.id} className="p-4 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                    issue.severity === "CRITICAL"
                                      ? "bg-red-100 text-red-800 border border-red-200"
                                      : issue.severity === "HIGH"
                                        ? "bg-amber-100 text-amber-800 border border-amber-200"
                                        : issue.severity === "MEDIUM"
                                          ? "bg-yellow-100 text-yellow-800 border border-yellow-200"
                                          : "bg-slate-100 text-slate-800 border border-slate-200"
                                  }`}
                                >
                                  {issue.severity}
                                </span>
                                <span className="text-[10px] font-semibold text-[#5F6F82] uppercase tracking-wider">
                                  {issue.category}
                                </span>
                                {issue.isFact ? (
                                  <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded border border-blue-200 font-medium">
                                    Verified Source Fact
                                  </span>
                                ) : (
                                  <span className="text-[9px] bg-purple-50 text-purple-700 px-1.5 py-0.2 rounded border border-purple-200 font-medium">
                                    Heuristic Interpretation
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-[#8290A0]">
                                Status:{" "}
                                <strong className="text-[#172B40]">{issue.currentStatus}</strong>
                              </span>
                            </div>

                            <div>
                              <h4 className="text-[13px] font-semibold text-[#172B40]">
                                {issue.title}
                              </h4>
                              <p className="text-xs text-[#5F6F82] mt-0.5 leading-relaxed">
                                {issue.explanation}
                              </p>
                            </div>

                            {/* Supporting Record Link */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                              <div className="inline-flex items-center gap-1.5 text-[11px] bg-gray-50 border border-gray-200 px-2 py-1 rounded text-[#5F6F82]">
                                <span className="font-mono text-[#163B65]">
                                  {issue.supportingRecord.label}
                                </span>
                                {issue.supportingRecord.details && (
                                  <span className="text-[10px] text-[#8290A0]">
                                    ({issue.supportingRecord.details})
                                  </span>
                                )}
                              </div>

                              {issue.supportingRecord.type === "document" && (
                                <button
                                  onClick={() => setActiveTab("docs")}
                                  className="text-[11px] text-[#163B65] font-medium hover:underline"
                                >
                                  View in Documents Tab →
                                </button>
                              )}
                              {issue.supportingRecord.type === "task" && (
                                <button
                                  onClick={() => setActiveTab("tasks")}
                                  className="text-[11px] text-[#163B65] font-medium hover:underline"
                                >
                                  View in Tasks Tab →
                                </button>
                              )}
                            </div>

                            {/* Suggested Action Callout */}
                            <div className="p-2 bg-blue-50/50 border border-blue-100 rounded text-[11px] text-blue-900 flex items-start gap-1.5">
                              <span className="font-semibold shrink-0 text-blue-700">
                                Suggested Action:
                              </span>
                              <span>{issue.suggestedAction}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* FEATURE 4 & 9: RECOMMENDED NEXT ACTIONS */}
                  <div className="bg-white rounded border border-[#E1E7ED] overflow-hidden shadow-sm">
                    <div className="px-4 py-2.5 bg-[#F5F7FA] border-b border-[#E1E7ED] flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6F82]">
                        Recommended Next Administrative Actions ({intel.recommendations.length})
                      </p>
                      <span className="text-[10px] text-amber-700 font-medium">
                        Human Confirmation Required
                      </span>
                    </div>

                    {intel.recommendations.length === 0 ? (
                      <div className="p-4 text-center text-xs text-[#5F6F82]">
                        No pending administrative recommendations at this stage.
                      </div>
                    ) : (
                      <div className="divide-y divide-[#E1E7ED]">
                        {intel.recommendations.map((rec) => (
                          <div key={rec.id} className="p-4 space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <div className="flex items-center gap-2">
                                <span className="rounded bg-[#163B65] text-white px-2 py-0.5 text-[10px] font-semibold">
                                  {rec.actionType.replace(/_/g, " ").toUpperCase()}
                                </span>
                                {rec.targetStage && (
                                  <span className="rounded bg-blue-50 text-blue-800 border border-blue-200 px-2 py-0.5 text-[10px] font-medium">
                                    Target: {STAGE_LABELS[rec.targetStage]}
                                  </span>
                                )}
                                <span className="text-[10px] text-[#8290A0]">
                                  Role:{" "}
                                  <strong className="text-[#172B40]">{rec.requiredRole}</strong>
                                </span>
                              </div>
                              <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                                {rec.priority} PRIORITY
                              </span>
                            </div>

                            <div>
                              <h4 className="text-[13px] font-semibold text-[#172B40]">
                                {rec.title}
                              </h4>
                              <p className="text-xs text-[#5F6F82] mt-0.5">{rec.rationale}</p>
                            </div>

                            <p className="text-[11px] text-[#8290A0] italic">
                              Supporting Evidence: {rec.supportingEvidence}
                            </p>

                            <div className="pt-2 flex items-center gap-2">
                              {rec.targetStage ? (
                                <button
                                  onClick={() => {
                                    setTransitionStage(rec.targetStage ?? null);
                                    setActiveTab("overview");
                                    notify(
                                      `Stage transition to ${STAGE_LABELS[rec.targetStage!]} selected in Overview tab for your review.`,
                                    );
                                  }}
                                  className="rounded bg-[#163B65] hover:bg-[#102F52] text-white text-[12px] font-semibold px-3 py-1.5 transition-colors"
                                >
                                  Prepare Transition → {STAGE_LABELS[rec.targetStage]}
                                </button>
                              ) : rec.actionType === "send_reminder" ||
                                rec.actionType === "raise_deficiency" ? (
                                <button
                                  onClick={() => {
                                    const draftT: CommunicationDraftType =
                                      rec.actionType === "raise_deficiency"
                                        ? "DEFICIENCY_NOTICE"
                                        : "PENDING_DOC_REMINDER";
                                    setDraftType(draftT);
                                    handleGenerateDraft(draftT);
                                  }}
                                  className="rounded bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-semibold px-3 py-1.5 transition-colors"
                                >
                                  Generate Notice Draft
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    caseIntelligenceService.executeActionWithHumanConfirmation({
                                      appId: app.id,
                                      actionId: rec.id,
                                      userId,
                                      userRole: roleStr ?? "officer",
                                      remarks: `Officer confirmed recommendation: ${rec.title}`,
                                    });
                                    notify("Action recorded in official application audit log.");
                                    onRefresh();
                                  }}
                                  className="rounded border border-[#163B65] text-[#163B65] hover:bg-slate-50 text-[12px] font-medium px-3 py-1.5 transition-colors"
                                >
                                  Confirm & Record Action
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* FEATURE 5: AI COMMUNICATION DRAFTING STUDIO */}
                  <div className="bg-white rounded border border-[#E1E7ED] overflow-hidden shadow-sm">
                    <div className="px-4 py-2.5 bg-[#F5F7FA] border-b border-[#E1E7ED] flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-[#5F6F82]">
                        AI Communication Drafting Studio
                      </p>
                      <span className="text-[10px] text-[#8290A0]">
                        Official AICTE Correspondence Generator
                      </span>
                    </div>

                    <div className="p-4 space-y-3">
                      <p className="text-xs text-[#5F6F82]">
                        Generate structured, context-grounded official communications for this
                        application. Officers must review and edit drafts before saving or
                        dispatching.
                      </p>

                      {/* Draft Type Selection Chips */}
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#8290A0] mb-1.5">
                          Select Correspondence Template:
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {(
                            [
                              ["DEFICIENCY_NOTICE", "Deficiency Notice"],
                              ["CLARIFICATION_REQUEST", "Clarification Request"],
                              ["PENDING_DOC_REMINDER", "Missing Doc Reminder"],
                              ["UNDERTAKING_REMINDER", "Undertaking Directive"],
                              ["OFFICER_SUMMARY", "Officer Case Brief"],
                              ["INTERNAL_NOTE", "Internal Appraisal Minute"],
                            ] as [CommunicationDraftType, string][]
                          ).map(([dt, label]) => (
                            <button
                              key={dt}
                              onClick={() => {
                                setDraftType(dt);
                                handleGenerateDraft(dt);
                              }}
                              className={`rounded px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                                draftType === dt
                                  ? "bg-[#163B65] text-white border-[#163B65]"
                                  : "border-[#D5DDE6] text-[#5F6F82] hover:border-[#163B65] hover:text-[#163B65]"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Custom officer instructions */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-semibold uppercase tracking-wider text-[#8290A0]">
                          Custom Officer Directives or Remarks (Optional):
                        </label>
                        <input
                          type="text"
                          className="w-full rounded border border-[#D5DDE6] px-3 py-1.5 text-xs text-[#172B40] focus:outline-none focus:ring-2 focus:ring-[#163B65]/20 focus:border-[#163B65]"
                          placeholder="e.g. Specify requirement of fire safety NOC issued within past 6 months..."
                          value={draftInstructions}
                          onChange={(e) => setDraftInstructions(e.target.value)}
                        />
                      </div>

                      <div className="flex justify-end">
                        <button
                          onClick={() => handleGenerateDraft()}
                          disabled={isDrafting}
                          className="rounded bg-[#163B65] hover:bg-[#102F52] text-white text-[12px] font-semibold px-4 py-2 transition-colors disabled:opacity-50"
                        >
                          {isDrafting ? "Drafting..." : "Generate Official Draft ✦"}
                        </button>
                      </div>

                      {/* Generated Draft Preview and Editor */}
                      {currentDraft && (
                        <div className="mt-4 border border-[#E1E7ED] rounded bg-[#F5F7FA] p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E1E7ED] pb-2 text-xs">
                            <div>
                              <p className="font-semibold text-[#172B40]">{currentDraft.title}</p>
                              <p className="text-[10px] text-[#8290A0]">
                                Ref: <code>{currentDraft.referenceNo}</code> · Date:{" "}
                                {currentDraft.date}
                              </p>
                            </div>
                            <span className="text-[10px] bg-white border border-[#E1E7ED] px-2 py-0.5 rounded text-[#5F6F82]">
                              To: {currentDraft.recipient}
                            </span>
                          </div>

                          <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-[#8290A0] block mb-1">
                              Subject:
                            </label>
                            <input
                              type="text"
                              className="w-full rounded border border-[#D5DDE6] bg-white px-3 py-1.5 text-xs font-medium text-[#172B40] focus:outline-none focus:ring-2 focus:ring-[#163B65]/20"
                              value={currentDraft.subject}
                              onChange={(e) =>
                                setCurrentDraft({ ...currentDraft, subject: e.target.value })
                              }
                            />
                          </div>

                          <div>
                            <label className="text-[10px] font-semibold uppercase tracking-wider text-[#8290A0] block mb-1">
                              Draft Body (Officer Editable):
                            </label>
                            <textarea
                              rows={10}
                              className="w-full rounded border border-[#D5DDE6] bg-white p-3 font-mono text-[11px] text-[#172B40] focus:outline-none focus:ring-2 focus:ring-[#163B65]/20"
                              value={currentDraft.body}
                              onChange={(e) =>
                                setCurrentDraft({ ...currentDraft, body: e.target.value })
                              }
                            />
                          </div>

                          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E1E7ED]">
                            <button
                              onClick={handleCopyDraft}
                              className="rounded border border-[#D5DDE6] bg-white hover:bg-slate-50 text-[#172B40] text-xs font-medium px-3 py-1.5 transition-colors"
                            >
                              📋 Copy to Clipboard
                            </button>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={handleSaveDraft}
                                className="rounded bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold px-3 py-1.5 transition-colors"
                              >
                                Save to Audit Trail
                              </button>
                              <button
                                onClick={handleDispatchDraft}
                                className="rounded bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-3 py-1.5 transition-colors"
                              >
                                Dispatch In-Portal Notice
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
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
  }, [search, filterStage, filterRegion, filterType, role, roleStr, tick]);

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
