/**
 * ApprovalFlow AI – Core data store for the pixel-perfect-replay demo.
 * Large-scale seed: 60 institutions, 120 applications across all stages/regions.
 * Includes real-time event emitter so UI components can subscribe to changes.
 */

import { Stage, Role } from "./workflow";

// ─── Types ─────────────────────────────────────────────────────────────────────
export type AppType = "NEW_INSTITUTION" | "EOA" | "INTAKE_INCREASE";
export type AppStatus = "Pending" | "Approved" | "Rejected" | "Returned";
export type DocType =
  | "LAND_DOC"
  | "BUILDING_PLAN"
  | "OCC_CERT"
  | "FIRE_NOC"
  | "NOC_STATE"
  | "AFFIDAVIT"
  | "FDR"
  | "LEASE_RENEWAL"
  | "FACULTY_LIST";

export interface Institution {
  id: string;
  name: string;
  aicteId: string;
  state: string;
}

export interface Application {
  id: string;
  institutionId: string;
  appType: AppType;
  region: string;
  currentStage: Stage;
  status: AppStatus;
  submittedOn: string;
  slaDeadline: string;
  deficiencyCount: number;
  remarks?: string;
  evcDate?: string;
  evcCommittee?: string[];
  assignedTo?: string;
  /** Workflow template identifier (e.g., "scrutinyOnly", "scrutinyEvc") */
  workflowTemplate: string;
  /** Timestamp when each stage was entered – ISO date strings */
  stageEntered: Partial<Record<Stage, string>>;
}

export interface Document {
  id: string;
  appId: string;
  type: DocType;
  fileName: string;
  verified: boolean;
  ocrExtracted?: Record<string, string>;
  flags?: string[];
  fileSize?: string;
  uploadedAt?: string;
  uploadedBy?: string;
  fileData?: string;
}

export interface Task {
  id: string;
  appId: string;
  type: "Deficiency" | "EVCVisit" | "Compliance" | string;
  description: string;
  dueDate: string;
  status: "Open" | "InProgress" | "Resolved" | "Closed";
  remarks?: string;
}

export interface AuditLog {
  id: string;
  appId: string;
  userId: string;
  action: string;
  timestamp: string;
  fromStage?: Stage;
  toStage?: Stage;
  remarks?: string;
}

export interface User {
  id: string;
  name: string;
  role: Role;
}

// ─── Mini event emitter for real-time UI updates ─────────────────────────────
type Listener = () => void;
class EventBus {
  private listeners: Listener[] = [];
  subscribe(fn: Listener) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }
  emit() {
    this.listeners.forEach((l) => l());
  }
}
export const storeEvents = new EventBus();

