// ApprovalFlow AI — Sprint 5: AI-Assisted Case Intelligence & Decision Support
// Architecture: Modular AI service with deterministic rule-based demo analysis
// and server-side model provider interface.

import {
  type Application,
  type Stage,
  type Document,
  type Task,
  type AuditLog,
  afStore,
  computeSlaStatus,
  isOverdue,
  stageAgeingDays,
  getTemplateStages,
  getAllowedNextStages,
  STAGE_TRANSITIONS,
  APP_TYPE_LABELS,
  STAGE_LABELS,
} from "./approval-flow";
import { postApprovalStore, type Undertaking, type TrackedDocument } from "./post-approval";
import { notifStore } from "./notifications";

// ── Types & Interfaces ────────────────────────────────────────────────────────

export type AttentionTier = "CRITICAL" | "HIGH_ATTENTION" | "MODERATE" | "ON_TRACK";
export type IssueSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type IssueCategory =
  "DOCUMENT" | "DEFICIENCY" | "SLA" | "EVC" | "UNDERTAKING" | "COMPLIANCE" | "WORKFLOW";

export interface SupportingRecord {
  type: "document" | "task" | "undertaking" | "sla" | "audit" | "stage" | "tracked_doc";
  id: string;
  label: string;
  timestamp?: string | undefined;
  details?: string | undefined;
}

export interface DetectedIssue {
  id: string;
  title: string;
  category: IssueCategory;
  severity: IssueSeverity;
  explanation: string;
  supportingRecord: SupportingRecord;
  currentStatus: string;
  suggestedAction: string;
  isFact: boolean; // true = verified empirical source fact, false = analytical interpretation
}

export interface AttentionFactor {
  dimension: string;
  severity: IssueSeverity;
  observation: string;
  supportingEvidence: string;
  isFact: boolean;
}

export interface AttentionAssessment {
  tier: AttentionTier;
  score: number; // 0-100 explainable composite metric
  summary: string;
  factors: AttentionFactor[];
  disclaimer: string;
}

export interface RecommendedAction {
  id: string;
  title: string;
  actionType:
    | "stage_transition"
    | "verify_evidence"
    | "raise_deficiency"
    | "schedule_evc"
    | "request_clarification"
    | "send_reminder"
    | "review_document";
  targetStage?: Stage | undefined;
  rationale: string;
  supportingEvidence: string;
  requiredRole: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  requiresHumanConfirmation: true;
}

export interface ExecutiveCaseSummary {
  appId: string;
  institutionName: string;
  aicteId: string;
  region: string;
  state: string;
  appTypeLabel: string;
  currentStage: Stage;
  currentStageLabel: string;
  assignedOfficer: string;
  slaStatus: string;
  daysRemainingOrOverdue: number;
  stageAgeingDays: number | null;
  completedStages: Stage[];
  pendingStages: Stage[];
  previousObservations: Array<{
    stage: string;
    timestamp: string;
    officer: string;
    note: string;
  }>;
  openDeficiencies: Array<{
    id: string;
    title: string;
    dueDate?: string | undefined;
  }>;
  clarificationsReceived: Array<{
    id: string;
    title: string;
    timestamp: string;
    details: string;
  }>;
  evcObservations: Array<{
    id: string;
    status: string;
    remarks?: string | undefined;
    scheduledDate?: string | undefined;
  }>;
  undertakingsSummary: {
    total: number;
    pending: number;
    overdue: number;
    underReview: number;
    verified: number;
  };
  documentValidityIssues: Array<{
    docName: string;
    issue: string;
    status: string;
  }>;
  executiveNarrative: string;
  generatedAt: string;
}

export type CommunicationDraftType =
  | "DEFICIENCY_NOTICE"
  | "CLARIFICATION_REQUEST"
  | "PENDING_DOC_REMINDER"
  | "UNDERTAKING_REMINDER"
  | "OFFICER_SUMMARY"
  | "INTERNAL_NOTE";

export interface CommunicationDraft {
  type: CommunicationDraftType;
  title: string;
  recipient: string;
  referenceNo: string;
  date: string;
  subject: string;
  body: string;
  recommendedChannels: string[];
  isEditable: true;
}

export interface CaseIntelligenceContext {
  application: Application;
  institutionName: string;
  institutionAicteId: string;
  institutionState: string;
  documents: Document[];
  tasks: Task[];
  auditLogs: AuditLog[];
  undertakings: Undertaking[];
  trackedDocuments: TrackedDocument[];
  currentOfficerId?: string | undefined;
  currentOfficerRole?: string | undefined;
}

export interface CaseIntelligenceResult {
  summary: ExecutiveCaseSummary;
  attention: AttentionAssessment;
  issues: DetectedIssue[];
  recommendations: RecommendedAction[];
  providerMode: "rule_based" | "llm";
  providerName: string;
  generatedAt: string;
  humanInTheLoopNotice: string;
}

// ── AI Provider Interface ─────────────────────────────────────────────────────

export interface AIProvider {
  name: string;
  mode: "rule_based" | "llm";
  analyzeCase(context: CaseIntelligenceContext): Promise<CaseIntelligenceResult>;
  generateDraft(
    type: CommunicationDraftType,
    context: CaseIntelligenceContext,
    customInstructions?: string,
  ): Promise<CommunicationDraft>;
}

// ── Deterministic Rule-Based Provider (Zero-Hallucination Baseline) ───────────

export class RuleBasedCaseIntelligenceProvider implements AIProvider {
  name = "Rule-Based Deterministic Intelligence Engine";
  mode = "rule_based" as const;

