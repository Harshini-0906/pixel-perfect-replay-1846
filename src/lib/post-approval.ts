/**
 * ApprovalFlow AI — Post-Approval Undertakings & Document Lifecycle Intelligence
 * Sprint 4 Module: Strongly typed undertakings, post-approval conditions,
 * document expiry/validity lifecycle tracking, and compliance evidence workflows.
 */

import { afStore, storeEvents, daysUntil, type Stage } from "./approval-flow";
import { notifStore } from "./notifications";

// ── Types & Interfaces ────────────────────────────────────────────────────────

export type UndertakingStatus =
  "Pending" | "In Progress" | "Submitted" | "Under Review" | "Verified" | "Rejected" | "Overdue";

export interface UndertakingEvidence {
  id: string;
  fileName: string;
  submittedAt: string;
  submittedBy: string;
  explanation: string;
  version: number;
}

export interface UndertakingAudit {
  timestamp: string;
  action: string;
  userId: string;
  remarks?: string | undefined;
}

export interface Undertaking {
  id: string;
  institutionId: string;
  appId: string;
  title: string;
  conditionDescription: string;
  assignedResponsibility: string;
  createdAt: string;
  dueDate: string;
  status: UndertakingStatus;
  evidences: UndertakingEvidence[];
  officerRemarks?: string | undefined;
  verifiedAt?: string | undefined;
  verifiedBy?: string | undefined;
  auditTrail: UndertakingAudit[];
}

export type DocumentLifecycleStatus =
  | "Valid"
  | "Expiring Soon"
  | "Expired"
  | "Renewal Submitted"
  | "Under Verification"
  | "Renewed"
  | "Rejected";

export interface DocumentVersion {
  version: number;
  fileName: string;
  issueDate?: string | undefined;
  expiryDate: string;
  uploadedAt: string;
  uploadedBy: string;
  verified: boolean;
  remarks?: string | undefined;
}

export interface TrackedDocument {
  id: string;
  institutionId: string;
  appId?: string | undefined;
  docType: string;
  documentName: string;
  issueDate?: string | undefined;
  expiryDate: string;
  currentVersion: number;
  status: DocumentLifecycleStatus;
  history: DocumentVersion[];
  lastVerifiedAt?: string | undefined;
  lastVerifiedBy?: string | undefined;
}

// ── Default Prototype Thresholds ──────────────────────────────────────────────
export const POST_APPROVAL_CONFIG = {
  documentExpiringSoonWindowDays: 60, // Document expiry warning window
  undertakingDueSoonWindowDays: 7, // Undertaking due warning window
};

// ── Post-Approval Compliance Store ────────────────────────────────────────────
class PostApprovalStore {
  private undertakings: Undertaking[] = [];
  private trackedDocs: TrackedDocument[] = [];

  constructor() {
    this.load();
    if (this.undertakings.length === 0 && this.trackedDocs.length === 0) {
      this.seed();
    }
  }

  private persist() {
    try {
      localStorage.setItem(
        "approvalFlowPostApproval_v1",
        JSON.stringify({
          undertakings: this.undertakings,
          trackedDocs: this.trackedDocs,
        }),
      );
    } catch {
      /* ignore storage errors */
    }
    storeEvents.emit();
  }

  private load() {
    try {
      const raw = localStorage.getItem("approvalFlowPostApproval_v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.undertakings)) this.undertakings = parsed.undertakings;
        if (Array.isArray(parsed.trackedDocs)) this.trackedDocs = parsed.trackedDocs;
      }
    } catch {
      /* ignore load errors */
    }
  }

  reset() {
    this.undertakings = [];
    this.trackedDocs = [];
    try {
      localStorage.removeItem("approvalFlowPostApproval_v1");
    } catch {
      /* ignore */
    }
    this.seed();
  }

