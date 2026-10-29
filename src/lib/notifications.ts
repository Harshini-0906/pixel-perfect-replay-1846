/**
 * ApprovalFlow AI — Notifications & Escalations Engine
 * Sprint 3 Module: Event-driven in-app notifications, intelligent SLA alerts,
 * role-based delivery, and automated multi-level escalations.
 *
 * NOTE: As this is a client-side prototype, notifications are managed in browser
 * memory / localStorage as "in-app notifications". No external email, SMS, or push
 * gateways are simulated or claimed to be connected.
 */

import {
  afStore,
  storeEvents,
  isOverdue,
  daysUntil,
  type Application,
  type Stage,
} from "./approval-flow";

// ── Types & Interfaces ────────────────────────────────────────────────────────

export type NotificationType =
  | "APP_SUBMITTED"
  | "APP_ASSIGNED"
  | "STAGE_FORWARDED"
  | "SCRUTINY_STARTED"
  | "SCRUTINY_COMPLETED"
  | "DEFICIENCY_RAISED"
  | "CLARIFICATION_SUBMITTED"
  | "EVC_SCHEDULED"
  | "INSPECTION_COMPLETED"
  | "COMPLIANCE_REQUIRED"
  | "APP_APPROVED"
  | "APP_REJECTED"
  | "SLA_APPROACHING"
  | "SLA_OVERDUE"
  | "APP_ESCALATED";

export type NotificationPriority = "low" | "medium" | "high" | "critical";

export type RoleCategory = "institution" | "officer" | "admin";

export interface AppNotification {
  id: string;
  dedupKey: string;
  type: NotificationType;
  title: string;
  description: string;
  appId: string;
  targetRole: RoleCategory;
  targetUserId?: string | undefined;
  timestamp: string;
  read: boolean;
  priority: NotificationPriority;
  route: string;
  metadata?:
    | {
        stage?: Stage | undefined;
        escalationLevel?: number | undefined;
        daysOverdue?: number | undefined;
        daysRemaining?: number | undefined;
      }
    | undefined;
}

export interface EscalationRecord {
  id: string;
  appId: string;
  level: 1 | 2 | 3;
  stage: Stage;
  reason: string;
  timestamp: string;
  assignedOfficerId?: string | undefined;
  recipientRole: RoleCategory;
  status: "active" | "acknowledged" | "resolved";
  resolvedAt?: string | undefined;
}

// ── Default Prototype Thresholds (Configurable) ──────────────────────────────
export const NOTIFICATION_CONFIG = {
  dueSoonWindowDays: 5,
  escalation: {
    level1DaysOverdue: 1, // Officer alert
    level2DaysOverdue: 7, // Supervisor alert
    level3DaysOverdue: 14, // Administrator critical alert
  },
};

// ── Notification Store Class ──────────────────────────────────────────────────
class NotificationStore {
  private notifications: AppNotification[] = [];
  private escalations: EscalationRecord[] = [];
  private initialized = false;

  constructor() {
    this.load();
  }

  private persist() {
    try {
      localStorage.setItem(
        "approvalFlowNotifications_v1",
        JSON.stringify({
          notifications: this.notifications,
          escalations: this.escalations,
        }),
      );
    } catch {
      /* ignore storage errors */
    }
    storeEvents.emit();
  }

  private load() {
    try {
      const raw = localStorage.getItem("approvalFlowNotifications_v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.notifications)) this.notifications = parsed.notifications;
        if (Array.isArray(parsed.escalations)) this.escalations = parsed.escalations;
        this.initialized = true;
      }
    } catch {
      /* ignore load errors */
    }
  }

  reset() {
    this.notifications = [];
    this.escalations = [];
    try {
      localStorage.removeItem("approvalFlowNotifications_v1");
    } catch {
      /* ignore */
    }
  }

  // ── Public Accessors ────────────────────────────────────────────────────────