  async analyzeCase(context: CaseIntelligenceContext): Promise<CaseIntelligenceResult> {
    const {
      application: app,
      institutionName,
      institutionAicteId,
      institutionState,
      documents,
      tasks,
      auditLogs,
      undertakings,
      trackedDocuments,
    } = context;

    const now = new Date();
    const generatedAt = now.toISOString();

    // 1. Compute SLA & Timeline Context
    const sla = computeSlaStatus(app, app.currentStage);
    const overdue = isOverdue(app);
    const ageing = stageAgeingDays(app);
    const templateStages = getTemplateStages(app.workflowTemplate);
    const currStageIdx = templateStages.indexOf(app.currentStage);

    const completedStages =
      currStageIdx > 0
        ? templateStages.slice(0, currStageIdx)
        : app.status === "Approved" || app.status === "Rejected"
          ? templateStages
          : [];
    const pendingStages =
      currStageIdx >= 0 && currStageIdx < templateStages.length - 1
        ? templateStages.slice(currStageIdx + 1)
        : [];

    // 2. Observations & Scrutiny Logs
    const previousObservations = auditLogs
      .filter((log) => log.remarks && log.remarks.trim().length > 0)
      .slice(0, 5)
      .map((log) => ({
        stage: app.currentStage,
        timestamp: log.timestamp,
        officer: log.userId,
        note: log.remarks || log.action,
      }));

    // 3. Deficiencies, Tasks, Clarifications, and EVC
    const openDeficiencies = tasks
      .filter((t) => t.type === "Deficiency" && t.status !== "Resolved" && t.status !== "Closed")
      .map((t) => ({
        id: t.id,
        title: t.description,
        dueDate: t.dueDate,
      }));

    const clarificationsReceived = auditLogs
      .filter(
        (log) =>
          log.action.toLowerCase().includes("clarification") ||
          log.action.toLowerCase().includes("response") ||
          log.action.toLowerCase().includes("resubmitted"),
      )
      .map((log) => ({
        id: log.id,
        title: log.action,
        timestamp: log.timestamp,
        details: log.remarks || "Clarification logged by institution",
      }));

    const evcTasks = tasks.filter((t) => t.type === "EVCVisit");
    const evcObservations = evcTasks.map((t) => ({
      id: t.id,
      status: t.status,
      remarks: t.remarks || t.description,
      scheduledDate: t.dueDate,
    }));

    // 4. Undertakings Summary
    const undertakingsSummary = {
      total: undertakings.length,
      pending: undertakings.filter((u) => u.status === "Pending" || u.status === "In Progress")
        .length,
      overdue: undertakings.filter((u) => u.status === "Overdue").length,
      underReview: undertakings.filter((u) => u.status === "Under Review").length,
      verified: undertakings.filter((u) => u.status === "Verified").length,
    };

    // 5. Document Health & Validity
    const documentValidityIssues: Array<{ docName: string; issue: string; status: string }> = [];

    // Check application documents
    documents.forEach((d) => {
      if (d.flags && d.flags.length > 0) {
        documentValidityIssues.push({
          docName: d.fileName,
          issue: `Document has active flags: ${d.flags.join(", ")}`,
          status: "Flagged",
        });
      } else if (!d.verified) {
        documentValidityIssues.push({
          docName: d.fileName,
          issue: "Document pending officer verification",
          status: "Pending Verification",
        });
      }
    });

    // Check tracked statutory documents (Fire NOC, Building Plan, Land Lease)
    trackedDocuments.forEach((td) => {
      if (td.status === "Expired") {
        documentValidityIssues.push({
          docName: td.documentName,
          issue: `Statutory certificate expired on ${td.expiryDate}. Immediate renewal mandatory.`,
          status: "Expired",
        });
      } else if (td.status === "Expiring Soon") {
        documentValidityIssues.push({
          docName: td.documentName,
          issue: `Certificate validity expiring soon (${td.expiryDate}). Renewal required.`,
          status: "Expiring Soon",
        });
      } else if (td.status === "Renewal Submitted" || td.status === "Under Verification") {
        documentValidityIssues.push({
          docName: td.documentName,
          issue: "Renewed certificate uploaded by institution; officer verification pending",
          status: "Renewal Under Verification",
        });
      }
    });

    // 6. Executive Narrative Generation
    const stageDesc = STAGE_LABELS[app.currentStage] || app.currentStage;
    const slaDesc =
      sla.status === "overdue"
        ? `overdue by ${Math.abs(sla.daysRemaining)} days`
        : sla.status === "due_soon"
          ? `due in ${sla.daysRemaining} days`
          : `on track (${sla.daysRemaining} days remaining)`;

    const executiveNarrative =
      `Application ${app.id} for ${institutionName} (${institutionAicteId}) is currently in the ${stageDesc} stage. ` +
      `The case is assigned to officer ${app.assignedTo ?? "Unassigned"} under the ${(app.workflowTemplate || "scrutinyEvc").replace(/_/g, " ")} workflow. ` +
      `SLA status is ${slaDesc}. ` +
      (openDeficiencies.length > 0
        ? `There are ${openDeficiencies.length} unresolved deficiencies requiring institutional remediation. `
        : `No open statutory deficiencies are currently pending. `) +
      (undertakingsSummary.overdue > 0
        ? `Attention: ${undertakingsSummary.overdue} post-approval compliance undertaking(s) are overdue. `
        : undertakingsSummary.underReview > 0
          ? `${undertakingsSummary.underReview} undertaking evidence submission(s) are awaiting officer review. `
          : `Post-approval compliance obligations are currently up to date. `) +
      (documentValidityIssues.length > 0
        ? `Identified ${documentValidityIssues.length} document validity or verification concern(s) requiring administrative follow-up.`
        : `All prescribed documentation conforms to portal requirements.`);

    const summary: ExecutiveCaseSummary = {
      appId: app.id,
      institutionName,
      aicteId: institutionAicteId,
      region: app.region,
      state: institutionState,
      appTypeLabel: APP_TYPE_LABELS[app.appType] || app.appType,
      currentStage: app.currentStage,
      currentStageLabel: stageDesc,
      assignedOfficer: app.assignedTo ?? "Unassigned",
      slaStatus: sla.status,
      daysRemainingOrOverdue: sla.daysRemaining,
      stageAgeingDays: ageing,
      completedStages,
      pendingStages,
      previousObservations,
      openDeficiencies,
      clarificationsReceived,
      evcObservations,
      undertakingsSummary,
      documentValidityIssues,
      executiveNarrative,
      generatedAt,
    };

    // ── 7. Intelligent Issue Detection ─────────────────────────────────────────
    const issues: DetectedIssue[] = [];

    // Issue A: Overdue SLA
    if (overdue || sla.status === "overdue") {
      issues.push({
        id: `ISSUE-SLA-${app.id}`,
        title: `Stage SLA Exceeded (${Math.abs(sla.daysRemaining)} days overdue)`,
        category: "SLA",
        severity: "CRITICAL",
        explanation: `Application has been pending at stage "${stageDesc}" beyond the prescribed SLA window of ${app.slaDeadline}.`,
        supportingRecord: {
          type: "sla",
          id: app.id,
          label: `SLA Deadline: ${app.slaDeadline}`,
          details: `Stage entered: ${app.stageEntered?.[app.currentStage] || "Unknown"}`,
        },
        currentStatus: "Overdue",
        suggestedAction:
          "Expedite administrative review or forward application to the next review committee.",
        isFact: true,
      });
    }

    // Issue B: Open Deficiencies
    openDeficiencies.forEach((def) => {
      issues.push({
        id: `ISSUE-DEF-${def.id}`,
        title: `Unresolved Deficiency: ${def.title}`,
        category: "DEFICIENCY",
        severity: "HIGH",
        explanation: `Deficiency raised against the institution remains unresolved. Institutional response or verification is required.`,
        supportingRecord: {
          type: "task",
          id: def.id,
          label: `Task ${def.id}`,
          ...(def.dueDate ? { details: `Due date: ${def.dueDate}` } : {}),
        },
        currentStatus: "Open",
        suggestedAction: "Issue a formal deficiency reminder notice or request clarification.",
        isFact: true,
      });
    });

    // Issue C: Expired Statutory Documents
    trackedDocuments
      .filter((td) => td.status === "Expired")
      .forEach((td) => {
        issues.push({
          id: `ISSUE-DOC-EXP-${td.id}`,
          title: `Expired Statutory Certificate: ${td.documentName}`,
          category: "DOCUMENT",
          severity: "CRITICAL",
          explanation: `Statutory compliance certificate (${td.documentName}) expired on ${td.expiryDate}. Institutional operation without valid statutory safety approval violates approval norms.`,
          supportingRecord: {
            type: "tracked_doc",
            id: td.id,
            label: `${td.documentName} (v${td.currentVersion})`,
            details: `Expired: ${td.expiryDate}`,
          },
          currentStatus: "Expired",
          suggestedAction:
            "Issue urgent statutory document renewal reminder and flag for committee notice.",
          isFact: true,
        });
      });

    // Issue D: Document Renewal Awaiting Officer Verification
    trackedDocuments
      .filter((td) => td.status === "Renewal Submitted" || td.status === "Under Verification")
      .forEach((td) => {
        issues.push({
          id: `ISSUE-DOC-VER-${td.id}`,
          title: `Renewal Awaiting Verification: ${td.documentName}`,
          category: "DOCUMENT",
          severity: "MEDIUM",
          explanation: `Institution uploaded renewed document (v${td.currentVersion}). Scrutiny officer verification against statutory authority records is pending.`,
          supportingRecord: {
            type: "tracked_doc",
            id: td.id,
            label: `${td.documentName} (v${td.currentVersion})`,
            details: `Submitted for verification`,
          },
          currentStatus: "Pending Verification",
          suggestedAction:
            "Examine uploaded certificate and record verification decision in the Compliance Hub.",
          isFact: true,
        });
      });

    // Issue E: Post-Approval Undertaking Overdue
    undertakings
      .filter((u) => u.status === "Overdue")
      .forEach((u) => {
        issues.push({
          id: `ISSUE-UT-OD-${u.id}`,
          title: `Overdue Post-Approval Undertaking: ${u.title}`,
          category: "UNDERTAKING",
          severity: "HIGH",
          explanation: `Mandatory institutional undertaking condition (${u.conditionDescription}) is past its due date (${u.dueDate}) without accepted fulfilment.`,
          supportingRecord: {
            type: "undertaking",
            id: u.id,
            label: `Undertaking ${u.id}`,
            details: `Due: ${u.dueDate}`,
          },
          currentStatus: "Overdue",
          suggestedAction: "Dispatch an Undertaking Compliance Notice to the Head of Institution.",
          isFact: true,
        });
      });

    // Issue F: Undertaking Evidence Under Review
    undertakings
      .filter((u) => u.status === "Under Review")
      .forEach((u) => {
        issues.push({
          id: `ISSUE-UT-REV-${u.id}`,
          title: `Undertaking Evidence Awaiting Officer Review: ${u.title}`,
          category: "UNDERTAKING",
          severity: "MEDIUM",
          explanation: `Institution has submitted proof of compliance. Officer assessment is required to verify or reject the submission.`,
          supportingRecord: {
            type: "undertaking",
            id: u.id,
            label: `Undertaking ${u.id}`,
            details: `${u.evidences.length} evidence attachment(s)`,
          },
          currentStatus: "Under Review",
          suggestedAction: "Review submitted evidence in the Compliance Hub and record appraisal.",
          isFact: true,
        });
      });

    // Issue G: Unverified Application Documents
    documents
      .filter((d) => !d.verified)
      .forEach((d) => {
        issues.push({
          id: `ISSUE-DOC-PEN-${d.id}`,
          title: `Unverified Application Document: ${d.fileName}`,
          category: "DOCUMENT",
          severity: "LOW",
          explanation: `Document was uploaded but has not yet been stamped as verified or flagged by the scrutiny desk.`,
          supportingRecord: {
            type: "document",
            id: d.id,
            label: `${d.fileName} (${d.type})`,
          },
          currentStatus: "Pending Scrutiny",
          suggestedAction: "Perform document scrutiny and record verification status.",
          isFact: true,
        });
      });

    // Issue H: Pending EVC Task
    evcTasks
      .filter((t) => t.status !== "Resolved" && t.status !== "Closed")
      .forEach((t) => {
        issues.push({
          id: `ISSUE-EVC-${t.id}`,
          title: `Pending Expert Visit (EVC) Inspection`,
          category: "EVC",
          severity: "HIGH",
          explanation: `Physical or virtual expert committee inspection task is pending completion (${t.description}).`,
          supportingRecord: {
            type: "task",
            id: t.id,
            label: `EVC Task ${t.id}`,
            ...(t.dueDate ? { details: `Scheduled: ${t.dueDate}` } : {}),
          },
          currentStatus: "Pending Inspection",
          suggestedAction:
            "Coordinate with inspection committee to submit EVC report and Geo-tagged observations.",
          isFact: true,
        });
      });

    // ── 8. Application Attention & Risk Assessment ─────────────────────────────
    const factors: AttentionFactor[] = [];
    let riskScore = 10; // baseline

    // Factor 1: SLA Pendency
    if (sla.status === "overdue") {
      riskScore += 35;
      factors.push({
        dimension: "SLA Pendency",
        severity: "CRITICAL",
        observation: `Application SLA is overdue by ${Math.abs(sla.daysRemaining)} day(s). Stage ageing: ${ageing ?? 0} days.`,
        supportingEvidence: `Deadline: ${app.slaDeadline}`,
        isFact: true,
      });
    } else if (sla.status === "due_soon") {
      riskScore += 20;
      factors.push({
        dimension: "SLA Pendency",
        severity: "HIGH",
        observation: `SLA deadline approaching (${sla.daysRemaining} days remaining).`,
        supportingEvidence: `Deadline: ${app.slaDeadline}`,
        isFact: true,
      });
    } else {
      factors.push({
        dimension: "SLA Pendency",
        severity: "LOW",
        observation: `Processing timeline is on track (${sla.daysRemaining} days remaining).`,
        supportingEvidence: `Deadline: ${app.slaDeadline}`,
        isFact: true,
      });
    }

    // Factor 2: Deficiencies
    if (openDeficiencies.length >= 2) {
      riskScore += 25;
      factors.push({
        dimension: "Open Deficiencies",
        severity: "CRITICAL",
        observation: `${openDeficiencies.length} unresolved deficiencies recorded against application requirements.`,
        supportingEvidence: openDeficiencies.map((d) => d.title).join("; "),
        isFact: true,
      });
    } else if (openDeficiencies.length === 1) {
      riskScore += 15;
      factors.push({
        dimension: "Open Deficiencies",
        severity: "HIGH",
        observation: `1 open deficiency pending resolution by institution.`,
        supportingEvidence: openDeficiencies[0]?.title ?? "Deficiency recorded",
        isFact: true,
      });
    } else {
      factors.push({
        dimension: "Open Deficiencies",
        severity: "LOW",
        observation: `No unresolved deficiencies on record.`,
        supportingEvidence: "All deficiency tasks cleared",
        isFact: true,
      });
    }

    // Factor 3: Statutory Document Validity
    const expiredCount = trackedDocuments.filter((d) => d.status === "Expired").length;
    const expiringSoonCount = trackedDocuments.filter((d) => d.status === "Expiring Soon").length;
    if (expiredCount > 0) {
      riskScore += 25;
      factors.push({
        dimension: "Statutory Certificate Validity",
        severity: "CRITICAL",
        observation: `${expiredCount} mandatory statutory certificate(s) are expired (e.g., Fire Safety NOC / Occupancy).`,
        supportingEvidence: `${expiredCount} expired documents in compliance ledger`,
        isFact: true,
      });
    } else if (expiringSoonCount > 0) {
      riskScore += 10;
      factors.push({
        dimension: "Statutory Certificate Validity",
        severity: "MEDIUM",
        observation: `${expiringSoonCount} document(s) expiring within 60 days.`,
        supportingEvidence: "Renewal tracking active",
        isFact: true,
      });
    } else {
      factors.push({
        dimension: "Statutory Certificate Validity",
        severity: "LOW",
        observation: `All tracked statutory certificates are valid.`,
        supportingEvidence: "No expired regulatory certificates",
        isFact: true,
      });
    }

    // Factor 4: Post-Approval Undertakings
    if (undertakingsSummary.overdue > 0) {
      riskScore += 20;
      factors.push({
        dimension: "Post-Approval Undertakings",
        severity: "HIGH",
        observation: `${undertakingsSummary.overdue} time-bound undertaking(s) are overdue.`,
        supportingEvidence: "Compliance ledger status: Overdue",
        isFact: true,
      });
    } else if (undertakingsSummary.underReview > 0) {
      riskScore += 5;
      factors.push({
        dimension: "Post-Approval Undertakings",
        severity: "MEDIUM",
        observation: `${undertakingsSummary.underReview} undertaking submission(s) awaiting verification.`,
        supportingEvidence: "Evidence submitted by institution",
        isFact: true,
      });
    } else {
      factors.push({
        dimension: "Post-Approval Undertakings",
        severity: "LOW",
        observation: `Undertakings are up to date or not applicable.`,
        supportingEvidence: "Ledger status: Verified / Pending on schedule",
        isFact: true,
      });
    }

    // Factor 5: Pending Inspections (EVC)
    const openEvc = evcTasks.filter((t) => t.status !== "Resolved" && t.status !== "Closed");
    if (openEvc.length > 0) {
      riskScore += 10;
      factors.push({
        dimension: "Inspection (EVC) Status",
        severity: "HIGH",
        observation: `${openEvc.length} Expert Visit Committee task(s) active.`,
        supportingEvidence: openEvc.map((t) => t.description).join(", "),
        isFact: true,
      });
    } else {
      factors.push({
        dimension: "Inspection (EVC) Status",
        severity: "LOW",
        observation: `No pending EVC inspection tasks.`,
        supportingEvidence: "Inspection verified or not required at current stage",
        isFact: true,
      });
    }

    // Factor 6: Unverified Evidence & Document Scrutiny
    const unverifiedDocs = documents.filter((d) => !d.verified).length;
    if (unverifiedDocs > 0) {
      riskScore += 5;
      factors.push({
        dimension: "Document Scrutiny Completeness",
        severity: "MEDIUM",
        observation: `${unverifiedDocs} application document(s) pending officer verification.`,
        supportingEvidence: "Uploaded documents require desk review",
        isFact: true,
      });
    } else {
      factors.push({
        dimension: "Document Scrutiny Completeness",
        severity: "LOW",
        observation: `All uploaded application documents are verified.`,
        supportingEvidence: "Document verification complete",
        isFact: true,
      });
    }

    riskScore = Math.min(100, riskScore);

    const tier: AttentionTier =
      riskScore >= 70
        ? "CRITICAL"
        : riskScore >= 45
          ? "HIGH_ATTENTION"
          : riskScore >= 25
            ? "MODERATE"
            : "ON_TRACK";

    const attention: AttentionAssessment = {
      tier,
      score: riskScore,
      summary:
        tier === "CRITICAL"
          ? "Critical Attention Required: Case has multiple compounding risks including SLA breach, expired statutory certificates, or open deficiencies."
          : tier === "HIGH_ATTENTION"
            ? "High Attention: Case requires prompt administrative action to address pending deficiencies, upcoming SLA deadlines, or inspection tasks."
            : tier === "MODERATE"
              ? "Moderate Attention: Routine pending verifications or upcoming undertaking deadlines require officer review."
              : "On Track: Application progresses within normative SLA parameters with no critical compliance blockers.",
      factors,
      disclaimer:
        "Attention indicators are computed deterministically via rule-based heuristics across verified operational risk dimensions. This is an explainable decision-support metric and not a black-box statistical projection.",
    };

    // ── 9. Recommended Next Administrative Actions ─────────────────────────────
    const recommendations: RecommendedAction[] = [];
    const allowedNextStages = getAllowedNextStages(app);

    // Recommendation 1: Workflow Stage Transitions
    if (allowedNextStages.length > 0) {
      if (app.currentStage === "Submitted" && allowedNextStages.includes("Scrutiny")) {
        recommendations.push({
          id: `REC-STAGE-SCRUTINY-${app.id}`,
          title: "Assign & Initiate Document Scrutiny",
          actionType: "stage_transition",
          targetStage: "Scrutiny",
          rationale:
            "Application has been submitted with required uploads. Begin technical scrutiny of eligibility criteria.",
          supportingEvidence: `Current stage: Submitted. Workflow allows transition to Scrutiny.`,
          requiredRole: "scrutiny_officer",
          priority: "HIGH",
          requiresHumanConfirmation: true,
        });
      } else if (app.currentStage === "Scrutiny") {
        if (openDeficiencies.length > 0 && allowedNextStages.includes("Deficiency")) {
          recommendations.push({
            id: `REC-STAGE-DEFICIENCY-${app.id}`,
            title: "Issue Deficiency Notice & Move to Deficiency Stage",
            actionType: "stage_transition",
            targetStage: "Deficiency",
            rationale: `${openDeficiencies.length} deficiencies identified during scrutiny. Notify institution to upload corrective submissions.`,
            supportingEvidence: openDeficiencies.map((d) => d.title).join("; "),
            requiredRole: "scrutiny_officer",
            priority: "HIGH",
            requiresHumanConfirmation: true,
          });
        } else if (allowedNextStages.includes("EVC")) {
          recommendations.push({
            id: `REC-STAGE-EVC-${app.id}`,
            title: "Forward Application to Expert Visit Committee (EVC)",
            actionType: "stage_transition",
            targetStage: "EVC",
            rationale:
              "Scrutiny requirements satisfied. Advance application to physical / virtual inspection stage.",
            supportingEvidence: `Zero open deficiencies; Scrutiny documents verified.`,
            requiredRole: "scrutiny_officer",
            priority: "HIGH",
            requiresHumanConfirmation: true,
          });
        } else if (allowedNextStages.includes("Recommendation")) {
          recommendations.push({
            id: `REC-STAGE-REC-${app.id}`,
            title: "Forward Application to Recommendation Committee",
            actionType: "stage_transition",
            targetStage: "Recommendation",
            rationale:
              "Document scrutiny completed. Forward application to regional recommendation committee.",
            supportingEvidence: `Scrutiny phase completed per ${app.workflowTemplate} template.`,
            requiredRole: "scrutiny_officer",
            priority: "HIGH",
            requiresHumanConfirmation: true,
          });
        }
      } else if (app.currentStage === "EVC" && allowedNextStages.includes("Recommendation")) {
        recommendations.push({
          id: `REC-STAGE-REC-${app.id}`,
          title: "Forward Inspection Findings to Recommendation Committee",
          actionType: "stage_transition",
          targetStage: "Recommendation",
          rationale:
            "Expert inspection phase completed. Submit committee findings for administrative recommendation.",
          supportingEvidence: `EVC observations logged; ready for appraisal review.`,
          requiredRole: "evc_officer",
          priority: "HIGH",
          requiresHumanConfirmation: true,
        });
      } else if (app.currentStage === "Recommendation" && allowedNextStages.includes("Decision")) {
        recommendations.push({
          id: `REC-STAGE-DEC-${app.id}`,
          title: "Submit Case for Final Council / Executive Decision",
          actionType: "stage_transition",
          targetStage: "Decision",
          rationale:
            "Recommendation formulated. Advance to executive authority for statutory grant decision.",
          supportingEvidence: `Recommendation stage requirements completed.`,
          requiredRole: "regional_officer",
          priority: "HIGH",
          requiresHumanConfirmation: true,
        });
      } else if (app.currentStage === "Decision" && allowedNextStages.includes("Approved")) {
        recommendations.push({
          id: `REC-STAGE-APP-${app.id}`,
          title: "Grant Statutory Approval (With Conditional Undertakings if applicable)",
          actionType: "stage_transition",
          targetStage: "Approved",
          rationale:
            "All statutory requirements verified. Authority may grant approval, with conditional post-approval undertakings if minor civil/cadre works remain.",
          supportingEvidence: `Executive decision stage reached; council clearances recorded.`,
          requiredRole: "council_officer",
          priority: "HIGH",
          requiresHumanConfirmation: true,
        });
      }

      // Default next stage progression if no specific rule matched
      if (
        recommendations.filter((r) => r.actionType === "stage_transition").length === 0 &&
        allowedNextStages.length > 0
      ) {
        const nextStage = allowedNextStages[0]!;
        recommendations.push({
          id: `REC-STAGE-NEXT-${app.id}`,
          title: `Advance Application to ${STAGE_LABELS[nextStage]}`,
          actionType: "stage_transition",
          targetStage: nextStage,
          rationale: `Application has completed current stage (${STAGE_LABELS[app.currentStage]}). Ready for progression to ${STAGE_LABELS[nextStage]}.`,
          supportingEvidence: `Workflow template: ${app.workflowTemplate}`,
          requiredRole: "officer",
          priority: "HIGH",
          requiresHumanConfirmation: true,
        });
      }
    }

    // Recommendation 2: Address Expired Certificates
    if (expiredCount > 0) {
      recommendations.push({
        id: `REC-EXPIRED-DOC-${app.id}`,
        title: "Dispatch Urgent Statutory Certificate Renewal Notice",
        actionType: "send_reminder",
        rationale: `${expiredCount} mandatory statutory safety certificate(s) have expired. AICTE norms mandate valid documentation before operational clearance.`,
        supportingEvidence: `Expired documents in ledger (${expiredCount}).`,
        requiredRole: "scrutiny_officer",
        priority: "HIGH",
        requiresHumanConfirmation: true,
      });
    }

    // Recommendation 3: Verify Submitted Undertaking Evidence
    if (undertakingsSummary.underReview > 0) {
      recommendations.push({
        id: `REC-VERIFY-UT-${app.id}`,
        title: "Verify Submitted Post-Approval Undertaking Evidence",
        actionType: "verify_evidence",
        rationale: `${undertakingsSummary.underReview} undertaking submission(s) have evidence uploaded by the institution awaiting officer appraisal.`,
        supportingEvidence: "Evidence uploaded to compliance ledger",
        requiredRole: "scrutiny_officer",
        priority: "MEDIUM",
        requiresHumanConfirmation: true,
      });
    }

    // Recommendation 4: Schedule EVC if in EVC stage without date
    if (app.currentStage === "EVC" && !app.evcDate) {
      recommendations.push({
        id: `REC-SCHED-EVC-${app.id}`,
        title: "Schedule Expert Visit Committee (EVC) Date",
        actionType: "schedule_evc",
        rationale:
          "Application is at EVC stage but an inspection date has not yet been designated.",
        supportingEvidence: "Current stage: EVC; evcDate is null",
        requiredRole: "evc_officer",
        priority: "HIGH",
        requiresHumanConfirmation: true,
      });
    }

    return {
      summary,
      attention,
      issues,
      recommendations,
      providerMode: "rule_based",
      providerName: this.name,
      generatedAt,
      humanInTheLoopNotice:
        "Advisory Decision Support System: AI and heuristic agents do not possess statutory authority to approve, reject, or modify application stages. All recommendations require verification and execution by authorized council officers.",
    };
  }

