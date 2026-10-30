// ApprovalFlow AI — Compliance Monitoring Dashboard (Sprint 4 Extended)
// Route: /demo/approvalflow/compliance
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useDemoRole, useDemoUser } from "@/lib/demo-role-store";
import {
  afStore,
  storeEvents,
  getDemoUserId,
  isOverdue,
  daysUntil,
  stageAgeingDays,
  type Stage as AppStage,
  type Task,
} from "@/lib/approval-flow";
import {
  postApprovalStore,
  type Undertaking,
  type TrackedDocument,
  type UndertakingStatus,
  type DocumentLifecycleStatus,
} from "@/lib/post-approval";

export const Route = createFileRoute("/demo/approvalflow/compliance")({
  ssr: false,
  head: () => ({ meta: [{ title: "Compliance Monitoring — ApprovalFlow AI" }] }),
  component: ComplianceDashboard,
});

function TaskTypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    Deficiency: "bg-amber-50 text-amber-700 border-amber-200",
    EVCVisit: "bg-violet-50 text-violet-700 border-violet-200",
    Compliance: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold border ${styles[type] ?? "bg-slate-50 text-slate-700 border-slate-200"}`}
    >
      {type}
    </span>
  );
}

function UndertakingStatusBadge({ status }: { status: UndertakingStatus }) {
  const styles: Record<UndertakingStatus, string> = {
    Pending: "bg-slate-100 text-slate-700 border-slate-200",
    "In Progress": "bg-blue-50 text-blue-700 border-blue-200",
    Submitted: "bg-indigo-50 text-indigo-700 border-indigo-200",
    "Under Review": "bg-purple-50 text-purple-700 border-purple-200",
    Verified: "bg-green-50 text-green-700 border-green-200",
    Rejected: "bg-red-50 text-red-700 border-red-200",
    Overdue: "bg-red-100 text-red-800 border-red-300 font-bold",
  };
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold border ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function DocLifecycleBadge({ status }: { status: DocumentLifecycleStatus }) {
  const styles: Record<DocumentLifecycleStatus, string> = {
    Valid: "bg-green-50 text-green-700 border-green-200",
    "Expiring Soon": "bg-amber-50 text-amber-700 border-amber-200 font-semibold",
    Expired: "bg-red-50 text-red-700 border-red-200 font-bold",
    "Renewal Submitted": "bg-blue-50 text-blue-700 border-blue-200",
    "Under Verification": "bg-purple-50 text-purple-700 border-purple-200",
    Renewed: "bg-green-100 text-green-800 border-green-300 font-semibold",
    Rejected: "bg-red-100 text-red-800 border-red-300",
  };
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[10px] font-semibold border ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function ComplianceDashboard() {
  const [role] = useDemoRole();
  const [user] = useDemoUser();
  const userId = getDemoUserId(role);
  const roleStr = role as string | null;
  const isInstitution = roleStr === "institution";
  const canAct = roleStr === "aicte_office" || roleStr === "admin";

  const [activeMainTab, setActiveMainTab] = useState<"undertakings" | "documents" | "tasks">(
    "undertakings",
  );
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "resolved">("open");
  const [filterType, setFilterType] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState("");

  // Modal / Action states
  const [evidenceModalUt, setEvidenceModalUt] = useState<Undertaking | null>(null);
  const [evidenceFileName, setEvidenceFileName] = useState("");
  const [evidenceExplanation, setEvidenceExplanation] = useState("");

  const [verifyModalUt, setVerifyModalUt] = useState<Undertaking | null>(null);
  const [verifyDecision, setVerifyDecision] = useState<"approve" | "reject">("approve");
  const [verifyRemarks, setVerifyRemarks] = useState("");

  const [renewModalDoc, setRenewModalDoc] = useState<TrackedDocument | null>(null);
  const [renewFileName, setRenewFileName] = useState("");
  const [renewExpiryDate, setRenewExpiryDate] = useState("");

  const [verifyDocModal, setVerifyDocModal] = useState<TrackedDocument | null>(null);
  const [verifyDocDecision, setVerifyDocDecision] = useState<"approve" | "reject">("approve");
  const [verifyDocRemarks, setVerifyDocRemarks] = useState("");

  useEffect(() => {
    const unsub = storeEvents.subscribe(() => setTick((t) => t + 1));
    return unsub;
  }, []);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  };

  const activeInstId = (user as { institutionId?: string } | null)?.institutionId || "inst-1";

  // ── Scoped Undertakings & Tracked Docs (Role Isolation) ──────────────────────
  const undertakings = useMemo(() => {
    void tick;
    let list = postApprovalStore.getAllUndertakings();
    // Institution isolation rule: If signed in as institution, only see own institution records
    if (isInstitution) {
      list = list.filter(
        (u) =>
          u.institutionId === activeInstId ||
          (activeInstId === "inst-1" && (u.institutionId === "inst-1" || u.institutionId === "inst-001")),
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (u) =>
          u.title.toLowerCase().includes(q) ||
          u.appId.toLowerCase().includes(q) ||
          u.conditionDescription.toLowerCase().includes(q),
      );
    }
    return list;
  }, [isInstitution, activeInstId, searchQuery, tick]);

  const trackedDocs = useMemo(() => {
    void tick;
    let list = postApprovalStore.getAllTrackedDocuments();
    if (isInstitution) {
      list = list.filter(
        (d) =>
          d.institutionId === activeInstId ||
          (activeInstId === "inst-1" && (d.institutionId === "inst-1" || d.institutionId === "inst-001")),
      );
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (d) =>
          d.documentName.toLowerCase().includes(q) ||
          d.docType.toLowerCase().includes(q) ||
          d.institutionId.toLowerCase().includes(q),
      );
    }
    return list;
  }, [isInstitution, activeInstId, searchQuery, tick]);

  const allTasks = useMemo(() => {
    void tick;
    let tasks = afStore.tasks.filter(
      (t) => t.type === "Deficiency" || t.type === "EVCVisit" || t.type === "Compliance",
    );
    if (isInstitution) {
      const instAppIds = new Set(
        afStore.applications
          .filter((a) => a.institutionId === activeInstId)
          .map((a) => a.id),
      );
      tasks = tasks.filter((t) => instAppIds.has(t.appId));
    }
    if (filterType) tasks = tasks.filter((t) => t.type === filterType);
    if (filterStatus === "open")
      return tasks.filter((t) => t.status !== "Resolved" && t.status !== "Closed");
    if (filterStatus === "resolved")
      return tasks.filter((t) => t.status === "Resolved" || t.status === "Closed");
    return tasks;
  }, [isInstitution, activeInstId, filterStatus, filterType, tick]);

  const complianceStats = useMemo(() => {
    void tick;
    return postApprovalStore.getComplianceStats(isInstitution ? activeInstId : undefined);
  }, [isInstitution, activeInstId, tick]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleResolve = (taskId: string) => {
    if (!canAct) return notify("You don't have permission to resolve tasks.");
    afStore.resolveTask(taskId, userId, "Resolved via Compliance dashboard");
    notify("Task marked as resolved");
    setTick((t) => t + 1);
  };

  const handleForwardToReScrutiny = (appId: string) => {
    if (!canAct) return notify("You don't have permission to perform this action.");
    try {
      afStore.transitionStage(
        appId,
        "ReScrutiny",
        userId,
        "Deficiency resolved — returned for Re-scrutiny",
      );
      notify("Application returned for Re-scrutiny");
      setTick((t) => t + 1);
    } catch (e) {
      notify(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const submitEvidenceAction = () => {
    if (!evidenceModalUt) return;
    if (!evidenceFileName.trim()) return notify("Please provide evidence document name");
    postApprovalStore.submitEvidence({
      undertakingId: evidenceModalUt.id,
      fileName: evidenceFileName.trim(),
      explanation:
        evidenceExplanation.trim() || "Compliance document uploaded by institution liaison",
      userId,
    });
    notify(`Supporting evidence submitted for ${evidenceModalUt.title}`);
    setEvidenceModalUt(null);
    setEvidenceFileName("");
    setEvidenceExplanation("");
  };

  const verifyUndertakingAction = () => {
    if (!verifyModalUt) return;
    if (verifyDecision === "reject" && !verifyRemarks.trim()) {
      return notify("Mandatory officer remarks required for rejection / correction requests");
    }
    postApprovalStore.verifyUndertaking({
      undertakingId: verifyModalUt.id,
      approved: verifyDecision === "approve",
      remarks:
        verifyRemarks.trim() ||
        (verifyDecision === "approve" ? "Evidence verified and accepted" : "Corrections needed"),
      userId,
    });
    notify(`Undertaking ${verifyDecision === "approve" ? "verified" : "returned for correction"}`);
    setVerifyModalUt(null);
    setVerifyRemarks("");
  };

  const submitDocumentRenewalAction = () => {
    if (!renewModalDoc) return;
    if (!renewFileName.trim()) return notify("Please enter renewal certificate file name");
    if (!renewExpiryDate) return notify("Please enter new expiry date");
    postApprovalStore.uploadDocumentRenewal({
      documentId: renewModalDoc.id,
      fileName: renewFileName.trim(),
      newExpiryDate: renewExpiryDate,
      userId,
    });
    notify(`Document renewal uploaded for ${renewModalDoc.documentName}`);
    setRenewModalDoc(null);
    setRenewFileName("");
    setRenewExpiryDate("");
  };

  const verifyDocumentRenewalAction = () => {
    if (!verifyDocModal) return;
    if (verifyDocDecision === "reject" && !verifyDocRemarks.trim()) {
      return notify("Mandatory officer remarks required for rejecting renewal");
    }
    postApprovalStore.verifyDocumentRenewal({
      documentId: verifyDocModal.id,
      approved: verifyDocDecision === "approve",
      remarks: verifyDocRemarks.trim() || "Renewal verified compliant",
      userId,
    });
    notify(`Renewal ${verifyDocDecision === "approve" ? "verified" : "rejected"}`);
    setVerifyDocModal(null);
    setVerifyDocRemarks("");
  };

  return (
    <div className="space-y-5">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded bg-[#163B65] text-white px-4 py-2.5 text-sm font-medium shadow-xl flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[#E99A35]" />
          {toast}
        </div>
      )}

      {/* Role / Isolation Notice */}
      {isInstitution && (
        <div className="rounded border border-blue-200 bg-blue-50 px-4 py-2.5 text-[12px] text-blue-800 flex items-center justify-between">
          <span>
            Institutional Compliance Portal: Viewing assigned post-approval obligations and document
            validities for your institution.
          </span>
          <span className="font-semibold text-blue-900">Institution Liaison Mode</span>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          {
            label: "Total Undertakings",
            value: complianceStats.totalUt,
            color: "text-[#163B65]",
            border: "border-[#163B65]/30",
          },
          {
            label: "Pending / Progress",
            value: complianceStats.pendingUt,
            color: "text-amber-600",
            border: "border-amber-300",
          },
          {
            label: "Overdue Undertakings",
            value: complianceStats.overdueUt,
            color: "text-red-600",
            border: "border-red-300",
          },
          {
            label: "Awaiting Review",
            value: complianceStats.awaitingReviewUt,
            color: "text-purple-600",
            border: "border-purple-300",
          },
          {
            label: "Verified Obligations",
            value: complianceStats.verifiedUt,
            color: "text-green-700",
            border: "border-green-300",
          },
          {
            label: "Expiring Documents",
            value: complianceStats.expiringSoonDocs,
            color: "text-orange-600",
            border: "border-orange-300",
          },
          {
            label: "Expired Documents",
            value: complianceStats.expiredDocs,
            color: "text-red-700",
            border: "border-red-400",
          },
        ].map((s) => (
          <div key={s.label} className={`stat-card border-l-4 ${s.border}`}>
            <p className={`kpi-number ${s.color}`}>{s.value}</p>
            <p className="text-[10px] text-[#8290A0] mt-1 leading-snug">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Main Tab Navigation */}
      <div className="flex border-b border-[#E1E7ED] bg-white rounded-t">
        {[
          {
            key: "undertakings" as const,
            label: `Time-Bound Undertakings (${undertakings.length})`,
          },
          {
            key: "documents" as const,
            label: `Document Expiry Intelligence (${trackedDocs.length})`,
          },
          {
            key: "tasks" as const,
            label: `Regulatory Tasks (${allTasks.length})`,
          },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveMainTab(tab.key)}
            className={`px-5 py-3 text-[13px] font-semibold border-b-2 transition-colors ${
              activeMainTab === tab.key
                ? "border-[#163B65] text-[#163B65] bg-white"
                : "border-transparent text-[#8290A0] hover:text-[#172B40]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: TIME-BOUND UNDERTAKINGS */}
      {activeMainTab === "undertakings" && (
        <div className="space-y-3">
          {/* Search bar */}
          <div className="bg-white rounded border border-[#E1E7ED] p-3 flex items-center justify-between gap-3">
            <input
              type="text"
              placeholder="Search undertakings by title, application reference, or condition..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full max-w-md rounded border border-[#D5DDE6] px-3 py-1.5 text-[12px] text-[#172B40] focus:outline-none focus:ring-2 focus:ring-[#163B65]/15"
            />
            <span className="text-[11px] text-[#8290A0] shrink-0">
              Showing {undertakings.length} obligation{undertakings.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Undertakings Table */}
          {undertakings.length === 0 ? (
            <div className="bg-white rounded border border-[#E1E7ED] py-16 text-center">
              <p className="text-[13px] text-[#8290A0]">No post-approval undertakings found.</p>
            </div>
          ) : (
            <div className="bg-white rounded border border-[#E1E7ED] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full gov-table">
                  <thead>
                    <tr>
                      <th>Undertaking Ref</th>
                      <th>Application / Inst</th>
                      <th>Condition & Responsibility</th>
                      <th>Due Date</th>
                      <th>Status</th>
                      <th>Evidence Submitted</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {undertakings.map((ut) => {
                      const dl = daysUntil(ut.dueDate);
                      const isOd = dl < 0 && ut.status !== "Verified";
                      const inst = afStore.getInstitution(ut.institutionId);
                      return (
                        <tr
                          key={ut.id}
                          className={
                            ut.status === "Verified" ? "opacity-75" : isOd ? "bg-red-50/60" : ""
                          }
                        >
                          <td>
                            <code className="font-mono text-[11px] bg-[#EEF3F8] text-[#163B65] px-1.5 py-0.5 rounded font-bold">
                              {ut.id}
                            </code>
                          </td>
                          <td>
                            <p className="font-semibold text-[12px] text-[#172B40]">{ut.appId}</p>
                            <p className="text-[10px] text-[#8290A0]">
                              {inst?.name || ut.institutionId}
                            </p>
                          </td>
                          <td className="max-w-xs">
                            <p className="font-semibold text-[12px] text-[#172B40]">{ut.title}</p>
                            <p className="text-[11px] text-[#5F6F82] line-clamp-2 mt-0.5">
                              {ut.conditionDescription}
                            </p>
                            <p className="text-[10px] text-[#8290A0] mt-0.5">
                              Resp: {ut.assignedResponsibility}
                            </p>
                            {ut.officerRemarks && (
                              <p className="text-[10px] italic text-red-600 mt-1">
                                Remarks: "{ut.officerRemarks}"
                              </p>
                            )}
                          </td>
                          <td>
                            <p className="text-[12px] font-medium text-[#172B40]">{ut.dueDate}</p>
                            <p
                              className={`text-[10px] font-bold ${isOd ? "text-red-700" : dl <= 7 ? "text-amber-600" : "text-[#8290A0]"}`}
                            >
                              {isOd ? `⚠ ${Math.abs(dl)}d overdue` : `${dl}d left`}
                            </p>
                          </td>
                          <td>
                            <UndertakingStatusBadge status={ut.status} />
                          </td>
                          <td>
                            {ut.evidences.length > 0 ? (
                              <div className="space-y-1">
                                {ut.evidences.map((ev) => (
                                  <div key={ev.id} className="text-[11px]">
                                    <span className="font-medium text-[#163B65] underline cursor-pointer">
                                      📄 {ev.fileName} (v{ev.version})
                                    </span>
                                    <p className="text-[9px] text-[#8290A0]">{ev.explanation}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[11px] text-[#8290A0]">None submitted</span>
                            )}
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {/* Institution submit/resubmit evidence */}
                              {(isInstitution || canAct) && ut.status !== "Verified" && (
                                <button
                                  onClick={() => setEvidenceModalUt(ut)}
                                  className="text-[11px] font-medium text-[#163B65] bg-white border border-[#D5DDE6] hover:bg-[#EEF3F8] px-2 py-1 rounded transition-colors"
                                >
                                  {ut.evidences.length > 0
                                    ? "Resubmit Evidence"
                                    : "Upload Evidence"}
                                </button>
                              )}

                              {/* Officer verification button */}
                              {canAct && ut.status !== "Verified" && ut.evidences.length > 0 && (
                                <button
                                  onClick={() => setVerifyModalUt(ut)}
                                  className="text-[11px] font-semibold text-white bg-green-600 hover:bg-green-700 px-2 py-1 rounded transition-colors shadow-sm"
                                >
                                  Verify / Review
                                </button>
                              )}

                              {ut.status === "Verified" && (
                                <span className="text-[11px] font-bold text-green-700">
                                  ✓ Fulfilled
                                </span>
                              )}
                            </div>
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
      )}

      {/* TAB 2: DOCUMENT EXPIRY INTELLIGENCE */}
      {activeMainTab === "documents" && (
        <div className="space-y-3">
          {/* Search bar */}
          <div className="bg-white rounded border border-[#E1E7ED] p-3 flex items-center justify-between gap-3">
            <input
              type="text"
              placeholder="Search documents by certificate name, type, or institution..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full max-w-md rounded border border-[#D5DDE6] px-3 py-1.5 text-[12px] text-[#172B40] focus:outline-none focus:ring-2 focus:ring-[#163B65]/15"
            />
            <span className="text-[11px] text-[#8290A0] shrink-0">
              Showing {trackedDocs.length} certificate{trackedDocs.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Tracked Docs Table */}
          {trackedDocs.length === 0 ? (
            <div className="bg-white rounded border border-[#E1E7ED] py-16 text-center">
              <p className="text-[13px] text-[#8290A0]">No tracked statutory documents found.</p>
            </div>
          ) : (
            <div className="bg-white rounded border border-[#E1E7ED] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full gov-table">
                  <thead>
                    <tr>
                      <th>Document Ref / Type</th>
                      <th>Certificate Name</th>
                      <th>Institution</th>
                      <th>Validity Window</th>
                      <th>Status</th>
                      <th>Version</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trackedDocs.map((doc) => {
                      const dl = daysUntil(doc.expiryDate);
                      const isExpired = dl < 0 && doc.status !== "Renewed";
                      const inst = afStore.getInstitution(doc.institutionId);
                      return (
                        <tr key={doc.id} className={isExpired ? "bg-red-50/60" : ""}>
                          <td>
                            <code className="font-mono text-[10px] bg-[#EEF3F8] text-[#163B65] px-1.5 py-0.5 rounded font-bold">
                              {doc.docType}
                            </code>
                            <p className="text-[10px] text-[#8290A0] font-mono mt-0.5">{doc.id}</p>
                          </td>
                          <td>
                            <p className="font-semibold text-[12px] text-[#172B40]">
                              {doc.documentName}
                            </p>
                            <p className="text-[10px] text-[#5F6F82]">
                              Current: {doc.history[0]?.fileName || "default.pdf"}
                            </p>
                          </td>
                          <td>
                            <p className="text-[12px] font-medium text-[#172B40]">
                              {inst?.name || doc.institutionId}
                            </p>
                            <p className="text-[10px] text-[#8290A0]">{inst?.state}</p>
                          </td>
                          <td>
                            <p className="text-[11px] text-[#5F6F82]">Expires: {doc.expiryDate}</p>
                            <p
                              className={`text-[10px] font-bold ${isExpired ? "text-red-700" : dl <= 60 ? "text-amber-600" : "text-green-700"}`}
                            >
                              {isExpired
                                ? `⚠ Expired ${Math.abs(dl)}d ago`
                                : `${dl}d validity left`}
                            </p>
                          </td>
                          <td>
                            <DocLifecycleBadge status={doc.status} />
                          </td>
                          <td>
                            <span className="text-[11px] font-mono text-[#5F6F82]">
                              v{doc.currentVersion}
                            </span>
                          </td>
                          <td>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {/* Institution renewal upload */}
                              {(isInstitution || canAct) && (
                                <button
                                  onClick={() => setRenewModalDoc(doc)}
                                  className="text-[11px] font-medium text-[#163B65] bg-white border border-[#D5DDE6] hover:bg-[#EEF3F8] px-2 py-1 rounded transition-colors"
                                >
                                  Upload Renewal
                                </button>
                              )}

                              {/* Officer renewal verification */}
                              {canAct && doc.status === "Renewal Submitted" && (
                                <button
                                  onClick={() => setVerifyDocModal(doc)}
                                  className="text-[11px] font-semibold text-white bg-green-600 hover:bg-green-700 px-2 py-1 rounded transition-colors shadow-sm"
                                >
                                  Verify Renewal
                                </button>
                              )}
                            </div>
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
      )}

      {/* TAB 3: REGULATORY TASKS (Original Compliance Functionality Preserved) */}
      {activeMainTab === "tasks" && (
        <div className="space-y-3">
          <div className="bg-white rounded border border-[#E1E7ED] p-3 flex flex-wrap gap-2.5 items-center">
            <div className="flex rounded border border-[#D5DDE6] overflow-hidden">
              {(["open", "resolved", "all"] as const).map((f) => (
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
              onChange={(e) => setFilterType(e.target.value)}
            >
              <option value="">All Types</option>
              <option value="Deficiency">Deficiency</option>
              <option value="EVCVisit">EVC Visit</option>
              <option value="Compliance">Compliance</option>
            </select>
            <span className="ml-auto text-[11px] text-[#8290A0]">
              {allTasks.length} task{allTasks.length !== 1 ? "s" : ""}
            </span>
          </div>

          {allTasks.length === 0 ? (
            <div className="bg-white rounded border border-[#E1E7ED] py-16 text-center">
              <p className="text-[14px] text-[#8290A0]">
                No {filterStatus !== "all" ? filterStatus : ""} compliance tasks found.
              </p>
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
                      <th>Stage Ageing</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allTasks.map((task) => {
                      const app = afStore.getApplication(task.appId);
                      const inst = app ? afStore.getInstitution(app.institutionId) : null;
                      const dl = daysUntil(task.dueDate);
                      const resolved = task.status === "Resolved" || task.status === "Closed";
                      return (
                        <tr
                          key={task.id}
                          className={resolved ? "opacity-60" : dl < 0 ? "bg-red-50" : ""}
                        >
                          <td>
                            <code className="font-mono text-[11px] text-[#8290A0] bg-[#F0F3F6] px-1.5 py-0.5 rounded">
                              {task.appId}
                            </code>
                          </td>
                          <td>
                            <p className="font-medium text-[13px] text-[#172B40] truncate max-w-[140px]">
                              {inst?.name ?? "—"}
                            </p>
                            <p className="text-[10px] text-[#8290A0]">{app?.region}</p>
                          </td>
                          <td>
                            <TaskTypeBadge type={task.type} />
                          </td>
                          <td className="text-[12px] text-[#5F6F82] max-w-[180px]">
                            <span className="line-clamp-2">{task.description}</span>
                          </td>
                          <td>
                            <div>
                              <p className="text-[12px] font-medium text-[#172B40]">
                                {task.dueDate}
                              </p>
                              <p
                                className={`text-[10px] font-semibold ${dl < 0 ? "text-red-600" : dl < 7 ? "text-amber-600" : "text-[#8290A0]"}`}
                              >
                                {dl < 0 ? `${Math.abs(dl)}d overdue` : `${dl}d remaining`}
                              </p>
                            </div>
                          </td>
                          <td>
                            {(() => {
                              if (!app)
                                return <span className="text-[11px] text-[#8290A0]">—</span>;
                              const days = stageAgeingDays(app);
                              if (days === null)
                                return <span className="text-[11px] text-[#8290A0]">—</span>;
                              const cls =
                                days > 14
                                  ? "text-red-700 font-bold"
                                  : days > 7
                                    ? "text-amber-700 font-semibold"
                                    : "text-[#8290A0]";
                              return <span className={`text-[11px] ${cls}`}>{days}d</span>;
                            })()}
                          </td>
                          <td>
                            <span
                              className={`text-[11px] font-semibold ${resolved ? "text-green-700" : dl < 0 ? "text-red-600" : "text-amber-600"}`}
                            >
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
                              <span className="text-[11px] text-green-700 font-medium">
                                ✓ Resolved
                              </span>
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
      )}

      {/* ── MODALS ── */}

      {/* 1. Evidence Submission Modal */}
      {evidenceModalUt && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#163B65]">Submit Supporting Evidence</h3>
              <p className="text-[11px] text-[#5F6F82] mt-0.5">{evidenceModalUt.title}</p>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-[#5F6F82]">
                Document / File Name
              </label>
              <input
                type="text"
                placeholder="e.g. fire_safety_noc_2027.pdf"
                value={evidenceFileName}
                onChange={(e) => setEvidenceFileName(e.target.value)}
                className="w-full mt-1 rounded border border-[#D5DDE6] px-3 py-1.5 text-[12px] text-[#172B40]"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-[#5F6F82]">
                Compliance Explanation
              </label>
              <textarea
                rows={3}
                placeholder="Detail the steps taken and describe the uploaded evidence..."
                value={evidenceExplanation}
                onChange={(e) => setEvidenceExplanation(e.target.value)}
                className="w-full mt-1 rounded border border-[#D5DDE6] px-3 py-1.5 text-[12px] text-[#172B40]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEvidenceModalUt(null)}
                className="px-3 py-1.5 text-[12px] font-medium text-[#5F6F82] hover:bg-[#F0F3F6] rounded"
              >
                Cancel
              </button>
              <button
                onClick={submitEvidenceAction}
                className="px-4 py-1.5 text-[12px] font-semibold text-white bg-[#163B65] hover:bg-[#102F52] rounded shadow-sm"
              >
                Submit Evidence
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Undertaking Verification Modal */}
      {verifyModalUt && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#163B65]">Verify Undertaking Fulfilment</h3>
              <p className="text-[11px] text-[#5F6F82] mt-0.5">{verifyModalUt.title}</p>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-[#5F6F82]">
                Officer Decision
              </label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-1.5 text-[12px] cursor-pointer">
                  <input
                    type="radio"
                    name="verifyDecision"
                    checked={verifyDecision === "approve"}
                    onChange={() => setVerifyDecision("approve")}
                  />
                  <span className="font-semibold text-green-700">Accept & Verify</span>
                </label>
                <label className="flex items-center gap-1.5 text-[12px] cursor-pointer">
                  <input
                    type="radio"
                    name="verifyDecision"
                    checked={verifyDecision === "reject"}
                    onChange={() => setVerifyDecision("reject")}
                  />
                  <span className="font-semibold text-red-700">Reject / Request Corrections</span>
                </label>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-[#5F6F82]">
                Officer Remarks {verifyDecision === "reject" ? "(Mandatory)" : "(Optional)"}
              </label>
              <textarea
                rows={3}
                placeholder="Enter regulatory verification comments or deficiency reasons..."
                value={verifyRemarks}
                onChange={(e) => setVerifyRemarks(e.target.value)}
                className="w-full mt-1 rounded border border-[#D5DDE6] px-3 py-1.5 text-[12px] text-[#172B40]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setVerifyModalUt(null)}
                className="px-3 py-1.5 text-[12px] font-medium text-[#5F6F82] hover:bg-[#F0F3F6] rounded"
              >
                Cancel
              </button>
              <button
                onClick={verifyUndertakingAction}
                className={`px-4 py-1.5 text-[12px] font-semibold text-white rounded shadow-sm ${
                  verifyDecision === "approve"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                Confirm Verification
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Document Renewal Upload Modal */}
      {renewModalDoc && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#163B65]">Upload Document Renewal</h3>
              <p className="text-[11px] text-[#5F6F82] mt-0.5">{renewModalDoc.documentName}</p>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-[#5F6F82]">
                Renewal File Name
              </label>
              <input
                type="text"
                placeholder="e.g. fire_safety_noc_renewed_2028.pdf"
                value={renewFileName}
                onChange={(e) => setRenewFileName(e.target.value)}
                className="w-full mt-1 rounded border border-[#D5DDE6] px-3 py-1.5 text-[12px] text-[#172B40]"
              />
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-[#5F6F82]">
                New Expiry Date
              </label>
              <input
                type="date"
                value={renewExpiryDate}
                onChange={(e) => setRenewExpiryDate(e.target.value)}
                className="w-full mt-1 rounded border border-[#D5DDE6] px-3 py-1.5 text-[12px] text-[#172B40]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setRenewModalDoc(null)}
                className="px-3 py-1.5 text-[12px] font-medium text-[#5F6F82] hover:bg-[#F0F3F6] rounded"
              >
                Cancel
              </button>
              <button
                onClick={submitDocumentRenewalAction}
                className="px-4 py-1.5 text-[12px] font-semibold text-white bg-[#163B65] hover:bg-[#102F52] rounded shadow-sm"
              >
                Submit Renewal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Document Renewal Verification Modal */}
      {verifyDocModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 space-y-4">
            <div>
              <h3 className="text-sm font-bold text-[#163B65]">Verify Document Renewal</h3>
              <p className="text-[11px] text-[#5F6F82] mt-0.5">{verifyDocModal.documentName}</p>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-[#5F6F82]">
                Officer Assessment
              </label>
              <div className="flex gap-4 mt-1">
                <label className="flex items-center gap-1.5 text-[12px] cursor-pointer">
                  <input
                    type="radio"
                    name="verifyDocDecision"
                    checked={verifyDocDecision === "approve"}
                    onChange={() => setVerifyDocDecision("approve")}
                  />
                  <span className="font-semibold text-green-700">Confirm & Renew</span>
                </label>
                <label className="flex items-center gap-1.5 text-[12px] cursor-pointer">
                  <input
                    type="radio"
                    name="verifyDocDecision"
                    checked={verifyDocDecision === "reject"}
                    onChange={() => setVerifyDocDecision("reject")}
                  />
                  <span className="font-semibold text-red-700">Reject Renewal</span>
                </label>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-semibold uppercase text-[#5F6F82]">
                Remarks {verifyDocDecision === "reject" ? "(Mandatory)" : "(Optional)"}
              </label>
              <textarea
                rows={3}
                placeholder="Verification comments..."
                value={verifyDocRemarks}
                onChange={(e) => setVerifyDocRemarks(e.target.value)}
                className="w-full mt-1 rounded border border-[#D5DDE6] px-3 py-1.5 text-[12px] text-[#172B40]"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setVerifyDocModal(null)}
                className="px-3 py-1.5 text-[12px] font-medium text-[#5F6F82] hover:bg-[#F0F3F6] rounded"
              >
                Cancel
              </button>
              <button
                onClick={verifyDocumentRenewalAction}
                className={`px-4 py-1.5 text-[12px] font-semibold text-white rounded shadow-sm ${
                  verifyDocDecision === "approve"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                }`}
              >
                Confirm Verification
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