  private seed() {
    // Generate prototype undertakings from candidate apps
    const candidateApps =
      afStore.applications.length > 0
        ? afStore.applications.slice(0, 8)
        : [
            { id: "APP-2027-0001", institutionId: "inst-1" },
            { id: "APP-2027-0002", institutionId: "inst-2" },
            { id: "APP-2027-0003", institutionId: "inst-3" },
            { id: "APP-2027-0004", institutionId: "inst-4" },
            { id: "APP-2027-0005", institutionId: "inst-5" },
            { id: "APP-2027-0006", institutionId: "inst-6" },
            { id: "APP-2027-0007", institutionId: "inst-7" },
            { id: "APP-2027-0008", institutionId: "inst-8" },
          ];

    const now = new Date();

    candidateApps.forEach((app, idx) => {
      // Create 1 to 2 undertakings for seed applications
      const dueDays = idx % 3 === 0 ? -4 : idx % 2 === 0 ? 5 : 25; // mix of overdue, due soon, on track
      const dueStr = new Date(now.getTime() + dueDays * 86400000).toISOString().slice(0, 10);
      const utStatus: UndertakingStatus =
        dueDays < 0 ? "Overdue" : idx % 2 === 0 ? "In Progress" : "Pending";

      const ut: Undertaking = {
        id: `UT-2027-${String(idx + 1).padStart(4, "0")}`,
        institutionId: app.institutionId,
        appId: app.id,
        title:
          idx % 2 === 0
            ? "Faculty Appointment Compliance"
            : "Barrier-Free Access & Ramp Construction",
        conditionDescription:
          idx % 2 === 0
            ? "Submit formal appointment orders and cadre ratio compliance for Department of Computer Engineering."
            : "Complete civil construction of disabled-friendly ramps and tactile paving per APH guidelines.",
        assignedResponsibility: "Head of Institution / Principal",
        createdAt: new Date(now.getTime() - 20 * 86400000).toISOString().slice(0, 10),
        dueDate: dueStr,
        status: utStatus,
        evidences: [],
        auditTrail: [
          {
            timestamp: new Date(now.getTime() - 20 * 86400000).toISOString(),
            action: "Undertaking Created on Conditional Approval",
            userId: "u-reg-1",
            remarks: "Post-approval compliance obligation generated",
          },
        ],
      };
      this.undertakings.push(ut);
    });

    // Seed tracked documents (Fire NOC, Building Plan, Land Lease, etc.)
    const docTypes = [
      { type: "FIRE_NOC", name: "Fire Safety Certificate (NOC)" },
      { type: "OCC_CERT", name: "Occupancy Certificate" },
      { type: "LAND_DOC", name: "Land Ownership / Registered Lease Title" },
      { type: "BUILDING_PLAN", name: "Approved Municipal Building Plan" },
    ];

    const institutions =
      afStore.institutions.length > 0
        ? afStore.institutions.slice(0, 12)
        : Array.from({ length: 12 }, (_, i) => ({ id: `inst-${i + 1}` }));

    institutions.forEach((inst, i) => {
      docTypes.forEach((dt, j) => {
        const offset = ((i * 4 + j) % 5) - 2; // mix of -2 (expired), 0 (expiring soon), 2 (valid)
        const expiryDays = offset === -2 ? -15 : offset === -1 ? 12 : offset === 0 ? 35 : 180;
        const expiryStr = new Date(now.getTime() + expiryDays * 86400000)
          .toISOString()
          .slice(0, 10);
        const docStatus: DocumentLifecycleStatus =
          expiryDays < 0
            ? "Expired"
            : expiryDays <= POST_APPROVAL_CONFIG.documentExpiringSoonWindowDays
              ? "Expiring Soon"
              : "Valid";

        this.trackedDocs.push({
          id: `DOC-TRK-${inst.id}-${dt.type}`,
          institutionId: inst.id,
          appId: `APP-2027-${String((i % 8) + 1).padStart(4, "0")}`,
          docType: dt.type,
          documentName: dt.name,
          issueDate: new Date(now.getTime() - 365 * 86400000).toISOString().slice(0, 10),
          expiryDate: expiryStr,
          currentVersion: 1,
          status: docStatus,
          history: [
            {
              version: 1,
              fileName: `${dt.type.toLowerCase()}_v1.pdf`,
              expiryDate: expiryStr,
              uploadedAt: new Date(now.getTime() - 365 * 86400000).toISOString(),
              uploadedBy: "u-inst-1",
              verified: true,
              remarks: "Verified upon initial scrutiny",
            },
          ],
          lastVerifiedAt: new Date(now.getTime() - 360 * 86400000).toISOString(),
          lastVerifiedBy: "u-scr-1",
        });
      });
    });

    this.persist();
  }

