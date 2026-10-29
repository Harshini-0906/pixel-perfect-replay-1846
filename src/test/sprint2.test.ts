// ApprovalFlow AI — Sprint 2 tests
// Tests: SLA badges, ageing, timeline sorting, pendency intelligence, bottleneck detection

import { describe, it, expect } from "vitest";
import {
  computeSlaStatus,
  stageAgeingDays,
  getDueSoon,
  getStagesPendencyStats,
  daysUntil,
  isOverdue,
  type Application,
} from "@/lib/approval-flow";

// ── Helper factory ────────────────────────────────────────────────────────────
const daysFromNow = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

const daysAgoISO = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

function makeApp(
  overrides: Partial<Application> & { slaDaysFromNow: number; stageEnteredDaysAgo?: number },
): Application {
  const slaDeadline = daysFromNow(overrides.slaDaysFromNow);
  const stage = overrides.currentStage ?? "Scrutiny";
  const stageEntered =
    overrides.stageEnteredDaysAgo !== undefined
      ? daysAgoISO(overrides.stageEnteredDaysAgo)
      : undefined;

  return {
    id: "app-test-1",
    institutionId: "inst-1",
    appType: "NEW_INSTITUTION",
    region: "North",
    status: overrides.status ?? "Pending",
    currentStage: stage,
    submittedOn: "2026-01-01",
    slaDeadline,
    deficiencyCount: 0,
    workflowTemplate: "scrutinyEvc",
    ...(stageEntered ? { stageEntered: { [stage]: stageEntered } } : {}),
    ...overrides,
  } as Application;
}

// ── computeSlaStatus ──────────────────────────────────────────────────────────
describe("computeSlaStatus", () => {
  it("returns 'completed' for Approved application regardless of deadline", () => {
    const app = makeApp({ slaDaysFromNow: -5, status: "Approved", currentStage: "Approved" });
    expect(computeSlaStatus(app, "Approved").status).toBe("completed");
  });

  it("returns 'completed' for Rejected application", () => {
    const app = makeApp({ slaDaysFromNow: 10, status: "Rejected", currentStage: "Rejected" });
    expect(computeSlaStatus(app, "Rejected").status).toBe("completed");
  });

  it("returns 'overdue' when SLA deadline has passed", () => {
    const app = makeApp({ slaDaysFromNow: -3, stageEnteredDaysAgo: 10 });
    expect(computeSlaStatus(app, "Scrutiny").status).toBe("overdue");
  });

  it("returns 'due_soon' when 1–5 days remain", () => {
    const app = makeApp({ slaDaysFromNow: 3, stageEnteredDaysAgo: 10 });
    expect(computeSlaStatus(app, "Scrutiny").status).toBe("due_soon");
  });

  it("returns 'on_track' when more than 5 days remain", () => {
    const app = makeApp({ slaDaysFromNow: 20, stageEnteredDaysAgo: 5 });
    expect(computeSlaStatus(app, "Scrutiny").status).toBe("on_track");
  });

  it("returns 'on_track' (safe default) when no stageEntered timestamp exists", () => {
    const app = makeApp({ slaDaysFromNow: -10 });
    // no stageEntered — should return on_track not overdue
    expect(computeSlaStatus(app, "Scrutiny").status).toBe("on_track");
  });
});

// ── stageAgeingDays ───────────────────────────────────────────────────────────
describe("stageAgeingDays", () => {
  it("returns number of days since stage entry", () => {
    const app = makeApp({ slaDaysFromNow: 10, stageEnteredDaysAgo: 5 });
    const result = stageAgeingDays(app);
    expect(result).toBe(5);
  });

  it("returns 0 for entry today", () => {
    const app = makeApp({ slaDaysFromNow: 10, stageEnteredDaysAgo: 0 });
    expect(stageAgeingDays(app)).toBe(0);
  });

  it("returns null when no stageEntered timestamp", () => {
    const app = makeApp({ slaDaysFromNow: 10 });
    expect(stageAgeingDays(app)).toBeNull();
  });
});