  async generateDraft(
    type: CommunicationDraftType,
    context: CaseIntelligenceContext,
    customInstructions?: string,
  ): Promise<CommunicationDraft> {
    const { application: app, institutionName, institutionAicteId, tasks, undertakings } = context;
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const refNo = `AICTE/APF/${app.region}/${app.id}/${now.getFullYear()}`;

    switch (type) {
      case "DEFICIENCY_NOTICE": {
        const defTasks = tasks.filter(
          (t) => t.type === "Deficiency" && t.status !== "Resolved" && t.status !== "Closed",
        );
        const defBullets =
          defTasks.length > 0
            ? defTasks.map((t, i) => `${i + 1}. Deficiency: ${t.description}`).join("\n")
            : "1. Clarification and supporting documentation required per scrutiny observations.";

        return {
          type,
          title: "Official Deficiency Notice",
          recipient: `${institutionName} (${institutionAicteId})`,
          referenceNo: refNo,
          date: dateStr,
          subject: `DEFICIENCY NOTICE: Application Ref: ${app.id} – Submission of Remedial Compliance`,
          body:
            `To,\n` +
            `The Head of Institution / Principal,\n` +
            `${institutionName},\n` +
            `AICTE Permanent Institute ID: ${institutionAicteId}\n\n` +
            `Sir/Madam,\n\n` +
            `Sub: Scrutiny Observations & Deficiency Notice for Application ID: ${app.id} (${APP_TYPE_LABELS[app.appType]}).\n\n` +
            `Upon technical scrutiny of your application submitted under the Approval Process Handbook (APH), the following deficiencies have been identified:\n\n` +
            `${defBullets}\n\n` +
            `You are hereby instructed to rectify the above-mentioned deficiencies and upload duly attested compliance evidence through the ApprovalFlow AI Portal within 7 working days from the receipt of this notice.\n\n` +
            `Failure to rectify the deficiencies within the stipulated period may result in rejection of the application or non-issuance of approval.\n\n` +
            (customInstructions ? `Additional Notes: ${customInstructions}\n\n` : "") +
            `Yours faithfully,\n\n` +
            `Scrutiny Officer / Regional Officer\n` +
            `ApprovalFlow AI Regulatory Cell, ${app.region} Region\n` +
            `All India Council for Technical Education`,
          recommendedChannels: ["Portal Notification", "Registered Email", "Official Dispatch"],
          isEditable: true,
        };
      }

      case "CLARIFICATION_REQUEST": {
        return {
          type,
          title: "Clarification Request Memo",
          recipient: `${institutionName} (${institutionAicteId})`,
          referenceNo: refNo,
          date: dateStr,
          subject: `CLARIFICATION REQUEST: Application ID: ${app.id} – Urgent Response Solicited`,
          body:
            `To,\n` +
            `The Authorized Signatory,\n` +
            `${institutionName} (${institutionAicteId})\n\n` +
            `Sir/Madam,\n\n` +
            `Sub: Request for Specific Clarification regarding Application ${app.id} in stage: ${STAGE_LABELS[app.currentStage]}.\n\n` +
            `During technical appraisal of your application, certain ambiguities were noted regarding institutional infrastructure / faculty cadre submissions. Please provide detailed pointwise clarifications along with certified corroborative documents.\n\n` +
            (customInstructions
              ? `Specific points requiring clarification:\n${customInstructions}\n\n`
              : "") +
            `Please furnish your clarification via the portal within 3 working days.\n\n` +
            `Officer In-Charge,\n` +
            `ApprovalFlow AI Processing Cell`,
          recommendedChannels: ["Portal Notification", "Email"],
          isEditable: true,
        };
      }

      case "PENDING_DOC_REMINDER": {
        return {
          type,
          title: "Pending Document Reminder",
          recipient: `${institutionName} (${institutionAicteId})`,
          referenceNo: refNo,
          date: dateStr,
          subject: `URGENT REMINDER: Mandatory Document Upload for Application ${app.id}`,
          body:
            `To,\n` +
            `The Principal / Director,\n` +
            `${institutionName} (${institutionAicteId})\n\n` +
            `Sir/Madam,\n\n` +
            `This is an automated administrative reminder regarding application ${app.id} currently in ${STAGE_LABELS[app.currentStage]} stage.\n\n` +
            `Certain mandatory documents or renewed statutory certificates (such as Fire Safety NOC or Building Completion Plan) remain pending or unverified. Please upload legible scanned copies of the valid documents to prevent processing delays or SLA escalation.\n\n` +
            (customInstructions ? `Required items:\n${customInstructions}\n\n` : "") +
            `SLA Deadline: ${app.slaDeadline}.\n\n` +
            `ApprovalFlow Regulatory Desk`,
          recommendedChannels: ["Portal Notification", "SMS Alert", "Email"],
          isEditable: true,
        };
      }

      case "UNDERTAKING_REMINDER": {
        const uts = undertakings.filter((u) => u.status === "Overdue" || u.status === "Pending");
        const utBullets =
          uts.length > 0
            ? uts
                .map(
                  (u, i) =>
                    `${i + 1}. [${u.id}] ${u.title}: ${u.conditionDescription} (Due: ${u.dueDate})`,
                )
                .join("\n")
            : "1. Outstanding post-approval compliance conditions recorded on grant.";

        return {
          type,
          title: "Post-Approval Undertaking Compliance Notice",
          recipient: `${institutionName} (${institutionAicteId})`,
          referenceNo: refNo,
          date: dateStr,
          subject: `COMPLIANCE DIRECTIVE: Fulfilment of Post-Approval Undertakings for Application ${app.id}`,
          body:
            `To,\n` +
            `The Management & Principal,\n` +
            `${institutionName} (${institutionAicteId})\n\n` +
            `Sir/Madam,\n\n` +
            `Sub: Non-fulfilment / Approaching Deadline for Conditional Approval Undertakings.\n\n` +
            `The approval granted for Application ID ${app.id} was conditional upon the time-bound fulfilment of statutory undertakings. Our compliance tracking records show that the following condition(s) remain pending or overdue:\n\n` +
            `${utBullets}\n\n` +
            `You are directed to immediately upload verifiable documentary proof of completion to the ApprovalFlow Compliance Portal.\n\n` +
            `Failure to comply with statutory undertakings constitutes a serious violation of AICTE Approval norms.\n\n` +
            (customInstructions ? `Directive: ${customInstructions}\n\n` : "") +
            `Regional Officer,\n` +
            `AICTE Regional Office, ${app.region}`,
          recommendedChannels: ["Portal Notification", "Registered Post", "Email"],
          isEditable: true,
        };
      }

      case "OFFICER_SUMMARY": {
        const sla = computeSlaStatus(app, app.currentStage);
        return {
          type,
          title: "Officer Executive Case Brief",
          recipient: "Executive Committee / Regional Review Board",
          referenceNo: refNo,
          date: dateStr,
          subject: `CASE BRIEF: Appraisal Summary for Application ${app.id} (${institutionName})`,
          body:
            `CONFIDENTIAL COMMITTEE BRIEFING\n\n` +
            `1. BASIC IDENTIFIERS:\n` +
            `   • Application ID: ${app.id}\n` +
            `   • Institution: ${institutionName} (AICTE ID: ${institutionAicteId})\n` +
            `   • Type: ${APP_TYPE_LABELS[app.appType]} | Region: ${app.region}\n` +
            `   • Current Stage: ${STAGE_LABELS[app.currentStage]} (Entered: ${app.stageEntered?.[app.currentStage] || app.submittedOn})\n` +
            `   • SLA Status: ${sla.status.toUpperCase()} (${sla.daysRemaining} days remaining/overdue)\n\n` +
            `2. SCRUTINY & INSPECTION FINDINGS:\n` +
            `   • Open Deficiencies: ${context.tasks.filter((t) => t.type === "Deficiency" && t.status !== "Resolved").length}\n` +
            `   • EVC Inspection: ${app.evcDate ? `Scheduled for ${app.evcDate}` : "Not scheduled / pending"}\n` +
            `   • Post-Approval Undertakings: ${undertakings.length} recorded (${undertakings.filter((u) => u.status === "Verified").length} verified)\n\n` +
            `3. OFFICER RECOMMENDATION:\n` +
            (customInstructions
              ? `   ${customInstructions}\n\n`
              : `   Case is submitted for administrative review and further stage progression per Approval Process Handbook norms.\n\n`) +
            `Prepared By:\n` +
            `Desk Officer (${app.assignedTo ?? "Unassigned"})\n` +
            `ApprovalFlow AI Case Intelligence Desk`,
          recommendedChannels: ["Committee Dossier", "Internal Portal Note"],
          isEditable: true,
        };
      }

      case "INTERNAL_NOTE": {
        return {
          type,
          title: "Confidential Internal Appraisal Note",
          recipient: "Internal Case File",
          referenceNo: refNo,
          date: dateStr,
          subject: `INTERNAL NOTE: Case Processing Observations for ${app.id}`,
          body:
            `INTERNAL APPRAISAL MINUTE\n` +
            `Date: ${dateStr}\n` +
            `Application: ${app.id} | Stage: ${STAGE_LABELS[app.currentStage]}\n` +
            `Assigned Officer: ${app.assignedTo ?? "Unassigned"}\n\n` +
            `Observations:\n` +
            (customInstructions
              ? `${customInstructions}\n\n`
              : `Case reviewed against APH checklists. Key documents examined. Follow-up recommended with institutional desk regarding pending submissions.\n\n`) +
            `Status: Retained in official audit archive.`,
          recommendedChannels: ["Internal Audit Ledger"],
          isEditable: true,
        };
      }
    }
  }
}