  getAllNotifications(): AppNotification[] {
    return [...this.notifications].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  getAllEscalations(): EscalationRecord[] {
    return [...this.escalations].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  getNotificationsForUser(userRole: string | null, userId?: string | null): AppNotification[] {
    if (!userRole) return [];
    const roleCat: RoleCategory =
      userRole === "institution" ? "institution" : userRole === "admin" ? "admin" : "officer";

    return this.notifications
      .filter((n) => {
        // Must match role
        if (n.targetRole !== roleCat) {
          // Admins can see officer alerts if critical, but standard rule is matching role
          if (roleCat !== "admin" || n.priority !== "critical") {
            return false;
          }
        }
        // If targeted to a specific user, match unless current viewer is admin
        if (n.targetUserId && userId && n.targetUserId !== userId && roleCat !== "admin") {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  getUnreadCount(userRole: string | null, userId?: string | null): number {
    return this.getNotificationsForUser(userRole, userId).filter((n) => !n.read).length;
  }

  markAsRead(id: string): void {
    const notif = this.notifications.find((n) => n.id === id);
    if (notif && !notif.read) {
      notif.read = true;
      this.persist();
    }
  }

  markAllAsRead(userRole: string | null, userId?: string | null): void {
    const userNotifs = this.getNotificationsForUser(userRole, userId);
    let changed = false;
    userNotifs.forEach((n) => {
      if (!n.read) {
        n.read = true;
        changed = true;
      }
    });
    if (changed) this.persist();
  }

  // ── Notification Creator with Idempotent Deduplication ───────────────────────

  createNotification(
    params: Omit<AppNotification, "id" | "read" | "timestamp"> & { timestamp?: string | undefined },
  ): AppNotification | null {
    // Check dedupKey
    const exists = this.notifications.some((n) => n.dedupKey === params.dedupKey);
    if (exists) return null;

    const notif: AppNotification = {
      ...params,
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      read: false,
      timestamp: params.timestamp || new Date().toISOString(),
    };

    this.notifications.unshift(notif);
    this.persist();
    return notif;
  }

  // ── Escalation Management ───────────────────────────────────────────────────

  triggerEscalation(appId: string, level: 1 | 2 | 3, reason: string): EscalationRecord | null {
    const app = afStore.getApplication(appId);
    if (!app) return null;

    // Check if an escalation of this level already exists for current stage and is active
    const existing = this.escalations.find(
      (e) =>
        e.appId === appId &&
        e.stage === app.currentStage &&
        e.level === level &&
        e.status === "active",
    );
    if (existing) return existing;

    const recipientRole: RoleCategory = level === 1 ? "officer" : "admin";
    const record: EscalationRecord = {
      id: `esc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      appId,
      level,
      stage: app.currentStage,
      reason,
      timestamp: new Date().toISOString(),
      assignedOfficerId: app.assignedTo,
      recipientRole,
      status: "active",
    };

    this.escalations.unshift(record);

    // Create corresponding notification
    const priority: NotificationPriority =
      level === 3 ? "critical" : level === 2 ? "high" : "medium";
    const dedupKey = `esc-${appId}-${app.currentStage}-lvl${level}`;
    const levelTitle =
      level === 3
        ? `[CRITICAL ESCALATION L3] ${app.id} Urgent Admin Intervention`
        : level === 2
          ? `[SUPERVISOR ESCALATION L2] ${app.id} Exceeded Stage SLA`
          : `[STAGE ESCALATION L1] ${app.id} Officer Action Overdue`;

    this.createNotification({
      dedupKey,
      type: "APP_ESCALATED",
      title: levelTitle,
      description: `${reason} (Stage: ${app.currentStage}, Region: ${app.region})`,
      appId,
      targetRole: recipientRole,
      targetUserId: level === 1 ? app.assignedTo : undefined,
      priority,
      route: "/demo/approvalflow/applications",
      metadata: {
        stage: app.currentStage,
        escalationLevel: level,
      },
    });

    // Record in store audit trail
    afStore.auditLogs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      appId,
      userId: "system-escalation-engine",
      action: `Escalation Level ${level} Triggered`,
      timestamp: new Date().toISOString(),
      remarks: reason,
      fromStage: app.currentStage,
      toStage: app.currentStage,
    });
    // Persist store to keep audit logs and notify listeners
    try {
      localStorage.setItem(
        "approvalFlowStore_v3",
        JSON.stringify({
          institutions: afStore.institutions,
          applications: afStore.applications,
          documents: afStore.documents,
          tasks: afStore.tasks,
          auditLogs: afStore.auditLogs,
          users: afStore.users,
        }),
      );
    } catch {
      /* ignore */
    }

    this.persist();
    return record;
  }

  acknowledgeEscalation(escId: string, userId: string): void {
    const esc = this.escalations.find((e) => e.id === escId);
    if (esc && esc.status === "active") {
      esc.status = "acknowledged";
      afStore.auditLogs.unshift({
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        appId: esc.appId,
        userId,
        action: `Escalation Level ${esc.level} Acknowledged`,
        timestamp: new Date().toISOString(),
        remarks: `Acknowledged by ${userId}`,
      });
      this.persist();
    }
  }

  resolveEscalation(appId: string, stage: Stage, userId: string, remarks?: string): void {
    let modified = false;
    this.escalations.forEach((e) => {
      if (e.appId === appId && e.stage === stage && e.status !== "resolved") {
        e.status = "resolved";
        e.resolvedAt = new Date().toISOString();
        modified = true;
      }
    });

    if (modified) {
      afStore.auditLogs.unshift({
        id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        appId,
        userId,
        action: `Escalation Resolved for ${stage}`,
        timestamp: new Date().toISOString(),
        remarks: remarks || `Resolved upon action by ${userId}`,
      });
      this.persist();
    }
  }

  // ── Evaluation & Reconcile Engine ───────────────────────────────────────────
  /**
   * Idempotently scans all applications and creates SLA alerts & escalations.
   * Runs upon action or dashboard render without producing duplicates.
   */
  evaluateApplicationSLA(): void {
    const apps = afStore.applications;

    for (const app of apps) {
      // Completed applications do not generate alerts or escalations
      if (app.status === "Approved" || app.status === "Rejected") {
        // Resolve any open escalations for this app
        this.escalations.forEach((e) => {
          if (e.appId === app.id && e.status !== "resolved") {
            e.status = "resolved";
            e.resolvedAt = new Date().toISOString();
          }
        });
        continue;
      }

      const daysLeft = daysUntil(app.slaDeadline);
      const stage = app.currentStage;

      // 1. Due Soon alert (0 <= daysLeft <= 5)
      if (daysLeft >= 0 && daysLeft <= NOTIFICATION_CONFIG.dueSoonWindowDays) {
        const dedupKey = `sla-due-${app.id}-${stage}`;
        this.createNotification({
          dedupKey,
          type: "SLA_APPROACHING",
          title: `SLA Approaching: ${app.id} (${stage})`,
          description: `Application deadline is approaching in ${daysLeft} day(s). Stage action required.`,
          appId: app.id,
          targetRole: "officer",
          targetUserId: app.assignedTo,
          priority: daysLeft <= 2 ? "high" : "medium",
          route: "/demo/approvalflow/applications",
          metadata: { stage, daysRemaining: daysLeft },
        });
      }

      // 2. Overdue alert & Escalation levels
      if (daysLeft < 0) {
        const daysOD = Math.abs(daysLeft);

        // Overdue notification
        const dedupKey = `sla-overdue-${app.id}-${stage}`;
        this.createNotification({
          dedupKey,
          type: "SLA_OVERDUE",
          title: `SLA Overdue: ${app.id} (${stage})`,
          description: `Application has exceeded its SLA deadline by ${daysOD} day(s). Immediate action required.`,
          appId: app.id,
          targetRole: "officer",
          targetUserId: app.assignedTo,
          priority: "high",
          route: "/demo/approvalflow/applications",
          metadata: { stage, daysOverdue: daysOD },
        });

        // Level 1: Officer reminder (>= 1 day overdue)
        if (daysOD >= NOTIFICATION_CONFIG.escalation.level1DaysOverdue) {
          this.triggerEscalation(
            app.id,
            1,
            `Application is ${daysOD} day(s) overdue at stage ${stage}. Officer reminder issued.`,
          );
        }

        // Level 2: Supervisor / Admin alert (>= 7 days overdue)
        if (daysOD >= NOTIFICATION_CONFIG.escalation.level2DaysOverdue) {
          this.triggerEscalation(
            app.id,
            2,
            `Application is ${daysOD} day(s) overdue at stage ${stage}. Elevated to Regional Supervisor.`,
          );
        }

        // Level 3: AICTE Administrator Critical Escalation (>= 14 days overdue)
        if (daysOD >= NOTIFICATION_CONFIG.escalation.level3DaysOverdue) {
          this.triggerEscalation(
            app.id,
            3,
            `Critical pendency! Application is ${daysOD} day(s) overdue at stage ${stage}. Administrator intervention needed.`,
          );
        }
      }
    }
  }

  // ── Workflow Event Triggers ─────────────────────────────────────────────────

  onApplicationSubmitted(app: Application): void {
    this.createNotification({
      dedupKey: `evt-sub-${app.id}`,
      type: "APP_SUBMITTED",
      title: `New Application Submitted: ${app.id}`,
      description: `New application (${app.appType}) received for region ${app.region}. Initial stage: ${app.currentStage}.`,
      appId: app.id,
      targetRole: "officer",
      priority: "medium",
      route: "/demo/approvalflow/applications",
    });
    this.createNotification({
      dedupKey: `evt-sub-inst-${app.id}`,
      type: "APP_SUBMITTED",
      title: `Application Submission Confirmed: ${app.id}`,
      description: `Your application has been received and queued for regulatory scrutiny.`,
      appId: app.id,
      targetRole: "institution",
      priority: "medium",
      route: "/demo/approvalflow/applications",
    });
  }

  onApplicationAssigned(appId: string, toUserId: string): void {
    const app = afStore.getApplication(appId);
    this.createNotification({
      dedupKey: `evt-assign-${appId}-${toUserId}`,
      type: "APP_ASSIGNED",
      title: `Application Assigned: ${appId}`,
      description: `You have been designated as the handling officer for application ${appId} at ${app?.currentStage || "Scrutiny"}.`,
      appId,
      targetRole: "officer",
      targetUserId: toUserId,
      priority: "medium",
      route: "/demo/approvalflow/applications",
    });
  }

  onStageTransition(appId: string, fromStage: Stage, toStage: Stage, remarks?: string): void {
    const app = afStore.getApplication(appId);
    // Resolve any active escalations from the previous stage
    this.resolveEscalation(
      appId,
      fromStage,
      "system",
      `Stage transitioned from ${fromStage} to ${toStage}`,
    );

    // If final status
    if (toStage === "Approved") {
      this.createNotification({
        dedupKey: `evt-approved-${appId}`,
        type: "APP_APPROVED",
        title: `Application Approved: ${appId}`,
        description: `Approval granted (LoA/EoA issued). ${remarks ? `Remarks: ${remarks}` : ""}`,
        appId,
        targetRole: "institution",
        priority: "high",
        route: "/demo/approvalflow/applications",
      });
      this.createNotification({
        dedupKey: `evt-approved-off-${appId}`,
        type: "APP_APPROVED",
        title: `Approval Finalized: ${appId}`,
        description: `Application ${appId} has successfully completed final approval.`,
        appId,
        targetRole: "officer",
        priority: "medium",
        route: "/demo/approvalflow/applications",
      });
      return;
    }

    if (toStage === "Rejected") {
      this.createNotification({
        dedupKey: `evt-rejected-${appId}`,
        type: "APP_REJECTED",
        title: `Application Rejected: ${appId}`,
        description: `Application ${appId} has been rejected by regulatory council. ${remarks ? `Reason: ${remarks}` : ""}`,
        appId,
        targetRole: "institution",
        priority: "high",
        route: "/demo/approvalflow/applications",
      });
      return;
    }

    // Forwarded notification to officer
    this.createNotification({
      dedupKey: `evt-forward-${appId}-${toStage}`,
      type: "STAGE_FORWARDED",
      title: `Stage Forwarded: ${appId} → ${toStage}`,
      description: `Application advanced from ${fromStage} to ${toStage}. ${remarks ? `Note: ${remarks}` : ""}`,
      appId,
      targetRole: "officer",
      targetUserId: app?.assignedTo,
      priority: "medium",
      route: "/demo/approvalflow/applications",
    });

    // Notify institution on key stages
    if (toStage === "ReScrutiny" || toStage === "Recommendation" || toStage === "SAC_SHC") {
      this.createNotification({
        dedupKey: `evt-forward-inst-${appId}-${toStage}`,
        type: "STAGE_FORWARDED",
        title: `Application Status Updated: ${appId}`,
        description: `Your application has progressed to stage: ${toStage}.`,
        appId,
        targetRole: "institution",
        priority: "medium",
        route: "/demo/approvalflow/applications",
      });
    }
  }

  onDeficiencyRaised(appId: string, description: string, dueDate: string): void {
    // Institution gets compliance/deficiency alert
    this.createNotification({
      dedupKey: `evt-def-${appId}-${Date.now()}`,
      type: "DEFICIENCY_RAISED",
      title: `Regulatory Deficiency Raised: ${appId}`,
      description: `${description}. Response and compliance proof required by ${dueDate}.`,
      appId,
      targetRole: "institution",
      priority: "high",
      route: "/demo/approvalflow/applications",
    });

    // Officer record
    this.createNotification({
      dedupKey: `evt-def-off-${appId}-${Date.now()}`,
      type: "COMPLIANCE_REQUIRED",
      title: `Deficiency Issued: ${appId}`,
      description: `Deficiency task created for applicant. Due date: ${dueDate}.`,
      appId,
      targetRole: "officer",
      priority: "medium",
      route: "/demo/approvalflow/compliance",
    });
  }

  onClarificationSubmitted(appId: string, docType: string): void {
    const app = afStore.getApplication(appId);
    this.createNotification({
      dedupKey: `evt-clarif-${appId}-${Date.now()}`,
      type: "CLARIFICATION_SUBMITTED",
      title: `Clarification Submitted: ${appId}`,
      description: `Institution liaison submitted compliance documents for ${docType}.`,
      appId,
      targetRole: "officer",
      targetUserId: app?.assignedTo,
      priority: "medium",
      route: "/demo/approvalflow/compliance",
    });
  }

  onEVCScheduled(appId: string, date: string, committee: string[]): void {
    this.createNotification({
      dedupKey: `evt-evc-sched-${appId}-${date}`,
      type: "EVC_SCHEDULED",
      title: `Expert Visit Committee (EVC) Scheduled: ${appId}`,
      description: `Physical visit scheduled on ${date}. Committee Members: ${committee.join(", ")}.`,
      appId,
      targetRole: "institution",
      priority: "high",
      route: "/demo/approvalflow/evc",
    });

    this.createNotification({
      dedupKey: `evt-evc-sched-off-${appId}-${date}`,
      type: "EVC_SCHEDULED",
      title: `EVC Visit Assigned: ${appId}`,
      description: `Visit scheduled for ${date}. Committee: ${committee.join(", ")}.`,
      appId,
      targetRole: "officer",
      priority: "medium",
      route: "/demo/approvalflow/evc",
    });
  }

  onInspectionCompleted(appId: string): void {
    this.createNotification({
      dedupKey: `evt-evc-comp-${appId}`,
      type: "INSPECTION_COMPLETED",
      title: `EVC Inspection Completed: ${appId}`,
      description: `Expert Visit Committee report submitted. Ready for recommendation phase.`,
      appId,
      targetRole: "officer",
      priority: "medium",
      route: "/demo/approvalflow/evc",
    });
  }
}

export const notifStore = new NotificationStore();

// Wire store mutations to notification triggers
afStore.setHooks({
  onStageTransition: (appId, from, to, remarks) => {
    notifStore.onStageTransition(appId, from, to, remarks);
    notifStore.evaluateApplicationSLA();
  },
  onDeficiency: (appId, desc, due) => {
    notifStore.onDeficiencyRaised(appId, desc, due);
  },
  onAssign: (appId, toUser) => {
    notifStore.onApplicationAssigned(appId, toUser);
  },
  onEVC: (appId, date, comm) => {
    notifStore.onEVCScheduled(appId, date, comm);
  },
  onDocUpload: (appId, type) => {
    notifStore.onClarificationSubmitted(appId, type);
  },
});

// Run initial evaluation
try {
  notifStore.evaluateApplicationSLA();
} catch {
  /* ignore */
}
