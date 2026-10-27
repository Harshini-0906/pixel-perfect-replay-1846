import type { AppType, Stage } from "./workflow";

export type CaseRow = {
  id: string; institution: string; region: string; type: AppType; stage: Stage;
  stageStartDay: number; slaDays: number; assignee: string;
};

/** "Today" in the prototype is day 30 of the cycle. */
export const TODAY = 30;
export const TODAY_DATE = "2026-10-31";

export const REGIONS = ["North", "South", "East", "West", "Central", "South-West", "North-West", "Eastern"];

const names = ["Sri Venkateswara Inst. of Technology", "Ganga Polytechnic", "Deccan College of Engg.", "Malwa Inst. of Management", "Kaveri School of Pharmacy", "Brahmaputra Tech Univ.", "Narmada Inst. of Architecture", "Konkan Engg. College", "Thar Inst. of Technology", "Shivalik Polytechnic", "Godavari Inst. of MCA", "Sahyadri School of Design", "Vindhya College of Engg.", "Coromandel Hotel Mgmt.", "Aravalli Inst. of Tech."];
const stages: Stage[] = ["Scrutiny", "Deficiency", "ReScrutiny", "EVC", "Recommendation", "SAC_SHC", "Decision"];
const types: AppType[] = ["NEW_INSTITUTION", "EOA", "EOA", "INTAKE_INCREASE"];
const people = ["Dr. A. Rao (SO)", "S. Iyer (RO)", "Prof. K. Menon (CM)", "R. Gupta (SO)", "M. Das (RO)"];
const sla: Record<string, number> = { Scrutiny: 15, Deficiency: 7, ReScrutiny: 5, EVC: 10, Recommendation: 5, SAC_SHC: 15, Decision: 5 };

let seed = 7;
const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
const pick = <T,>(a: T[], i: number): T => a[i % a.length] as T;

export const CASES: CaseRow[] = Array.from({ length: 64 }, (_, i) => {
  const stage = pick(stages, Math.floor(rnd() * stages.length));
  return {
    id: `APP-2027-${String(1000 + i * 7)}`,
    institution: pick(names, i),
    region: pick(REGIONS, Math.floor(rnd() * REGIONS.length)),
    type: pick(types, Math.floor(rnd() * types.length)),
    stage,
    stageStartDay: TODAY - Math.floor(rnd() * (sla[stage] ?? 5) * 2),
    slaDays: sla[stage] ?? 5,
    assignee: pick(people, i),
  };
});

export type DemoDoc = { code: string; label: string; ref: string; file?: string; expiry?: string; flag?: string };

export const DEMO_DOCS: DemoDoc[] = [
  { code: "LAND_DOC", label: "Registered lease deed (30 yrs)", ref: "Annexure-1 §1", file: "lease_deed.pdf", expiry: "2054-03-31" },
  { code: "BUILDING_PLAN", label: "Approved building plan", ref: "Annexure-1 §2", file: "building_plan_dtcp.pdf" },
  { code: "OCC_CERT", label: "Occupancy certificate", ref: "Annexure-1 §3", file: "occupancy.pdf" },
  { code: "FIRE_NOC", label: "Fire safety NOC", ref: "Annexure-1 §4", file: "fire_noc.pdf", expiry: "2027-01-15", flag: "OCR: expiry 15-01-2027 falls before session start (01-08-2027)" },
  { code: "NOC_STATE", label: "State Government NOC", ref: "Annexure-1 §5", file: "state_noc.pdf" },
  { code: "AFFIDAVIT", label: "Notarised affidavit", ref: "Annexure-2", file: "affidavit.pdf" },
  { code: "FDR", label: "Fixed Deposit Receipt ₹50 L", ref: "Annexure-1 §7", file: "fdr_sbi.pdf", expiry: "2032-03-31" },
];