// ── getDueSoon ────────────────────────────────────────────────────────────────
describe("getDueSoon", () => {
  it("includes pending apps with deadline 0–5 days away", () => {
    const a = makeApp({ slaDaysFromNow: 3 });
    expect(getDueSoon([a])).toHaveLength(1);
  });

  it("excludes overdue apps", () => {
    const a = makeApp({ slaDaysFromNow: -2 });
    expect(getDueSoon([a])).toHaveLength(0);
  });

  it("excludes completed apps", () => {
    const a = makeApp({ slaDaysFromNow: 2, status: "Approved" });
    expect(getDueSoon([a])).toHaveLength(0);
  });

  it("excludes on-track apps with >5 days left", () => {
    const a = makeApp({ slaDaysFromNow: 15 });
    expect(getDueSoon([a])).toHaveLength(0);
  });
});

// ── getStagesPendencyStats ────────────────────────────────────────────────────
describe("getStagesPendencyStats", () => {
  it("counts pending and overdue correctly per stage", () => {
    const apps: Application[] = [
      makeApp({ slaDaysFromNow: -2, stageEnteredDaysAgo: 10, id: "a1" }),
      makeApp({ slaDaysFromNow: 5, stageEnteredDaysAgo: 3, id: "a2" }),
    ];
    const stats = getStagesPendencyStats(apps);
    const scrutiny = stats.find((s) => s.stage === "Scrutiny");
    expect(scrutiny).toBeDefined();
    expect(scrutiny!.pending).toBe(2);
    expect(scrutiny!.overdue).toBe(1);
  });

  it("includes average ageing when stageEntered timestamps exist", () => {
    const apps: Application[] = [
      makeApp({ slaDaysFromNow: 10, stageEnteredDaysAgo: 4, id: "a1" }),
      makeApp({ slaDaysFromNow: 10, stageEnteredDaysAgo: 8, id: "a2" }),
    ];
    const stats = getStagesPendencyStats(apps);
    const scrutiny = stats.find((s) => s.stage === "Scrutiny");
    expect(scrutiny!.avgAgeingDays).toBe(6); // (4+8)/2
  });

  it("returns null avgAgeingDays when no stageEntered timestamps", () => {
    const apps: Application[] = [
      makeApp({ slaDaysFromNow: 10, id: "a1" }), // no stageEnteredDaysAgo
    ];
    const stats = getStagesPendencyStats(apps);
    const scrutiny = stats.find((s) => s.stage === "Scrutiny");
    expect(scrutiny!.avgAgeingDays).toBeNull();
  });

  it("excludes completed (Approved/Rejected) applications", () => {
    const apps: Application[] = [
      makeApp({
        slaDaysFromNow: 10,
        status: "Approved",
        currentStage: "Approved",
        id: "a1",
      }),
    ];
    const stats = getStagesPendencyStats(apps);
    // Approved stage is not in the activeStages list, and app status is Approved so pending filter excludes it
    expect(stats).toHaveLength(0);
  });
});

// ── isOverdue / daysUntil ─────────────────────────────────────────────────────
describe("isOverdue", () => {
  it("returns true when SLA deadline was in the past", () => {
    const app = makeApp({ slaDaysFromNow: -1 });
    expect(isOverdue(app)).toBe(true);
  });

  it("returns false when SLA deadline is in the future", () => {
    const app = makeApp({ slaDaysFromNow: 5 });
    expect(isOverdue(app)).toBe(false);
  });
});

describe("daysUntil", () => {
  it("returns negative for past dates", () => {
    expect(daysUntil(daysFromNow(-3))).toBeLessThan(0);
  });

  it("returns positive for future dates", () => {
    expect(daysUntil(daysFromNow(10))).toBeGreaterThan(0);
  });
});