// ── Server-Side / LLM Model Provider Wrapper ─────────────────────────────────

export class ServerSideAIProvider implements AIProvider {
  name = "Google Gemini Live Intelligence Provider";
  mode = "llm" as const;
  private fallbackProvider = new RuleBasedCaseIntelligenceProvider();

  async analyzeCase(context: CaseIntelligenceContext): Promise<CaseIntelligenceResult> {
    try {
      // 1. If running on server (SSR, Node, Vitest, or Nitro server functions)
      if (typeof window === "undefined") {
        const { analyzeCaseWithGemini } = await import("./gemini-server");
        return await analyzeCaseWithGemini(context);
      }

      // 2. If running in browser (client-side), dispatch to server API
      const res = await fetch("/api/gemini/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ context }),
      });

      if (res.ok) {
        const data = (await res.json()) as CaseIntelligenceResult;
        if (data && data.summary && data.attention) {
          return data;
        }
      }

      // Gracefully fall back to rule-based engine if endpoint is unavailable
      return await this.fallbackProvider.analyzeCase(context);
    } catch {
      return await this.fallbackProvider.analyzeCase(context);
    }
  }

  async generateDraft(
    type: CommunicationDraftType,
    context: CaseIntelligenceContext,
    customInstructions?: string,
  ): Promise<CommunicationDraft> {
    try {
      // 1. If running on server
      if (typeof window === "undefined") {
        const { generateDraftWithGemini } = await import("./gemini-server");
        return await generateDraftWithGemini(type, context, customInstructions);
      }

      // 2. If running in browser
      const res = await fetch("/api/gemini/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type, context, customInstructions }),
      });

      if (res.ok) {
        const draft = (await res.json()) as CommunicationDraft;
        if (draft && draft.body && draft.subject) {
          return draft;
        }
      }

      return await this.fallbackProvider.generateDraft(type, context, customInstructions);
    } catch {
      return await this.fallbackProvider.generateDraft(type, context, customInstructions);
    }
  }
}