// ─── Seed helpers ─────────────────────────────────────────────────────────────
const REGIONS = ["North", "South", "East", "West", "Central", "North-West", "Eastern"] as const;
const STATES = [
  "Karnataka",
  "Maharashtra",
  "Tamil Nadu",
  "Telangana",
  "Andhra Pradesh",
  "Gujarat",
  "Rajasthan",
  "Madhya Pradesh",
  "Uttar Pradesh",
  "West Bengal",
  "Punjab",
  "Haryana",
  "Bihar",
  "Odisha",
  "Kerala",
  "Assam",
  "Jharkhand",
];
const STAGES: Stage[] = [
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
const APP_TYPES: AppType[] = ["NEW_INSTITUTION", "EOA", "INTAKE_INCREASE"];
// Configurable workflow templates – map to ordered stage sequences (demo values)
const WORKFLOW_TEMPLATES: Record<string, Stage[]> = {
  scrutinyOnly: ["Scrutiny", "Recommendation", "Decision", "Approved"],
  scrutinyEvc: ["Scrutiny", "EVC", "Recommendation", "Decision", "Approved"],
  evcOnly: ["EVC", "Recommendation", "Decision", "Approved"],
  evcSac: ["EVC", "SAC_SHC", "Decision", "Approved"],
};
// Helper list of template keys for random assignment during seeding
const workflowTemplates = Object.keys(WORKFLOW_TEMPLATES);

const INST_PREFIXES = [
  "Sri",
  "Shri",
  "Bharat",
  "National",
  "Indian",
  "Modern",
  "Global",
  "Apex",
  "Premier",
  "Royal",
  "Pioneer",
  "Central",
  "Northern",
  "Southern",
  "Eastern",
  "Western",
  "New Age",
  "Sunrise",
  "Innovative",
  "Advanced",
];
const INST_SUFFIXES = [
  "Institute of Technology",
  "College of Engineering",
  "Polytechnic",
  "College of Sciences",
  "Technical University",
  "Academy of Sciences",
  "Institute of Management",
  "Engineering College",
  "College of Applied Sciences",
  "Technical Institute",
  "Institute of Engineering & Technology",
  "College of Computer Sciences",
  "Management Institute",
];

function makeName(i: number) {
  const pre = INST_PREFIXES[i % INST_PREFIXES.length];
  const suf = INST_SUFFIXES[i % INST_SUFFIXES.length];
  return `${pre} ${suf}`;
}

function isoDate(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split("T")[0] ?? d.toISOString();
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T; // assert non‑undefined
}

// ─── In-memory Store (localStorage persisted) ─────────────────────────────────
class Store {
  institutions: Institution[] = [];
  applications: Application[] = [];
  documents: Document[] = [];
  tasks: Task[] = [];
  auditLogs: AuditLog[] = [];
  users: User[] = [];

  constructor() {
    this.load();
    if (this.institutions.length < 10) {
      // Clear and re-seed to ensure large dataset
      this.reset();
    }
  }

  reset() {
    this.institutions = [];
    this.applications = [];
    this.documents = [];
    this.tasks = [];
    this.auditLogs = [];
    this.users = [];
    this.seed();
  }

  private persist() {
    try {
      localStorage.setItem(
        "approvalFlowStore_v3",
        JSON.stringify({
          institutions: this.institutions,
          applications: this.applications,
          documents: this.documents,
          tasks: this.tasks,
          auditLogs: this.auditLogs,
          users: this.users,
        }),
      );
    } catch {
      /* ignore */
    }
    storeEvents.emit();
  }

  private load() {
    try {
      const raw = localStorage.getItem("approvalFlowStore_v3");
      if (raw) {
        const parsed = JSON.parse(raw);
        Object.assign(this, parsed);
        // Repair / backfill legacy applications in user's localStorage
        if (Array.isArray(this.applications)) {
          this.applications.forEach((app, i) => {
            if (!app.workflowTemplate) {
              app.workflowTemplate =
                workflowTemplates[i % workflowTemplates.length] || "scrutinyEvc";
            }
            if (!app.stageEntered || typeof app.stageEntered !== "object") {
              app.stageEntered = {
                [app.currentStage]: app.submittedOn || new Date().toISOString(),
              };
            }
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  private seed() {
    // Users
    this.users = [
      { id: "u-reg-1", name: "Ravi Kumar (Regional Officer)", role: "REGIONAL_OFFICER" },
      { id: "u-reg-2", name: "Priya Mehta (Regional Officer)", role: "REGIONAL_OFFICER" },
      { id: "u-scr-1", name: "Anil Sharma (Scrutiny Officer)", role: "SCRUTINY_OFFICER" },
      { id: "u-scr-2", name: "Sunita Patel (Scrutiny Officer)", role: "SCRUTINY_OFFICER" },
      { id: "u-inst-1", name: "Institution Liaison A", role: "INSTITUTION_LIAISON" },
      { id: "u-inst-2", name: "Institution Liaison B", role: "INSTITUTION_LIAISON" },
      { id: "u-comm-1", name: "Dr. Mohan (Committee Member)", role: "COMMITTEE_MEMBER" },
      { id: "u-comm-2", name: "Dr. Nair (Committee Member)", role: "COMMITTEE_MEMBER" },
    ];

    // 60 institutions
    for (let i = 0; i < 60; i++) {
      const state = STATES[i % STATES.length] as string; // ensure string
      this.institutions.push({
        id: `inst-${i + 1}`,
        name: makeName(i),
        aicteId: `AICTE-2024-${String(i + 1).padStart(4, "0")}`,
        state,
      });
    }

    // 120 applications
    const appTypes: AppType[] = ["NEW_INSTITUTION", "EOA", "INTAKE_INCREASE"];
    // Template list already defined above as workflowTemplates
    let appIndex = 0;
    for (let i = 0; i < 120; i++) {
      const instId = `inst-${(i % 60) + 1}`;
      const region = REGIONS[i % REGIONS.length] as string; // ensure string
      const stage = STAGES[i % STAGES.length];
      const appType = appTypes[i % appTypes.length] as AppType; // ensure AppType
      const submittedOffset = -(Math.floor(Math.random() * 90) + 5);
      const slaOffset = submittedOffset + (Math.floor(Math.random() * 60) - 20);

      const chosenTemplate = workflowTemplates[i % workflowTemplates.length] as string; // ensure string
      const templateStages = getTemplateStages(chosenTemplate);
      const initialStage = templateStages[0] ?? "Submitted";
      const appRemark: string | undefined =
        i % 5 === 0 ? "Pending verification of land documents." : undefined;
      const app: Application = {
        id: `APP-2027-${String(i + 1).padStart(4, "0")}`,
        institutionId: instId,
        appType,
        region,
        currentStage: initialStage,
        status:
          initialStage === "Approved"
            ? "Approved"
            : initialStage === "Rejected"
              ? "Rejected"
              : "Pending",
        submittedOn: isoDate(submittedOffset),
        slaDeadline: isoDate(slaOffset),
        deficiencyCount:
          initialStage === "Deficiency" || initialStage === "ReScrutiny"
            ? Math.floor(Math.random() * 3) + 1
            : 0,
        assignedTo: i % 2 === 0 ? "u-scr-1" : "u-scr-2",
        workflowTemplate: chosenTemplate,
        stageEntered: { [initialStage]: new Date().toISOString() },
        ...(appRemark ? { remarks: appRemark } : {}),
      };
      this.applications.push(app);
      appIndex++;

      // Add some documents per app
      const docTypes: DocType[] = [
        "LAND_DOC",
        "BUILDING_PLAN",
        "OCC_CERT",
        "FIRE_NOC",
        "NOC_STATE",
      ];
      const numDocs = Math.floor(Math.random() * 3) + 1;
      for (let d = 0; d < numDocs; d++) {
        const docFlags =
          d === 1 && i % 4 === 0 ? ["OCR: Expiry date close to session start"] : undefined;
        const docObj: Document = {
          id: `doc-${i}-${d}`,
          appId: app.id,
          type: docTypes[d % docTypes.length] as DocType,
          fileName: `${(docTypes[d % docTypes.length] as string).toLowerCase()}_${app.id}.pdf`,
          verified: d === 0,
          ...(docFlags ? { flags: docFlags } : {}),
        };
        this.documents.push(docObj);
      }

      // Add tasks for deficiency/compliance stages
      if (stage === "Deficiency" || stage === "ReScrutiny") {
        this.tasks.push({
          id: `def-${i}`,
          appId: app.id,
          type: "Deficiency",
          description: "Missing fire safety NOC or expired document.",
          dueDate: isoDate(Math.floor(Math.random() * 14) - 7) as string,
          status: i % 3 === 0 ? "Resolved" : "Open",
        });
      }
      if (stage === "EVC") {
        this.tasks.push({
          id: `evc-${i}`,
          appId: app.id,
          type: "EVCVisit",
          description: "EVC committee site visit required.",
          dueDate: isoDate(Math.floor(Math.random() * 20) + 5) as string,
          status: "Open",
        });
      }

      // Audit log entry
      const seedRemark: string | undefined =
        i % 5 === 0 ? "Pending verification of land documents." : undefined;
      const auditEntry: AuditLog = {
        id: `log-${i}`,
        appId: app.id,
        userId: "u-reg-1",
        action: stage === "Submitted" ? "Application submitted" : `Moved to ${stage}`,
        timestamp: new Date(Date.now() + submittedOffset * 86400000).toISOString(),
        ...(stage ? { toStage: stage as Stage } : {}),
        ...(seedRemark ? { remarks: seedRemark } : {}),
      };
      this.auditLogs.push(auditEntry);
    }

    this.persist();
  }

  private onStageTransitionHook?: (appId: string, from: Stage, to: Stage, remarks?: string) => void;
  private onDeficiencyHook?: (appId: string, desc: string, due: string) => void;
  private onAssignHook?: (appId: string, toUser: string) => void;
  private onEVCHook?: (appId: string, date: string, comm: string[]) => void;
  private onDocUploadHook?: (appId: string, type: string) => void;

  setHooks(hooks: {
    onStageTransition?: (appId: string, from: Stage, to: Stage, remarks?: string) => void;
    onDeficiency?: (appId: string, desc: string, due: string) => void;
    onAssign?: (appId: string, toUser: string) => void;
    onEVC?: (appId: string, date: string, comm: string[]) => void;
    onDocUpload?: (appId: string, type: string) => void;
  }) {
    if (hooks.onStageTransition) this.onStageTransitionHook = hooks.onStageTransition;
    if (hooks.onDeficiency) this.onDeficiencyHook = hooks.onDeficiency;
    if (hooks.onAssign) this.onAssignHook = hooks.onAssign;
    if (hooks.onEVC) this.onEVCHook = hooks.onEVC;
    if (hooks.onDocUpload) this.onDocUploadHook = hooks.onDocUpload;
  }

  // ── Retrieval ────────────────────────────────────────────────────────────────
  getInstitution(id: string) {
    return this.institutions.find((i) => i.id === id);
  }
  getUser(id: string) {
    return this.users.find((u) => u.id === id);
  }
  getApplication(id: string) {
    return this.applications.find((a) => a.id === id);
  }
  getDocumentsForApp(appId: string) {
    return this.documents.filter((d) => d.appId === appId);
  }
  getTasksForApp(appId: string) {
    return this.tasks.filter((t) => t.appId === appId);
  }
  getAuditLogsForApp(appId: string) {
    return this.auditLogs
      .filter((l) => l.appId === appId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  // Summary stats for dashboard
  getStats() {
    const apps = this.applications;
    return {
      total: apps.length,
      pending: apps.filter((a) => a.status === "Pending").length,
      approved: apps.filter((a) => a.status === "Approved").length,
      rejected: apps.filter((a) => a.status === "Rejected").length,
      overdue: apps.filter((a) => isOverdue(a)).length,
      byStage: STAGES.reduce(
        (acc, s) => {
          acc[s] = apps.filter((a) => a.currentStage === s).length;
          return acc;
        },
        {} as Record<Stage, number>,
      ),
      byRegion: REGIONS.reduce(
        (acc, r) => {
          acc[r] = apps.filter((a) => a.region === r).length;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }

  // ── Mutations ────────────────────────────────────────────────────────────────
  /**
   * Transition to the next allowed stage according to the application's workflow template.
   * Throws if the transition is not permitted, or if role permissions are insufficient.
   */
  transitionStage(appId: string, toStage: Stage, userId: string, remarks?: string) {
    const app = this.getApplication(appId);
    if (!app) throw new Error("Application not found");
    const from = app.currentStage;
    if (!app.workflowTemplate) {
      app.workflowTemplate = "scrutinyEvc";
    }
    // Verify template ordering & transition rules
    const allowed = getAllowedNextStages(app);
    if (!allowed.includes(toStage)) {
      throw new Error(
        `Invalid stage transition from ${from} to ${toStage} for template ${app.workflowTemplate}`,
      );
    }
    // Verify role permissions (existing PERMISSIONS are enforced elsewhere in UI)
    app.currentStage = toStage;
    // Record entry timestamp for the new stage
    app.stageEntered = { ...(app.stageEntered || {}), [toStage]: new Date().toISOString() };
    // Update status if final stage reached
    if (toStage === "Approved") app.status = "Approved";
    else if (toStage === "Rejected") app.status = "Rejected";
    const auditEntry: AuditLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      appId,
      userId,
      action: `Stage transition ${from} → ${toStage}`,
      timestamp: new Date().toISOString(),
      fromStage: from,
      toStage,
      ...(remarks ? { remarks } : {}),
    };
    this.auditLogs.push(auditEntry);
    this.persist();
    if (this.onStageTransitionHook) {
      try {
        this.onStageTransitionHook(appId, from, toStage, remarks);
      } catch {
        /* ignore */
      }
    }
  }

  raiseDeficiency(
    appId: string,
    description: string,
    due: string,
    assignedTo: string,
    raisedBy: string,
  ) {
    const app = this.getApplication(appId);
    if (!app) throw new Error("App not found");
    this.tasks.push({
      id: `def-${Date.now()}`,
      appId,
      type: "Deficiency",
      description,
      dueDate: due,
      status: "Open",
    });
    app.deficiencyCount += 1;
    this.auditLogs.push({
      id: `log-${Date.now()}`,
      appId,
      userId: raisedBy,
      action: "Raised deficiency",
      timestamp: new Date().toISOString(),
      remarks: description,
    });
    this.persist();
    if (this.onDeficiencyHook) {
      try {
        this.onDeficiencyHook(appId, description, due);
      } catch {
        /* ignore */
      }
    }
  }

  uploadDocument(
    appId: string,
    type: DocType,
    fileName: string,
    userId: string,
    ocr?: Record<string, string>,
    fileSize?: string,
    fileData?: string,
  ) {
    const docEntry: Document = {
      id: `doc-${Date.now()}`,
      appId,
      type,
      fileName,
      verified: false,
      fileSize: fileSize || "1.4 MB",
      uploadedAt: new Date().toISOString(),
      uploadedBy: userId,
      ...(ocr ? { ocrExtracted: ocr } : {}),
      ...(fileData ? { fileData } : {}),
    };
    this.documents.push(docEntry);
    this.auditLogs.push({
      id: `log-${Date.now()}`,
      appId,
      userId,
      action: `Uploaded ${type.replace(/_/g, " ")} (${fileName})`,
      timestamp: new Date().toISOString(),
    });
    this.persist();
    if (this.onDocUploadHook) {
      try {
        this.onDocUploadHook(appId, type);
      } catch {
        /* ignore */
      }
    }
  }

  verifyDocument(docId: string, userId: string) {
    const doc = this.documents.find((d) => d.id === docId);
    if (!doc) throw new Error("Document not found");
    doc.verified = true;
    this.auditLogs.push({
      id: `log-${Date.now()}`,
      appId: doc.appId,
      userId,
      action: `Verified document ${doc.type}`,
      timestamp: new Date().toISOString(),
    });
    this.persist();
  }

  resolveTask(taskId: string, userId: string, remarks?: string) {
    const task = this.tasks.find((t) => t.id === taskId);
    if (!task) throw new Error("Task not found");
    task.status = "Resolved";
    const resolveLog: AuditLog = {
      id: `log-${Date.now()}`,
      appId: task.appId,
      userId,
      action: `Resolved task ${task.type}`,
      timestamp: new Date().toISOString(),
      ...(remarks ? { remarks } : {}),
    };
    this.auditLogs.push(resolveLog);
    this.persist();
  }

  addAuditComment(appId: string, userId: string, comment: string) {
    const commentEntry: AuditLog = {
      id: `log-${Date.now()}`,
      appId,
      userId,
      action: "Comment",
      timestamp: new Date().toISOString(),
      ...(comment ? { remarks: comment } : {}),
    };
    this.auditLogs.push(commentEntry);
    this.persist();
  }

  assignApplication(appId: string, toUserId: string, byUserId: string) {
    const app = this.getApplication(appId);
    if (!app) throw new Error("App not found");
    app.assignedTo = toUserId;
    this.auditLogs.push({
      id: `log-${Date.now()}`,
      appId,
      userId: byUserId,
      action: `Assigned to ${toUserId}`,
      timestamp: new Date().toISOString(),
    });
    this.persist();
    if (this.onAssignHook) {
      try {
        this.onAssignHook(appId, toUserId);
      } catch {
        /* ignore */
      }
    }
  }

  scheduleEVC(appId: string, date: string, committee: string[], userId: string) {
    const app = this.getApplication(appId);
    if (!app) throw new Error("App not found");
    app.evcDate = date;
    app.evcCommittee = committee;
    this.auditLogs.push({
      id: `log-${Date.now()}`,
      appId,
      userId,
      action: `EVC visit scheduled on ${date}`,
      timestamp: new Date().toISOString(),
      remarks: `Committee: ${committee.join(", ")}`,
    });
    this.persist();
    if (this.onEVCHook) {
      try {
        this.onEVCHook(appId, date, committee);
      } catch {
        /* ignore */
      }
    }
  }
}

export const afStore = new Store();

// ── Helper utilities ─────────────────────────────────────────────────────────
export const daysUntil = (dateStr: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
    ? new Date(
        Number(dateStr.slice(0, 4)),
        Number(dateStr.slice(5, 7)) - 1,
        Number(dateStr.slice(8, 10)),
      )
    : new Date(dateStr);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
};
export const isOverdue = (app: Application) => daysUntil(app.slaDeadline) < 0;

/** SLA status calculation for a given application stage */
export type SlaStatus = "on_track" | "due_soon" | "overdue" | "completed";
export const computeSlaStatus = (
  app: Application,
  stage: Stage,
): { status: SlaStatus; daysRemaining: number } => {
  if (app.status === "Approved" || app.status === "Rejected")
    return { status: "completed", daysRemaining: 0 };
  const entered = app.stageEntered?.[stage];
  if (!entered) return { status: "on_track", daysRemaining: 0 };
  const deadline = new Date(app.slaDeadline);
  const now = new Date();
  const diffDays = Math.ceil((deadline.getTime() - now.getTime()) / 86400000);
  if (diffDays < 0) return { status: "overdue", daysRemaining: diffDays };
  if (diffDays <= 5) return { status: "due_soon", daysRemaining: diffDays };
  return { status: "on_track", daysRemaining: diffDays };
};

/**
 * Number of days the application has been at its CURRENT stage.
 * Calculated from stageEntered timestamp. Returns null if no timestamp exists.
 */
export const stageAgeingDays = (app: Application): number | null => {
  const entered = app.stageEntered?.[app.currentStage];
  if (!entered) return null;
  const enteredDate = new Date(entered);
  const now = new Date();
  return Math.max(0, Math.floor((now.getTime() - enteredDate.getTime()) / 86400000));
};

/**
 * Applications due soon (SLA deadline within 5 days, not yet completed).
 * NOTE: Thresholds are illustrative prototype settings, not official AICTE processing limits.
 */
export const getDueSoon = (apps: Application[]): Application[] =>
  apps.filter((a) => {
    if (a.status === "Approved" || a.status === "Rejected") return false;
    const d = daysUntil(a.slaDeadline);
    return d >= 0 && d <= 5;
  });

/**
 * Per-stage pendency stats: count of pending apps, overdue apps, avg ageing in days.
 * Only includes stages with at least one application.
 */
export interface StagePendencyStats {
  stage: Stage;
  pending: number;
  overdue: number;
  avgAgeingDays: number | null; // null when no stageEntered timestamps available
}

export const getStagesPendencyStats = (apps: Application[]): StagePendencyStats[] => {
  const activeStages: Stage[] = [
    "Submitted",
    "Scrutiny",
    "Deficiency",
    "ReScrutiny",
    "EVC",
    "Recommendation",
    "SAC_SHC",
    "Decision",
  ];
  return activeStages
    .map((stage) => {
      const stageApps = apps.filter((a) => a.currentStage === stage && a.status === "Pending");
      const ageings = stageApps
        .map((a) => stageAgeingDays(a))
        .filter((d): d is number => d !== null);
      return {
        stage,
        pending: stageApps.length,
        overdue: stageApps.filter(isOverdue).length,
        avgAgeingDays:
          ageings.length > 0
            ? Math.round(ageings.reduce((s, v) => s + v, 0) / ageings.length)
            : null,
      };
    })
    .filter((s) => s.pending > 0);
};

/** Return the ordered stage list for a given workflow template */
export function getTemplateStages(template?: string): Stage[] {
  if (template && WORKFLOW_TEMPLATES[template]) {
    return WORKFLOW_TEMPLATES[template]!;
  }
  return WORKFLOW_TEMPLATES["scrutinyEvc"]!;
}

/** Compute allowed next stages for an application based on its workflow */
export function getAllowedNextStages(app: Application): Stage[] {
  const current = app.currentStage;
  const directAllowed = STAGE_TRANSITIONS[current] ?? [];
  const template = app.workflowTemplate || "scrutinyEvc";

  // Template-specific branching rules
  if (template === "scrutinyOnly") {
    // Under scrutinyOnly, EVC visit is skipped in favor of direct Recommendation or Deficiency
    return directAllowed.filter((s) => s !== "EVC");
  }

  if (template === "evcOnly" && current === "Submitted") {
    return ["EVC"];
  }

  return directAllowed;
}

export const getDemoUserId = (role: string | null) => {
  const map: Record<string, string> = {
    institution: "u-inst-1",
    aicte_office: "u-scr-1",
    admin: "u-reg-1",
  };
  return (role && map[role]) ?? "u-reg-1";
};

// ── UI constants ─────────────────────────────────────────────────────────────
export const STAGE_LABELS: Record<Stage, string> = {
  Submitted: "Submitted",
  Scrutiny: "Scrutiny",
  Deficiency: "Deficiency",
  ReScrutiny: "Re-scrutiny",
  EVC: "EVC",
  Recommendation: "Recommendation",
  SAC_SHC: "SAC / SHC",
  Decision: "Decision",
  Approved: "Approved",
  Rejected: "Rejected",
};

export const STAGE_COLORS: Record<Stage, string> = {
  Submitted: "bg-slate-100 text-slate-700",
  Scrutiny: "bg-blue-100 text-blue-700",
  Deficiency: "bg-amber-100 text-amber-700",
  ReScrutiny: "bg-purple-100 text-purple-700",
  EVC: "bg-violet-100 text-violet-700",
  Recommendation: "bg-indigo-100 text-indigo-700",
  SAC_SHC: "bg-teal-100 text-teal-700",
  Decision: "bg-green-100 text-green-700",
  Approved: "bg-green-200 text-green-900",
  Rejected: "bg-red-200 text-red-900",
};

export const APP_TYPE_LABELS: Record<AppType, string> = {
  NEW_INSTITUTION: "New Institution",
  EOA: "Extension of Approval",
  INTAKE_INCREASE: "Intake Increase",
};

export const STAGE_TRANSITIONS: Record<Stage, Stage[]> = {
  Submitted: ["Scrutiny"],
  Scrutiny: ["Deficiency", "EVC", "Recommendation"],
  Deficiency: ["ReScrutiny"],
  ReScrutiny: ["EVC", "Recommendation"],
  EVC: ["Recommendation", "SAC_SHC"],
  Recommendation: ["Decision"],
  SAC_SHC: ["Decision"],
  Decision: ["Approved", "Rejected"],
  Approved: [],
  Rejected: [],
};

export type { Stage };
