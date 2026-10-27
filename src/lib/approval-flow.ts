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
}

export interface Document {
  id: string;
  appId: string;
  type: DocType;
  fileName: string;
  verified: boolean;
  ocrExtracted?: Record<string, string>;
  flags?: string[];
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
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  }
  emit() { this.listeners.forEach(l => l()); }
}
export const storeEvents = new EventBus();

// ─── Seed helpers ─────────────────────────────────────────────────────────────
const REGIONS = ["North", "South", "East", "West", "Central", "North-West", "Eastern"] as const;
const STATES = [
  "Karnataka", "Maharashtra", "Tamil Nadu", "Telangana", "Andhra Pradesh",
  "Gujarat", "Rajasthan", "Madhya Pradesh", "Uttar Pradesh", "West Bengal",
  "Punjab", "Haryana", "Bihar", "Odisha", "Kerala", "Assam", "Jharkhand",
];
const STAGES: Stage[] = [
  "Submitted", "Scrutiny", "Deficiency", "ReScrutiny", "EVC",
  "Recommendation", "SAC_SHC", "Decision", "Approved", "Rejected",
];
const APP_TYPES: AppType[] = ["NEW_INSTITUTION", "EOA", "INTAKE_INCREASE"];

const INST_PREFIXES = [
  "Sri", "Shri", "Bharat", "National", "Indian", "Modern", "Global",
  "Apex", "Premier", "Royal", "Pioneer", "Central", "Northern", "Southern",
  "Eastern", "Western", "New Age", "Sunrise", "Innovative", "Advanced",
];
const INST_SUFFIXES = [
  "Institute of Technology", "College of Engineering", "Polytechnic",
  "College of Sciences", "Technical University", "Academy of Sciences",
  "Institute of Management", "Engineering College", "College of Applied Sciences",
  "Technical Institute", "Institute of Engineering & Technology",
  "College of Computer Sciences", "Management Institute",
];

function makeName(i: number) {
  const pre = INST_PREFIXES[i % INST_PREFIXES.length];
  const suf = INST_SUFFIXES[i % INST_SUFFIXES.length];
  return `${pre} ${suf}`;
}