// ── Global Service Singleton & Factory ────────────────────────────────────────

class CaseIntelligenceService {
  private activeProvider: AIProvider = new ServerSideAIProvider();

  setProvider(provider: AIProvider): void {
    this.activeProvider = provider;
  }

  getProvider(): AIProvider {
    return this.activeProvider;
  }

  buildContext(appId: string): CaseIntelligenceContext {
    const app = afStore.getApplication(appId);
    if (!app) throw new Error(`Application ${appId} not found`);

    const inst = afStore.getInstitution(app.institutionId);
    const docs = afStore.documents.filter((d) => d.appId === app.id);
    const tasks = afStore.tasks.filter((t) => t.appId === app.id);
    const auditLogs = afStore.auditLogs.filter((l) => l.appId === app.id);
    const undertakings = postApprovalStore.getUndertakingsForApplication(app.id);
    const trackedDocuments = inst
      ? postApprovalStore.getTrackedDocumentsForInstitution(inst.id)
      : [];

    return {
      application: app,
      institutionName: inst?.name ?? app.institutionId,
      institutionAicteId: inst?.aicteId ?? "N/A",
      institutionState: inst?.state ?? "N/A",
      documents: docs,
      tasks,
      auditLogs,
      undertakings,
      trackedDocuments,
      ...(app.assignedTo ? { currentOfficerId: app.assignedTo } : {}),
    };
  }

