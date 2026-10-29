// ApprovalFlow AI — Sprint 3 Tests
// Automated Notifications & Intelligent Escalation Engine Tests

import { describe, it, expect, beforeEach } from "vitest";
import {
  notifStore,
  NOTIFICATION_CONFIG,
  type AppNotification,
  type EscalationRecord,
} from "@/lib/notifications";
import { afStore, type Application } from "@/lib/approval-flow";

describe("Sprint 3: Automated Notifications & Escalations Engine", () => {
  beforeEach(() => {
    // Clear notifications and escalations for pristine test run
    localStorage.clear();
    notifStore.reset();
    afStore.reset();
  });

  // ── 1. Notification Creation & Deduplication ────────────────────────────────
  it("creates notifications and prevents duplicates via dedupKey", () => {
    const notif1 = notifStore.createNotification({
      dedupKey: "test-dedup-1",
      type: "APP_SUBMITTED",
      title: "Test Submission",
      description: "Submission description",
      appId: "APP-TEST-001",
      targetRole: "officer",
      priority: "medium",
      route: "/demo/approvalflow/applications",
    });

    expect(notif1).not.toBeNull();
    expect(notif1?.read).toBe(false);

    // Duplicate submission with same dedupKey should be rejected
    const notif2 = notifStore.createNotification({
      dedupKey: "test-dedup-1",
      type: "APP_SUBMITTED",
      title: "Test Submission Duplicate",
      description: "Should not be added",
      appId: "APP-TEST-001",
      targetRole: "officer",
      priority: "medium",
      route: "/demo/approvalflow/applications",
    });

    expect(notif2).toBeNull();
  });

  // ── 2. Role-Based Notification Delivery & Visibility ────────────────────────
  it("delivers notifications to the appropriate roles and isolates sensitive data", () => {
    notifStore.createNotification({
      dedupKey: "test-role-inst",
      type: "DEFICIENCY_RAISED",
      title: "Deficiency for Institution",
      description: "Compliance needed",
      appId: "APP-TEST-002",
      targetRole: "institution",
      priority: "high",
      route: "/demo/approvalflow/applications",
    });

    notifStore.createNotification({
      dedupKey: "test-role-off",
      type: "APP_ASSIGNED",
      title: "Officer Task Assigned",
      description: "Perform scrutiny",
      appId: "APP-TEST-002",
      targetRole: "officer",
      targetUserId: "u-scr-1",
      priority: "medium",
      route: "/demo/approvalflow/scrutiny",
    });

    notifStore.createNotification({
      dedupKey: "test-role-admin",
      type: "APP_ESCALATED",
      title: "Critical Escalation L3",
      description: "Admin intervention",
      appId: "APP-TEST-002",
      targetRole: "admin",
      priority: "critical",
      route: "/demo/approvalflow/admin",
    });

    const instNotifs = notifStore.getNotificationsForUser("institution", "u-inst-1");
    expect(instNotifs.some((n) => n.dedupKey === "test-role-inst")).toBe(true);
    expect(instNotifs.some((n) => n.dedupKey === "test-role-off")).toBe(false);
    expect(instNotifs.some((n) => n.dedupKey === "test-role-admin")).toBe(false);

    const officerNotifs = notifStore.getNotificationsForUser("aicte_office", "u-scr-1");
    expect(officerNotifs.some((n) => n.dedupKey === "test-role-off")).toBe(true);
    expect(officerNotifs.some((n) => n.dedupKey === "test-role-inst")).toBe(false);

    const adminNotifs = notifStore.getNotificationsForUser("admin", "u-reg-1");
    expect(adminNotifs.some((n) => n.dedupKey === "test-role-admin")).toBe(true);
  });

  // ── 3. Read / Unread Status Management ──────────────────────────────────────
  it("updates read status individually and collectively", () => {
    const notif = notifStore.createNotification({
      dedupKey: "test-read-status",
      type: "STAGE_FORWARDED",
      title: "Stage Forwarded",
      description: "Moved to EVC",
      appId: "APP-TEST-003",
      targetRole: "officer",
      priority: "medium",
      route: "/demo/approvalflow/applications",
    });

    expect(notifStore.getUnreadCount("aicte_office")).toBeGreaterThan(0);
    notifStore.markAsRead(notif!.id);

    const updated = notifStore.getAllNotifications().find((n) => n.id === notif!.id);
    expect(updated?.read).toBe(true);

    // Test markAllAsRead
    notifStore.createNotification({
      dedupKey: "test-read-status-2",
      type: "STAGE_FORWARDED",
      title: "Another Forward",
      description: "Moved to Decision",
      appId: "APP-TEST-003",
      targetRole: "officer",
      priority: "medium",
      route: "/demo/approvalflow/applications",
    });

    notifStore.markAllAsRead("aicte_office");
    expect(notifStore.getUnreadCount("aicte_office")).toBe(0);
  });

  // ── 4. Due Soon and Overdue SLA Alert Generation ────────────────────────────
  it("evaluates applications and generates SLA alerts idempotently", () => {
    // Inject a due-soon application and an overdue application
    const appDueSoon: Application = {
      id: "APP-DUE-SOON",
      institutionId: "inst-1",
      appType: "NEW_INSTITUTION",
      region: "North",
      currentStage: "Scrutiny",
      status: "Pending",
      submittedOn: "2026-01-01",
      slaDeadline: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10), // 2 days left
      deficiencyCount: 0,
      workflowTemplate: "scrutinyOnly",
      stageEntered: { Scrutiny: new Date().toISOString() },
    };

    const appOverdue: Application = {
      id: "APP-OVERDUE-TEST",
      institutionId: "inst-2",
      appType: "NEW_INSTITUTION",
      region: "South",
      currentStage: "Scrutiny",
      status: "Pending",
      submittedOn: "2026-01-01",
      slaDeadline: new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10), // 10 days overdue
      deficiencyCount: 0,
      workflowTemplate: "scrutinyOnly",
      stageEntered: { Scrutiny: new Date(Date.now() - 10 * 86400000).toISOString() },
    };

    afStore.applications.push(appDueSoon, appOverdue);

    // Run evaluation
    notifStore.evaluateApplicationSLA();

    const notifs = notifStore.getAllNotifications();
    const hasDueSoon = notifs.some(
      (n) => n.appId === "APP-DUE-SOON" && n.type === "SLA_APPROACHING",
    );
    const hasOverdue = notifs.some(
      (n) => n.appId === "APP-OVERDUE-TEST" && n.type === "SLA_OVERDUE",
    );

    expect(hasDueSoon).toBe(true);
    expect(hasOverdue).toBe(true);

    // Re-evaluating must be idempotent and produce no duplicate notifications
    const countBefore = notifs.length;
    notifStore.evaluateApplicationSLA();
    const countAfter = notifStore.getAllNotifications().length;
    expect(countAfter).toBe(countBefore);
  });

  // ── 5. Automatic Multi-Level Escalation Engine ───────────────────────────────
  it("triggers correct escalation levels (L1, L2, L3) and creates audit records", () => {
    const targetApp = afStore.applications[0];
    expect(targetApp).toBeDefined();
    const appId = targetApp!.id;

    const esc1 = notifStore.triggerEscalation(
      appId,
      1,
      "Test Level 1 escalation: officer reminder",
    );
    expect(esc1?.level).toBe(1);
    expect(esc1?.recipientRole).toBe("officer");
    expect(esc1?.status).toBe("active");

    const esc2 = notifStore.triggerEscalation(
      appId,
      2,
      "Test Level 2 escalation: supervisor elevated",
    );
    expect(esc2?.level).toBe(2);
    expect(esc2?.recipientRole).toBe("admin");

    const esc3 = notifStore.triggerEscalation(
      appId,
      3,
      "Test Level 3 escalation: critical admin intervention",
    );
    expect(esc3?.level).toBe(3);
    expect(esc3?.recipientRole).toBe("admin");

    // Check audit trail recorded escalations
    const auditLogs = afStore.getAuditLogsForApp(appId);
    expect(auditLogs.some((l) => l.action.includes("Escalation Level 1"))).toBe(true);
    expect(auditLogs.some((l) => l.action.includes("Escalation Level 2"))).toBe(true);
    expect(auditLogs.some((l) => l.action.includes("Escalation Level 3"))).toBe(true);

    // Acknowledge escalation
    notifStore.acknowledgeEscalation(esc1!.id, "u-scr-1");
    const updatedEsc = notifStore.getAllEscalations().find((e) => e.id === esc1!.id);
    expect(updatedEsc?.status).toBe("acknowledged");

    // Resolving escalation upon stage action
    notifStore.resolveEscalation(appId, esc1!.stage, "u-scr-1", "Stage completed");
    const resolvedEsc = notifStore.getAllEscalations().find((e) => e.id === esc1!.id);
    expect(resolvedEsc?.status).toBe("resolved");
  });

  // ── 6. Workflow Event Hooks Trigger In-App Notifications ────────────────────
  it("emits in-app notifications on deficiency, assign, and stage transition", () => {
    const targetApp = afStore.applications[0];
    expect(targetApp).toBeDefined();
    const appId = targetApp!.id;

    // 1. Assign application
    afStore.assignApplication(appId, "u-scr-2", "u-reg-1");
    let notifs = notifStore.getAllNotifications();
    expect(notifs.some((n) => n.type === "APP_ASSIGNED" && n.appId === appId)).toBe(true);

    // 2. Raise deficiency
    afStore.raiseDeficiency(appId, "Missing Fire Safety NOC", "2026-11-15", "u-inst-1", "u-scr-2");
    notifs = notifStore.getAllNotifications();
    expect(notifs.some((n) => n.type === "DEFICIENCY_RAISED" && n.appId === appId)).toBe(true);

    // 3. Upload compliance doc
    afStore.uploadDocument(appId, "FIRE_NOC", "fire_noc_renewed.pdf", "u-inst-1");
    notifs = notifStore.getAllNotifications();
    expect(notifs.some((n) => n.type === "CLARIFICATION_SUBMITTED" && n.appId === appId)).toBe(
      true,
    );
  });
});
