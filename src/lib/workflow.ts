export type Stage =
  | "Submitted" | "Scrutiny" | "Deficiency" | "ReScrutiny" | "EVC"
  | "Recommendation" | "SAC_SHC" | "Decision" | "Approved" | "Rejected";

export type AppType = "NEW_INSTITUTION" | "EOA" | "INTAKE_INCREASE";
export type Action = "APPROVE" | "RAISE_DEFICIENCY" | "RESPOND" | "REJECT" | "REFER_HEARING";
export type Role = "SYSTEM_ADMIN" | "REGIONAL_OFFICER" | "SCRUTINY_OFFICER" | "COMMITTEE_MEMBER" | "INSTITUTION_LIAISON";

export const STAGE_LABEL: Record<Stage, string> = {
  Submitted: "Submitted", Scrutiny: "Scrutiny", Deficiency: "Deficiency", ReScrutiny: "Re-scrutiny",
  EVC: "EVC", Recommendation: "Recommendation", SAC_SHC: "SAC / SHC", Decision: "Decision",
  Approved: "Approved (LoA/EoA)", Rejected: "Rejected",
};

/** Rule engine: stage plan per application type, with SLA days and acting role. */
export const RULES: Record<AppType, { label: string; stages: { stage: Stage; sla: number; role: Role }[]; docs: { code: string; label: string; ref: string }[] }> = {
  NEW_INSTITUTION: {
    label: "New Institution",
    stages: [
      { stage: "Scrutiny", sla: 15, role: "SCRUTINY_OFFICER" },
      { stage: "Deficiency", sla: 7, role: "INSTITUTION_LIAISON" },
      { stage: "ReScrutiny", sla: 5, role: "SCRUTINY_OFFICER" },
      { stage: "EVC", sla: 10, role: "COMMITTEE_MEMBER" },
      { stage: "Recommendation", sla: 5, role: "REGIONAL_OFFICER" },
      { stage: "SAC_SHC", sla: 15, role: "COMMITTEE_MEMBER" },
      { stage: "Decision", sla: 5, role: "REGIONAL_OFFICER" },
    ],
    docs: [
      { code: "LAND_DOC", label: "Land / registered lease deed", ref: "Annexure-1 §1" },
      { code: "BUILDING_PLAN", label: "Approved building plan", ref: "Annexure-1 §2" },
      { code: "OCC_CERT", label: "Occupancy certificate", ref: "Annexure-1 §3" },
      { code: "FIRE_NOC", label: "Fire safety NOC", ref: "Annexure-1 §4" },
      { code: "NOC_STATE", label: "State Government NOC", ref: "Annexure-1 §5" },
      { code: "AFFIDAVIT", label: "Notarised affidavit", ref: "Annexure-2" },
      { code: "FDR", label: "Fixed Deposit Receipt", ref: "Annexure-1 §7" },
    ],
  },
  EOA: {
    label: "Extension of Approval",
    stages: [
      { stage: "Scrutiny", sla: 7, role: "SCRUTINY_OFFICER" },
      { stage: "Deficiency", sla: 7, role: "INSTITUTION_LIAISON" },
      { stage: "ReScrutiny", sla: 5, role: "SCRUTINY_OFFICER" },
      { stage: "SAC_SHC", sla: 15, role: "COMMITTEE_MEMBER" },
      { stage: "Decision", sla: 3, role: "REGIONAL_OFFICER" },
    ],
    docs: [
      { code: "AFFIDAVIT", label: "Self-disclosure affidavit", ref: "Annexure-2" },
      { code: "FIRE_NOC", label: "Fire safety NOC (valid)", ref: "Annexure-1 §4" },
      { code: "LEASE_RENEWAL", label: "Lease renewal undertaking", ref: "Annexure-1 §1" },
    ],
  },
  INTAKE_INCREASE: {
    label: "Increase in Intake",
    stages: [
      { stage: "Scrutiny", sla: 10, role: "SCRUTINY_OFFICER" },
      { stage: "Deficiency", sla: 7, role: "INSTITUTION_LIAISON" },
      { stage: "ReScrutiny", sla: 5, role: "SCRUTINY_OFFICER" },
      { stage: "EVC", sla: 10, role: "COMMITTEE_MEMBER" },
      { stage: "Decision", sla: 5, role: "REGIONAL_OFFICER" },
    ],
    docs: [
      { code: "BUILDING_PLAN", label: "Additional built-up area plan", ref: "Annexure-1 §2" },
      { code: "FACULTY_LIST", label: "Faculty list (1:20 ratio)", ref: "APH Appendix" },
    ],
  },
};