  async getCaseIntelligence(appId: string): Promise<CaseIntelligenceResult> {
    const context = this.buildContext(appId);
    return await this.activeProvider.analyzeCase(context);
  }

  async generateDraft(
    appId: string,
    type: CommunicationDraftType,
    customInstructions?: string,
  ): Promise<CommunicationDraft> {
    const context = this.buildContext(appId);
    return await this.activeProvider.generateDraft(type, context, customInstructions);
  }

  // ── Human-in-the-Loop Safe Execution ─────────────────────────────────────────
  /**
   * Executes a recommended administrative action ONLY upon explicit authorized officer confirmation.
   * AI can NEVER call this method independently.
   */
  executeActionWithHumanConfirmation(params: {
    appId: string;
    actionId: string;
    userId: string;
    userRole: string;
    targetStage?: Stage | undefined;
    remarks?: string | undefined;
  }): { success: boolean; message: string } {
    const app = afStore.getApplication(params.appId);
    if (!app) return { success: false, message: "Application not found" };

    if (params.targetStage) {
      const validImmediate = STAGE_TRANSITIONS[app.currentStage] ?? [];
      const allowedInTemplate = getAllowedNextStages(app);

      if (
        !validImmediate.includes(params.targetStage) ||
        !allowedInTemplate.includes(params.targetStage)
      ) {
        return {
          success: false,
          message: `Transition to ${params.targetStage} is not permitted from current stage ${app.currentStage}.`,
        };
      }

      // Check role authorization: institutions are not permitted to transition application review stages
      const normalizedRole = params.userRole.toLowerCase();
      if (
        normalizedRole === "institution" ||
        normalizedRole === "institution_liaison" ||
        normalizedRole === "user"
      ) {
        return {
          success: false,
          message: `Role "${params.userRole}" is not permitted to execute stage transitions.`,
        };
      }

      // Execute authorized transition
      afStore.transitionStage(
        app.id,
        params.targetStage,
        params.userId,
        params.remarks || `Executed recommended transition to ${params.targetStage}`,
      );

      return {
        success: true,
        message: `Successfully transitioned application to ${STAGE_LABELS[params.targetStage]}.`,
      };
    }

    // Record non-transition action in audit log
    afStore.auditLogs.unshift({
      id: `log-ai-act-${Date.now()}`,
      appId: app.id,
      userId: params.userId,
      action: `Officer executed recommended action (${params.actionId})`,
      timestamp: new Date().toISOString(),
      ...(params.remarks ? { remarks: params.remarks } : {}),
    });

    return {
      success: true,
      message: "Action recorded in official application audit trail.",
    };
  }

