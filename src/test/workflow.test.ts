import { describe, it, expect } from "vitest";
import { transition, slaStatus, docValidity } from "@/lib/workflow";

describe("workflow rules", () => {
  it("new institution goes Scrutiny -> EVC on approval", () => {
    expect(transition("NEW_INSTITUTION", "Scrutiny", "APPROVE", "SCRUTINY_OFFICER")).toEqual({ ok: true, to: "EVC" });
  });
  it("EoA skips EVC: Scrutiny -> Decision", () => {
    expect(transition("EOA", "Scrutiny", "APPROVE", "SCRUTINY_OFFICER")).toEqual({ ok: true, to: "Decision" });
  });
  it("re-scrutiny approval moves on to EVC", () => {
    expect(transition("NEW_INSTITUTION", "ReScrutiny", "APPROVE", "SCRUTINY_OFFICER")).toEqual({ ok: true, to: "EVC" });
  });
  it("institution liaison cannot approve scrutiny", () => {
    expect(transition("NEW_INSTITUTION", "Scrutiny", "APPROVE", "INSTITUTION_LIAISON").ok).toBe(false);
  });
  it("blocks a third deficiency cycle", () => {
    expect(transition("NEW_INSTITUTION", "ReScrutiny", "RAISE_DEFICIENCY", "SCRUTINY_OFFICER", 2).ok).toBe(false);
  });
  it("SLA ladder thresholds", () => {
    expect(slaStatus(0, 8, 6).status).toBe("due_soon");
    expect(slaStatus(0, 10, 11).status).toBe("overdue");
    expect(slaStatus(0, 10, 15).status).toBe("escalated");
  });
  it("flags documents expiring within 90 days", () => {
    expect(docValidity("2027-01-15", "2026-11-01")).toBe("expiring");
    expect(docValidity("2026-01-15", "2026-11-01")).toBe("expired");
  });
});