/** Which role may perform which action at a stage. */
export const PERMISSIONS: Partial<Record<Stage, Partial<Record<Action, Role[]>>>> = {
  Submitted: { APPROVE: ["REGIONAL_OFFICER", "SCRUTINY_OFFICER"] },
  Scrutiny: { APPROVE: ["SCRUTINY_OFFICER", "REGIONAL_OFFICER"], RAISE_DEFICIENCY: ["SCRUTINY_OFFICER", "REGIONAL_OFFICER"] },
  Deficiency: { RESPOND: ["INSTITUTION_LIAISON"], REJECT: ["REGIONAL_OFFICER"] },
  ReScrutiny: { APPROVE: ["SCRUTINY_OFFICER", "REGIONAL_OFFICER"], RAISE_DEFICIENCY: ["SCRUTINY_OFFICER"] },
  EVC: { APPROVE: ["COMMITTEE_MEMBER"], RAISE_DEFICIENCY: ["COMMITTEE_MEMBER"] },
  Recommendation: { APPROVE: ["REGIONAL_OFFICER"], REFER_HEARING: ["REGIONAL_OFFICER"] },
  SAC_SHC: { APPROVE: ["COMMITTEE_MEMBER"], REJECT: ["COMMITTEE_MEMBER"] },
  Decision: { APPROVE: ["REGIONAL_OFFICER"], REJECT: ["REGIONAL_OFFICER"] },
};

export const MAX_DEFICIENCY_CYCLES = 2;

function planStages(type: AppType) { return RULES[type].stages.map((s) => s.stage); }

/** Next stage after a forward move, skipping the deficiency loop and optional hearing. */
function nextForward(type: AppType, from: Stage): Stage {
  const plan: Stage[] = planStages(type).filter((s) => s !== "Deficiency" && s !== "ReScrutiny" && s !== "SAC_SHC");
  if (from === "Submitted") return "Scrutiny";
  if (from === "SAC_SHC") return "Decision";
  const cur: Stage = from === "ReScrutiny" ? "Scrutiny" : from;
  const i = plan.indexOf(cur);
  return i >= 0 && i < plan.length - 1 ? (plan[i + 1] ?? "Approved") : "Approved";
}

export function canAct(stage: Stage, action: Action, role: Role) {
  return PERMISSIONS[stage]?.[action]?.includes(role) ?? false;
}

export function transition(
  type: AppType, stage: Stage, action: Action, role: Role, deficiencyCycles = 0,
): { ok: true; to: Stage } | { ok: false; error: string } {
  if (!canAct(stage, action, role)) return { ok: false, error: `${role} cannot ${action} at ${stage}` };
  switch (action) {
    case "APPROVE": return { ok: true, to: nextForward(type, stage) };
    case "RAISE_DEFICIENCY":
      if (deficiencyCycles >= MAX_DEFICIENCY_CYCLES) return { ok: false, error: "Maximum deficiency cycles reached — refer to decision" };
      return { ok: true, to: "Deficiency" };
    case "RESPOND": return { ok: true, to: "ReScrutiny" };
    case "REFER_HEARING":
      return planStages(type).includes("SAC_SHC") ? { ok: true, to: "SAC_SHC" } : { ok: false, error: "No hearing stage for this type" };
    case "REJECT": return { ok: true, to: "Rejected" };
  }
}

export type SlaStatus = "on_track" | "due_soon" | "overdue" | "escalated";

/** SLA ladder: ≥75% elapsed due soon (remind), >100% overdue (notify RO), ≥150% escalated (Regional Director). */
export function slaStatus(startedDay: number, slaDays: number, today: number): { status: SlaStatus; pct: number; level: number } {
  const pct = Math.round(((today - startedDay) / slaDays) * 100);
  if (pct >= 150) return { status: "escalated", pct, level: pct >= 200 ? 3 : 2 };
  if (pct > 100) return { status: "overdue", pct, level: 1 };
  if (pct >= 75) return { status: "due_soon", pct, level: 0 };
  return { status: "on_track", pct, level: 0 };
}

/** Document validity: expired, or expiring within 90 days of the reference date. */
export function docValidity(expiry: string | undefined, ref: string): "valid" | "expiring" | "expired" | "missing" | "no_expiry" {
  if (expiry === undefined) return "no_expiry";
  if (!expiry) return "missing";
  const d = (new Date(expiry).getTime() - new Date(ref).getTime()) / 86400000;
  if (d < 0) return "expired";
  if (d <= 90) return "expiring";
  return "valid";
}