function isoDate(daysOffset: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().split("T")[0];
}

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
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
      localStorage.setItem("approvalFlowStore_v3", JSON.stringify({
        institutions: this.institutions,
        applications: this.applications,
        documents: this.documents,
        tasks: this.tasks,
        auditLogs: this.auditLogs,
        users: this.users,
      }));
    } catch { /* ignore */ }
    storeEvents.emit();
  }

  private load() {
    try {
      const raw = localStorage.getItem("approvalFlowStore_v3");
      if (raw) {
        const parsed = JSON.parse(raw);
        Object.assign(this, parsed);
      }
    } catch { /* ignore */ }
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
      const state = STATES[i % STATES.length];
      this.institutions.push({
        id: `inst-${i + 1}`,
        name: makeName(i),
        aicteId: `AICTE-2024-${String(i + 1).padStart(4, "0")}`,
        state,
      });
    }

    // 120 applications
    const appTypes: AppType[] = ["NEW_INSTITUTION", "EOA", "INTAKE_INCREASE"];
    let appIndex = 0;
    for (let i = 0; i < 120; i++) {
      const instId = `inst-${(i % 60) + 1}`;
      const region = REGIONS[i % REGIONS.length];
      const stage = STAGES[i % STAGES.length];
      const appType = appTypes[i % appTypes.length];
      const submittedOffset = -(Math.floor(Math.random() * 90) + 5);
      const slaOffset = submittedOffset + (Math.floor(Math.random() * 60) - 20);

      const app: Application = {
        id: `APP-2027-${String(i + 1).padStart(4, "0")}`,
        institutionId: instId,
        appType,
        region,
        currentStage: stage,
        status: stage === "Approved" ? "Approved" : stage === "Rejected" ? "Rejected" : "Pending",
        submittedOn: isoDate(submittedOffset),
        slaDeadline: isoDate(slaOffset),
        deficiencyCount: stage === "Deficiency" || stage === "ReScrutiny" ? Math.floor(Math.random() * 3) + 1 : 0,
        assignedTo: i % 2 === 0 ? "u-scr-1" : "u-scr-2",
        remarks: i % 5 === 0 ? "Pending verification of land documents." : undefined,
      };
      this.applications.push(app);
      appIndex++;

      // Add some documents per app
      const docTypes: DocType[] = ["LAND_DOC", "BUILDING_PLAN", "OCC_CERT", "FIRE_NOC", "NOC_STATE"];
      const numDocs = Math.floor(Math.random() * 3) + 1;
      for (let d = 0; d < numDocs; d++) {
        this.documents.push({
          id: `doc-${i}-${d}`,
          appId: app.id,
          type: docTypes[d % docTypes.length],
          fileName: `${docTypes[d % docTypes.length].toLowerCase()}_${app.id}.pdf`,
          verified: d === 0,
          flags: d === 1 && i % 4 === 0 ? ["OCR: Expiry date close to session start"] : undefined,
        });
      }

      // Add tasks for deficiency/compliance stages
      if (stage === "Deficiency" || stage === "ReScrutiny") {
        this.tasks.push({
          id: `def-${i}`,
          appId: app.id,
          type: "Deficiency",
          description: "Missing fire safety NOC or expired document.",
          dueDate: isoDate(Math.floor(Math.random() * 14) - 7),
          status: i % 3 === 0 ? "Resolved" : "Open",
        });
      }
      if (stage === "EVC") {
        this.tasks.push({
          id: `evc-${i}`,
          appId: app.id,
          type: "EVCVisit",
          description: "EVC committee site visit required.",
          dueDate: isoDate(Math.floor(Math.random() * 20) + 5),
          status: "Open",
        });
      }

      // Audit log entry
      this.auditLogs.push({
        id: `log-${i}`,
        appId: app.id,
        userId: "u-reg-1",
        action: stage === "Submitted" ? "Application submitted" : `Moved to ${stage}`,
        timestamp: new Date(Date.now() + submittedOffset * 86400000).toISOString(),
        toStage: stage,
      });
    }

    this.persist();
  }

  // ── Retrieval ────────────────────────────────────────────────────────────────
  getInstitution(id: string) { return this.institutions.find(i => i.id === id); }
  getUser(id: string) { return this.users.find(u => u.id === id); }
  getApplication(id: string) { return this.applications.find(a => a.id === id); }
  getDocumentsForApp(appId: string) { return this.documents.filter(d => d.appId === appId); }
  getTasksForApp(appId: string) { return this.tasks.filter(t => t.appId === appId); }
  getAuditLogsForApp(appId: string) {
    return this.auditLogs.filter(l => l.appId === appId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  // Summary stats for dashboard
  getStats() {
    const apps = this.applications;
    return {
      total: apps.length,
      pending: apps.filter(a => a.status === "Pending").length,
      approved: apps.filter(a => a.status === "Approved").length,
      rejected: apps.filter(a => a.status === "Rejected").length,
      overdue: apps.filter(a => isOverdue(a)).length,
      byStage: STAGES.reduce((acc, s) => {
        acc[s] = apps.filter(a => a.currentStage === s).length;
        return acc;
      }, {} as Record<Stage, number>),
      byRegion: REGIONS.reduce((acc, r) => {
        acc[r] = apps.filter(a => a.region === r).length;
        return acc;
      }, {} as Record<string, number>),
    };
  }

  // ── Mutations ────────────────────────────────────────────────────────────────
  transitionStage(appId: string, toStage: Stage, userId: string, remarks?: string) {
    const app = this.getApplication(appId);
    if (!app) throw new Error("Application not found");
    const from = app.currentStage;
    app.currentStage = toStage;
    if (toStage === "Approved") app.status = "Approved";
    else if (toStage === "Rejected") app.status = "Rejected";
    this.auditLogs.push({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      appId,
      userId,
      action: `Stage transition ${from} → ${toStage}`,
      timestamp: new Date().toISOString(),
      fromStage: from,
      toStage,
      remarks,
    });
    this.persist();
  }

  raiseDeficiency(appId: string, description: string, due: string, assignedTo: string, raisedBy: string) {
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
  }

  uploadDocument(appId: string, type: DocType, fileName: string, userId: string, ocr?: Record<string, string>) {
    this.documents.push({
      id: `doc-${Date.now()}`,
      appId,
      type,
      fileName,
      verified: false,
      ocrExtracted: ocr,
    });
    this.auditLogs.push({
      id: `log-${Date.now()}`,
      appId,
      userId,
      action: `Uploaded ${type}`,
      timestamp: new Date().toISOString(),
    });
    this.persist();
  }

  verifyDocument(docId: string, userId: string) {
    const doc = this.documents.find(d => d.id === docId);
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
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) throw new Error("Task not found");
    task.status = "Resolved";
    this.auditLogs.push({
      id: `log-${Date.now()}`,
      appId: task.appId,
      userId,
      action: `Resolved task ${task.type}`,
      timestamp: new Date().toISOString(),
      remarks,
    });
    this.persist();
  }

  addAuditComment(appId: string, userId: string, comment: string) {
    this.auditLogs.push({
      id: `log-${Date.now()}`,
      appId,
      userId,
      action: "Comment",
      timestamp: new Date().toISOString(),
      remarks: comment,
    });
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
  }
}

export const afStore = new Store();

// ── Helper utilities ─────────────────────────────────────────────────────────
export const daysUntil = (dateStr: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
};
export const isOverdue = (app: Application) => daysUntil(app.slaDeadline) < 0;

export const getDemoUserId = (role: "institution" | "aicte_office" | "admin") => {
  const map: Record<string, string> = {
    institution: "u-inst-1",
    aicte_office: "u-scr-1",
    admin: "u-reg-1",
  };
  return map[role] ?? "u-reg-1";
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