  /**
   * Saves a drafted communication memo to the application audit log with authorized attribution.
   */
  saveDraftToAuditTrail(params: {
    appId: string;
    draft: CommunicationDraft;
    userId: string;
  }): void {
    afStore.auditLogs.unshift({
      id: `log-draft-${Date.now()}`,
      appId: params.appId,
      userId: params.userId,
      action: `Official Communication Drafted: ${params.draft.title}`,
      timestamp: new Date().toISOString(),
      remarks: `Ref: ${params.draft.referenceNo} | Subject: ${params.draft.subject}`,
    });
  }

  /**
   * Dispatches a drafted notice as an official in-portal notification with officer confirmation.
   */
  dispatchDraftNotification(params: {
    appId: string;
    draft: CommunicationDraft;
    targetRole?: "institution" | "officer" | "admin" | undefined;
  }): void {
    notifStore.createNotification({
      dedupKey: `notif-draft-${params.appId}-${params.draft.type}-${Date.now()}`,
      type:
        params.draft.type === "DEFICIENCY_NOTICE"
          ? "DEFICIENCY_RAISED"
          : params.draft.type === "UNDERTAKING_REMINDER"
            ? "COMPLIANCE_REQUIRED"
            : "SLA_APPROACHING",
      title: params.draft.subject,
      description: params.draft.body.slice(0, 160) + "...",
      appId: params.appId,
      targetRole: params.targetRole || "institution",
      priority:
        params.draft.type === "DEFICIENCY_NOTICE" || params.draft.type === "UNDERTAKING_REMINDER"
          ? "high"
          : "medium",
      route: "/demo/approvalflow/applications",
    });
  }
}

export const caseIntelligenceService = new CaseIntelligenceService();
