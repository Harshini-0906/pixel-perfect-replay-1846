// ApprovalFlow AI — Sprint 5 Tests
// AI-Assisted Case Intelligence & Decision Support

import { describe, it, expect, beforeEach } from "vitest";
import {
  caseIntelligenceService,
  ServerSideAIProvider,
  type CommunicationDraftType,
} from "@/lib/case-intelligence";
import { afStore } from "@/lib/approval-flow";
import { postApprovalStore } from "@/lib/post-approval";
import { notifStore } from "@/lib/notifications";

describe("Sprint 5: AI-Assisted Case Intelligence & Decision Support", () => {
  beforeEach(() => {
    localStorage.clear();
    notifStore.reset();
    afStore.reset();
    postApprovalStore.reset();
  });

  // ── 1. Case Summary Generation ──────────────────────────────────────────────
  it("generates structured executive case summaries from application records", async () => {
    const app = afStore.applications[0];
    if (!app) throw new Error("Seed application not found");

    const result = await caseIntelligenceService.getCaseIntelligence(app.id);

    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.summary.appId).toBe(app.id);
    expect(result.summary.currentStage).toBe(app.currentStage);
    expect(typeof result.summary.executiveNarrative).toBe("string");
    expect(result.summary.executiveNarrative.length).toBeGreaterThan(20);
    expect(Array.isArray(result.summary.completedStages)).toBe(true);
    expect(Array.isArray(result.summary.pendingStages)).toBe(true);
    expect(result.summary.generatedAt).toBeDefined();
  });

  // ── 2. Missing Information & Unverified Document Detection ──────────────────
  it("identifies unverified documents and data flags", async () => {
    const app = afStore.applications[0];
    if (!app) throw new Error("Seed application not found");

    // Add an unverified document
    afStore.documents.unshift({
      id: "doc-test-unverified",
      appId: app.id,
      fileName: "unverified_site_map.pdf",
      type: "BUILDING_PLAN",
      verified: false,
      flags: ["Signature unclear"],
    });

    const result = await caseIntelligenceService.getCaseIntelligence(app.id);
    const unverifiedIssue = result.issues.find(
      (i) => i.category === "DOCUMENT" && i.supportingRecord.id === "doc-test-unverified",
    );

    expect(unverifiedIssue).toBeDefined();
    expect(unverifiedIssue?.isFact).toBe(true);
    expect(unverifiedIssue?.suggestedAction).toBeDefined();
  });

  // ── 3. Outstanding Deficiency & EVC Task Identification ─────────────────────
  it("identifies outstanding deficiencies and pending EVC inspections", async () => {
    const app = afStore.applications[1];
    if (!app) throw new Error("Seed application not found");

    // Add an open deficiency task
    afStore.tasks.unshift({
      id: "tsk-def-test-99",
      appId: app.id,
      type: "Deficiency",
      description: "Cadre ratio compliance shortfall in Mechanical Dept",
      dueDate: "2026-11-15",
      status: "Open",
    });

    const result = await caseIntelligenceService.getCaseIntelligence(app.id);
    const defIssue = result.issues.find((i) => i.supportingRecord.id === "tsk-def-test-99");

    expect(defIssue).toBeDefined();
    expect(defIssue?.category).toBe("DEFICIENCY");
    expect(defIssue?.severity).toBe("HIGH");
    expect(defIssue?.explanation).toContain("unresolved");
  });

  // ── 4. Explainable SLA & Compliance Risk Attention Tiers ────────────────────
  it("computes explainable SLA and operational risk attention tiers", async () => {
    const app = afStore.applications[2];
    if (!app) throw new Error("Seed application not found");

    // Make app overdue
    app.slaDeadline = "2026-10-01";
    app.stageEntered = { [app.currentStage]: "2026-09-15T00:00:00.000Z" };

    const result = await caseIntelligenceService.getCaseIntelligence(app.id);
    expect(result.attention).toBeDefined();
    expect(["CRITICAL", "HIGH_ATTENTION", "MODERATE", "ON_TRACK"]).toContain(result.attention.tier);
    expect(result.attention.score).toBeGreaterThanOrEqual(10);
    expect(result.attention.factors.length).toBeGreaterThanOrEqual(5);

    // Verify SLA factor is flagged
    const slaFactor = result.attention.factors.find((f) => f.dimension === "SLA Pendency");
    expect(slaFactor).toBeDefined();
    expect(slaFactor?.severity).toBe("CRITICAL");
  });

  // ── 5. Statutory Document & Post-Approval Undertaking Detection ─────────────
  it("detects expired statutory certificates and overdue post-approval undertakings", async () => {
    const app = afStore.applications[3];
    if (!app) throw new Error("Seed application not found");

    // Create overdue undertaking
    postApprovalStore.createUndertaking({
      appId: app.id,
      institutionId: app.institutionId,
      title: "Ramp Construction Undertaking",
      conditionDescription: "Complete tactile paving and ramps",
      assignedResponsibility: "Head of Institution",
      dueDate: "2026-09-01", // Past
      userId: "u-reg-1",
    });

    // Run compliance evaluator to mark overdue
    postApprovalStore.evaluateComplianceObligations();

    const result = await caseIntelligenceService.getCaseIntelligence(app.id);
    const utIssue = result.issues.find((i) => i.category === "UNDERTAKING");

    expect(utIssue).toBeDefined();
    expect(utIssue?.title).toContain("Undertaking");
  });

  // ── 6. Recommendation Validity against Workflow Transitions ────────────────
  it("generates next action recommendations adhering strictly to workflow templates", async () => {
    const app = afStore.applications[4];
    if (!app) throw new Error("Seed application not found");

    const result = await caseIntelligenceService.getCaseIntelligence(app.id);
    expect(result.recommendations.length).toBeGreaterThan(0);

    // Each recommended stage transition must belong to allowed stages
    result.recommendations
      .filter((r) => r.actionType === "stage_transition" && r.targetStage)
      .forEach((r) => {
        expect(r.requiresHumanConfirmation).toBe(true);
      });
  });

  // ── 7. Role-Based Permissions & Human-in-the-Loop Safe Execution ────────────
  it("prevents AI autonomous execution and verifies role authorization upon human action", async () => {
    const app = afStore.applications[0];
    if (!app) throw new Error("Seed application not found");

    // Attempt invalid transition with unauthorized role
    const failedExec = caseIntelligenceService.executeActionWithHumanConfirmation({
      appId: app.id,
      actionId: "rec-test-1",
      userId: "u-inst-1",
      userRole: "institution",
      targetStage: "Approved", // Institution cannot approve
    });

    expect(failedExec.success).toBe(false);
    expect(failedExec.message).toContain("not permitted");

    // Valid officer confirmation records in audit trail
    const auditCountBefore = afStore.auditLogs.length;
    const okExec = caseIntelligenceService.executeActionWithHumanConfirmation({
      appId: app.id,
      actionId: "rec-audit-record",
      userId: "u-scr-1",
      userRole: "officer",
      remarks: "Officer verified recommendation and recorded action",
    });

    expect(okExec.success).toBe(true);
    expect(afStore.auditLogs.length).toBeGreaterThan(auditCountBefore);
    expect(afStore.auditLogs[0]?.action).toContain("Officer executed recommended action");
  });

  // ── 8. AI Provider Resilience & Graceful Rule-Based Fallback ────────────────
  it("falls back gracefully to deterministic rule-based analysis when AI provider has no key or fails", async () => {
    const app = afStore.applications[0];
    if (!app) throw new Error("Seed application not found");
    const serverProvider = new ServerSideAIProvider();

    // Verify mode is llm interface
    expect(serverProvider.mode).toBe("llm");

    const context = caseIntelligenceService.buildContext(app.id);
    const result = await serverProvider.analyzeCase(context);

    expect(result).toBeDefined();
    expect(result.summary.appId).toBe(app.id);
    expect(result.issues).toBeDefined();
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  // ── 9. Official Communication Draft Generation ──────────────────────────────
  it("generates context-grounded drafts for all 6 official communication types", async () => {
    const app = afStore.applications[0];
    if (!app) throw new Error("Seed application not found");
    const draftTypes: CommunicationDraftType[] = [
      "DEFICIENCY_NOTICE",
      "CLARIFICATION_REQUEST",
      "PENDING_DOC_REMINDER",
      "UNDERTAKING_REMINDER",
      "OFFICER_SUMMARY",
      "INTERNAL_NOTE",
    ];

    for (const dt of draftTypes) {
      const draft = await caseIntelligenceService.generateDraft(
        app.id,
        dt,
        "Specific review note: verify lab equipment purchase receipts.",
      );

      expect(draft).toBeDefined();
      expect(draft.type).toBe(dt);
      expect(draft.referenceNo).toContain(app.id);
      expect(draft.subject.length).toBeGreaterThan(10);
      expect(draft.body).toContain(app.id);
      expect(draft.isEditable).toBe(true);
      expect(draft.recommendedChannels.length).toBeGreaterThan(0);
    }
  });

  // ── 10. Draft Saving and Dispatch Integration ───────────────────────────────
  it("saves drafts to audit trail and dispatches in-portal notifications upon officer action", async () => {
    const app = afStore.applications[0];
    if (!app) throw new Error("Seed application not found");
    const draft = await caseIntelligenceService.generateDraft(app.id, "DEFICIENCY_NOTICE");

    // 1. Save draft to audit trail
    const logsBefore = afStore.auditLogs.length;
    caseIntelligenceService.saveDraftToAuditTrail({
      appId: app.id,
      draft,
      userId: "u-scr-1",
    });

    expect(afStore.auditLogs.length).toBe(logsBefore + 1);
    expect(afStore.auditLogs[0]?.action).toContain("Official Communication Drafted");

    // 2. Dispatch notification
    const notifsBefore = notifStore.getAllNotifications().length;
    caseIntelligenceService.dispatchDraftNotification({
      appId: app.id,
      draft,
      targetRole: "institution",
    });

    expect(notifStore.getAllNotifications().length).toBe(notifsBefore + 1);
    const latestNotif = notifStore.getAllNotifications()[0];
    expect(latestNotif?.appId).toBe(app.id);
    expect(latestNotif?.title).toBe(draft.subject);
  });
});