  // ── Undertaking Accessors & Mutations ────────────────────────────────────────

  getAllUndertakings(): Undertaking[] {
    return [...this.undertakings];
  }

  getUndertakingsForInstitution(instId: string): Undertaking[] {
    return this.undertakings.filter((u) => u.institutionId === instId);
  }

  getUndertakingsForApplication(appId: string): Undertaking[] {
    return this.undertakings.filter((u) => u.appId === appId);
  }

  getUndertaking(id: string): Undertaking | undefined {
    return this.undertakings.find((u) => u.id === id);
  }

  createUndertaking(params: {
    appId: string;
    institutionId: string;
    title: string;
    conditionDescription: string;
    assignedResponsibility: string;
    dueDate: string;
    userId: string;
  }): Undertaking {
    const ut: Undertaking = {
      id: `UT-2027-${String(this.undertakings.length + 1).padStart(4, "0")}`,
      institutionId: params.institutionId,
      appId: params.appId,
      title: params.title,
      conditionDescription: params.conditionDescription,
      assignedResponsibility: params.assignedResponsibility,
      createdAt: new Date().toISOString().slice(0, 10),
      dueDate: params.dueDate,
      status: "Pending",
      evidences: [],
      auditTrail: [
        {
          timestamp: new Date().toISOString(),
          action: "Undertaking Created",
          userId: params.userId,
          remarks: "Mandatory condition recorded upon conditional approval",
        },
      ],
    };

    this.undertakings.unshift(ut);

    // Record in global afStore audit trail
    afStore.auditLogs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      appId: params.appId,
      userId: params.userId,
      action: `Undertaking Created: ${params.title}`,
      timestamp: new Date().toISOString(),
      remarks: `Due Date: ${params.dueDate}. Condition: ${params.conditionDescription}`,
    });

    // Notify institution
    notifStore.createNotification({
      dedupKey: `notif-ut-create-${ut.id}`,
      type: "COMPLIANCE_REQUIRED",
      title: `Mandatory Undertaking Assigned: ${ut.title}`,
      description: `${ut.conditionDescription} (Due: ${ut.dueDate})`,
      appId: params.appId,
      targetRole: "institution",
      priority: "high",
      route: "/demo/approvalflow/compliance",
    });

    this.persist();
    return ut;
  }

  submitEvidence(params: {
    undertakingId: string;
    fileName: string;
    explanation: string;
    userId: string;
  }): Undertaking {
    const ut = this.getUndertaking(params.undertakingId);
    if (!ut) throw new Error("Undertaking not found");

    const newEvidence: UndertakingEvidence = {
      id: `ev-${Date.now()}`,
      fileName: params.fileName,
      submittedAt: new Date().toISOString(),
      submittedBy: params.userId,
      explanation: params.explanation,
      version: ut.evidences.length + 1,
    };

    ut.evidences.unshift(newEvidence);
    ut.status = "Under Review";
    ut.auditTrail.unshift({
      timestamp: new Date().toISOString(),
      action: `Evidence Submitted (v${newEvidence.version})`,
      userId: params.userId,
      remarks: params.explanation,
    });

    // Notify officers
    notifStore.createNotification({
      dedupKey: `notif-ut-ev-${ut.id}-v${newEvidence.version}`,
      type: "CLARIFICATION_SUBMITTED",
      title: `Undertaking Evidence Submitted: ${ut.title}`,
      description: `Institution submitted compliance evidence (${params.fileName}). Officer review requested.`,
      appId: ut.appId,
      targetRole: "officer",
      priority: "medium",
      route: "/demo/approvalflow/compliance",
    });

    this.persist();
    return ut;
  }

  verifyUndertaking(params: {
    undertakingId: string;
    approved: boolean;
    remarks: string;
    userId: string;
  }): Undertaking {
    const ut = this.getUndertaking(params.undertakingId);
    if (!ut) throw new Error("Undertaking not found");

    ut.officerRemarks = params.remarks;
    ut.verifiedAt = new Date().toISOString();
    ut.verifiedBy = params.userId;

    if (params.approved) {
      ut.status = "Verified";
      ut.auditTrail.unshift({
        timestamp: new Date().toISOString(),
        action: "Undertaking Fulfilment Verified",
        userId: params.userId,
        remarks: params.remarks,
      });

      notifStore.createNotification({
        dedupKey: `notif-ut-verified-${ut.id}`,
        type: "INSPECTION_COMPLETED",
        title: `Undertaking Fulfilment Accepted: ${ut.title}`,
        description: `Officer accepted the submitted compliance evidence. Status: Verified.`,
        appId: ut.appId,
        targetRole: "institution",
        priority: "medium",
        route: "/demo/approvalflow/compliance",
      });
    } else {
      ut.status = "Rejected";
      ut.auditTrail.unshift({
        timestamp: new Date().toISOString(),
        action: "Undertaking Evidence Rejected / Corrections Requested",
        userId: params.userId,
        remarks: params.remarks,
      });

      notifStore.createNotification({
        dedupKey: `notif-ut-rejected-${ut.id}-${Date.now()}`,
        type: "DEFICIENCY_RAISED",
        title: `Compliance Evidence Rejected: ${ut.title}`,
        description: `Officer feedback: ${params.remarks}. Correction and resubmission required.`,
        appId: ut.appId,
        targetRole: "institution",
        priority: "high",
        route: "/demo/approvalflow/compliance",
      });
    }

    this.persist();
    return ut;
  }

  // ── Document Validity & Lifecycle ───────────────────────────────────────────

  getAllTrackedDocuments(): TrackedDocument[] {
    return [...this.trackedDocs];
  }

  getTrackedDocumentsForInstitution(instId: string): TrackedDocument[] {
    return this.trackedDocs.filter((d) => d.institutionId === instId);
  }

  getTrackedDocument(id: string): TrackedDocument | undefined {
    return this.trackedDocs.find((d) => d.id === id);
  }

  uploadDocumentRenewal(params: {
    documentId: string;
    fileName: string;
    newExpiryDate: string;
    issueDate?: string | undefined;
    userId: string;
  }): TrackedDocument {
    const doc = this.getTrackedDocument(params.documentId);
    if (!doc) throw new Error("Tracked document not found");

    const newVersionNum = doc.currentVersion + 1;
    const newVersion: DocumentVersion = {
      version: newVersionNum,
      fileName: params.fileName,
      issueDate: params.issueDate,
      expiryDate: params.newExpiryDate,
      uploadedAt: new Date().toISOString(),
      uploadedBy: params.userId,
      verified: false,
    };

    doc.history.unshift(newVersion);
    doc.currentVersion = newVersionNum;
    doc.status = "Renewal Submitted";

    // Notify scrutiny officer
    notifStore.createNotification({
      dedupKey: `notif-doc-renew-${doc.id}-v${newVersionNum}`,
      type: "CLARIFICATION_SUBMITTED",
      title: `Document Renewal Submitted: ${doc.documentName}`,
      description: `Replacement certificate uploaded (${params.fileName}). Expiry: ${params.newExpiryDate}.`,
      appId: doc.appId || "COMPLIANCE",
      targetRole: "officer",
      priority: "medium",
      route: "/demo/approvalflow/compliance",
    });

    this.persist();
    return doc;
  }

  verifyDocumentRenewal(params: {
    documentId: string;
    approved: boolean;
    remarks: string;
    userId: string;
  }): TrackedDocument {
    const doc = this.getTrackedDocument(params.documentId);
    if (!doc) throw new Error("Tracked document not found");

    const latest = doc.history[0];
    if (latest) {
      latest.verified = params.approved;
      latest.remarks = params.remarks;
    }

    doc.lastVerifiedAt = new Date().toISOString();
    doc.lastVerifiedBy = params.userId;

    if (params.approved) {
      doc.status = "Renewed";
      if (latest) {
        doc.expiryDate = latest.expiryDate;
      }

      notifStore.createNotification({
        dedupKey: `notif-doc-renew-appr-${doc.id}-v${doc.currentVersion}`,
        type: "INSPECTION_COMPLETED",
        title: `Document Renewal Verified: ${doc.documentName}`,
        description: `Officer confirmed renewed certificate. Valid until: ${doc.expiryDate}.`,
        appId: doc.appId || "COMPLIANCE",
        targetRole: "institution",
        priority: "medium",
        route: "/demo/approvalflow/compliance",
      });
    } else {
      doc.status = "Rejected";

      notifStore.createNotification({
        dedupKey: `notif-doc-renew-rej-${doc.id}-v${doc.currentVersion}`,
        type: "DEFICIENCY_RAISED",
        title: `Document Renewal Rejected: ${doc.documentName}`,
        description: `Renewal rejected: ${params.remarks}. Upload compliant certificate.`,
        appId: doc.appId || "COMPLIANCE",
        targetRole: "institution",
        priority: "high",
        route: "/demo/approvalflow/compliance",
      });
    }

    this.persist();
    return doc;
  }

  // ── Automated Idempotent Reminders & Escalations ────────────────────────────
  /**
   * Reconciles undertaking deadlines and document expiry states.
   * Emits deduplicated alerts and escalations without duplicate entries.
   */
  evaluateComplianceObligations(): void {
    const now = new Date();

    // 1. Evaluate Undertakings
    this.undertakings.forEach((ut) => {
      if (ut.status === "Verified") return;

      const daysLeft = daysUntil(ut.dueDate);

      if (daysLeft < 0) {
        ut.status = "Overdue";
        const daysOD = Math.abs(daysLeft);

        // Overdue notification
        notifStore.createNotification({
          dedupKey: `notif-ut-od-${ut.id}`,
          type: "SLA_OVERDUE",
          title: `Post-Approval Undertaking Overdue: ${ut.title}`,
          description: `Undertaking is ${daysOD} day(s) past its due date (${ut.dueDate}).`,
          appId: ut.appId,
          targetRole: "institution",
          priority: "high",
          route: "/demo/approvalflow/compliance",
        });

        // Trigger escalation if overdue exceeds 7 days
        if (daysOD >= 7) {
          notifStore.triggerEscalation(
            ut.appId,
            2,
            `Institutional post-approval undertaking "${ut.title}" is ${daysOD} days overdue.`,
          );
        }
      } else if (daysLeft <= POST_APPROVAL_CONFIG.undertakingDueSoonWindowDays) {
        // Due soon notification
        notifStore.createNotification({
          dedupKey: `notif-ut-duesoon-${ut.id}`,
          type: "SLA_APPROACHING",
          title: `Undertaking Due Soon: ${ut.title}`,
          description: `Compliance obligation due in ${daysLeft} day(s) (${ut.dueDate}).`,
          appId: ut.appId,
          targetRole: "institution",
          priority: "medium",
          route: "/demo/approvalflow/compliance",
        });
      }
    });

    // 2. Evaluate Document Validity
    this.trackedDocs.forEach((doc) => {
      const daysLeft = daysUntil(doc.expiryDate);

      if (daysLeft < 0 && doc.status !== "Renewed" && doc.status !== "Renewal Submitted") {
        doc.status = "Expired";
        notifStore.createNotification({
          dedupKey: `notif-doc-exp-${doc.id}`,
          type: "SLA_OVERDUE",
          title: `Statutory Document Expired: ${doc.documentName}`,
          description: `Mandatory document expired on ${doc.expiryDate}. Immediate renewal submission required.`,
          appId: doc.appId || "COMPLIANCE",
          targetRole: "institution",
          priority: "high",
          route: "/demo/approvalflow/compliance",
        });

        // Escalation for critically expired mandatory safety certificates (e.g. Fire NOC > 14 days)
        if (Math.abs(daysLeft) >= 14 && doc.appId) {
          notifStore.triggerEscalation(
            doc.appId,
            2,
            `Required regulatory document "${doc.documentName}" has been expired for ${Math.abs(daysLeft)} days.`,
          );
        }
      } else if (
        daysLeft <= POST_APPROVAL_CONFIG.documentExpiringSoonWindowDays &&
        daysLeft >= 0 &&
        (doc.status === "Valid" || doc.status === "Expiring Soon")
      ) {
        doc.status = "Expiring Soon";
        notifStore.createNotification({
          dedupKey: `notif-doc-expsoon-${doc.id}`,
          type: "SLA_APPROACHING",
          title: `Document Expiring Soon: ${doc.documentName}`,
          description: `Certificate validity expires in ${daysLeft} day(s) (${doc.expiryDate}). Please obtain renewal.`,
          appId: doc.appId || "COMPLIANCE",
          targetRole: "institution",
          priority: "medium",
          route: "/demo/approvalflow/compliance",
        });
      }
    });

    this.persist();
  }

  // ── Statistics for Compliance Dashboard ─────────────────────────────────────
  getComplianceStats(institutionId?: string) {
    const utList = institutionId
      ? this.undertakings.filter(
          (u) =>
            u.institutionId === institutionId ||
            (institutionId === "inst-1" && u.institutionId === "inst-001"),
        )
      : this.undertakings;
    const docList = institutionId
      ? this.trackedDocs.filter(
          (d) =>
            d.institutionId === institutionId ||
            (institutionId === "inst-1" && d.institutionId === "inst-001"),
        )
      : this.trackedDocs;

    const totalUt = utList.length;
    const pendingUt = utList.filter(
      (u) => u.status === "Pending" || u.status === "In Progress",
    ).length;
    const overdueUt = utList.filter(
      (u) => u.status === "Overdue" || (daysUntil(u.dueDate) < 0 && u.status !== "Verified"),
    ).length;
    const awaitingReviewUt = utList.filter(
      (u) => u.status === "Submitted" || u.status === "Under Review",
    ).length;
    const verifiedUt = utList.filter((u) => u.status === "Verified").length;

    const totalDocs = docList.length;
    const expiringSoonDocs = docList.filter((d) => d.status === "Expiring Soon").length;
    const expiredDocs = docList.filter((d) => d.status === "Expired").length;
    const renewalPendingDocs = docList.filter(
      (d) => d.status === "Renewal Submitted" || d.status === "Under Verification",
    ).length;

    return {
      totalUt,
      pendingUt,
      overdueUt,
      awaitingReviewUt,
      verifiedUt,
      totalDocs,
      expiringSoonDocs,
      expiredDocs,
      renewalPendingDocs,
    };
  }
}

export const postApprovalStore = new PostApprovalStore();

// Run initial evaluation
try {
  postApprovalStore.evaluateComplianceObligations();
} catch {
  /* ignore */
}
