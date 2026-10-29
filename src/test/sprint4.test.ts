// ApprovalFlow AI — Sprint 4 Tests
// Post-Approval Undertakings & Document Lifecycle Intelligence

import { describe, it, expect, beforeEach } from "vitest";
import { postApprovalStore, POST_APPROVAL_CONFIG } from "@/lib/post-approval";
import { notifStore } from "@/lib/notifications";
import { afStore } from "@/lib/approval-flow";

describe("Sprint 4: Post-Approval Undertakings & Document Lifecycle Intelligence", () => {
  beforeEach(() => {
    localStorage.clear();
    notifStore.reset();
    afStore.reset();
    postApprovalStore.reset();
  });

  // ── 1. Undertaking Creation & Association ───────────────────────────────────
  it("creates undertakings associated with an approved application", () => {
    const ut = postApprovalStore.createUndertaking({
      appId: "APP-2027-0001",
      institutionId: "inst-1",
      title: "Faculty Cadre Compliance",
      conditionDescription: "Appoint required Professor and Associate Professor cadres.",
      assignedResponsibility: "Principal / Registrar",
      dueDate: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      userId: "u-reg-1",
    });

    expect(ut).toBeDefined();
    expect(ut.id).toMatch(/^UT-2027-\d+/);
    expect(ut.status).toBe("Pending");
    expect(ut.evidences).toHaveLength(0);

    // Verify retrieval by app and institution
    const appUts = postApprovalStore.getUndertakingsForApplication("APP-2027-0001");
    expect(appUts.some((u) => u.id === ut.id)).toBe(true);

    const instUts = postApprovalStore.getUndertakingsForInstitution("inst-1");
    expect(instUts.some((u) => u.id === ut.id)).toBe(true);
  });

  it("supports multiple undertakings per application", () => {
    postApprovalStore.createUndertaking({
      appId: "APP-MULTI-TEST",
      institutionId: "inst-1",
      title: "Condition 1: Ramp construction",
      conditionDescription: "Build disabled-friendly ramps.",
      assignedResponsibility: "Head of Institution",
      dueDate: "2026-11-20",
      userId: "u-reg-1",
    });

    postApprovalStore.createUndertaking({
      appId: "APP-MULTI-TEST",
      institutionId: "inst-1",
      title: "Condition 2: Fire safety audit",
      conditionDescription: "Submit third-party fire audit report.",
      assignedResponsibility: "Head of Institution",
      dueDate: "2026-12-05",
      userId: "u-reg-1",
    });

    const list = postApprovalStore.getUndertakingsForApplication("APP-MULTI-TEST");
    expect(list).toHaveLength(2);
  });

  // ── 2. Evidence Submission & Status Changes ─────────────────────────────────
  it("allows institutions to submit supporting evidence for an undertaking", () => {
    const ut = postApprovalStore.createUndertaking({
      appId: "APP-2027-0002",
      institutionId: "inst-1",
      title: "Barrier-Free Access Compliance",
      conditionDescription: "Install tactile paving and wheelchair ramps.",
      assignedResponsibility: "Principal",
      dueDate: "2026-11-30",
      userId: "u-reg-1",
    });

    const updated = postApprovalStore.submitEvidence({
      undertakingId: ut.id,
      fileName: "ramp_completion_certificate.pdf",
      explanation: "PWD certified completion certificate attached.",
      userId: "u-inst-1",
    });

    expect(updated.status).toBe("Under Review");
    expect(updated.evidences).toHaveLength(1);
    expect(updated.evidences[0]?.fileName).toBe("ramp_completion_certificate.pdf");
    expect(updated.evidences[0]?.version).toBe(1);

    // Verify notification emitted for officers
    const notifs = notifStore.getAllNotifications();
    expect(
      notifs.some((n) => n.type === "CLARIFICATION_SUBMITTED" && n.title.includes(ut.title)),
    ).toBe(true);
  });

  // ── 3. Officer Verification, Rejection & Resubmission ────────────────────────
  it("allows officers to accept or reject evidence with mandatory remarks", () => {
    const ut = postApprovalStore.createUndertaking({
      appId: "APP-2027-0003",
      institutionId: "inst-1",
      title: "Library Books Purchase Undertaking",
      conditionDescription: "Procure 500 mandatory volumes.",
      assignedResponsibility: "Librarian / Principal",
      dueDate: "2026-12-15",
      userId: "u-reg-1",
    });

    postApprovalStore.submitEvidence({
      undertakingId: ut.id,
      fileName: "incomplete_invoices.pdf",
      explanation: "Partial invoices attached",
      userId: "u-inst-1",
    });

    // 1. Officer Rejects
    const rejectedUt = postApprovalStore.verifyUndertaking({
      undertakingId: ut.id,
      approved: false,
      remarks: "Invoices missing stamped delivery challans. Please resubmit.",
      userId: "u-scr-1",
    });

    expect(rejectedUt.status).toBe("Rejected");
    expect(rejectedUt.officerRemarks).toContain("missing stamped delivery challans");

    // 2. Institution Resubmits
    const resubmittedUt = postApprovalStore.submitEvidence({
      undertakingId: ut.id,
      fileName: "stamped_delivery_challans.pdf",
      explanation: "Stamped challans and bank payment receipts uploaded.",
      userId: "u-inst-1",
    });

    expect(resubmittedUt.status).toBe("Under Review");
    expect(resubmittedUt.evidences).toHaveLength(2);
    expect(resubmittedUt.evidences[0]?.version).toBe(2);

    // 3. Officer Verifies & Accepts
    const verifiedUt = postApprovalStore.verifyUndertaking({
      undertakingId: ut.id,
      approved: true,
      remarks: "All 500 volumes verified with accession register entry.",
      userId: "u-scr-1",
    });

    expect(verifiedUt.status).toBe("Verified");
    expect(verifiedUt.verifiedBy).toBe("u-scr-1");
  });

  // ── 4. Document Validity Tracking & Expiry Reminders ────────────────────────
  it("tracks document validities, categorizes expiring/expired states, and alerts", () => {
    const trackedDocs = postApprovalStore.getAllTrackedDocuments();
    expect(trackedDocs.length).toBeGreaterThan(0);

    const expiredDoc = trackedDocs.find((d) => d.status === "Expired");
    const expiringSoonDoc = trackedDocs.find((d) => d.status === "Expiring Soon");

    expect(expiredDoc).toBeDefined();
    expect(expiringSoonDoc).toBeDefined();

    // Run obligation evaluation
    postApprovalStore.evaluateComplianceObligations();

    const notifs = notifStore.getAllNotifications();
    const hasExpAlert = notifs.some(
      (n) => n.type === "SLA_OVERDUE" && n.title.includes(expiredDoc!.documentName),
    );
    expect(hasExpAlert).toBe(true);

    const hasExpSoonAlert = notifs.some(
      (n) => n.type === "SLA_APPROACHING" && n.title.includes(expiringSoonDoc!.documentName),
    );
    expect(hasExpSoonAlert).toBe(true);
  });

  // ── 5. Document Renewal & Version History ───────────────────────────────────
  it("maintains version history when renewals are uploaded and verified", () => {
    const doc = postApprovalStore.getAllTrackedDocuments()[0];
    expect(doc).toBeDefined();
    const docId = doc!.id;
    const initialVersion = doc!.currentVersion;

    // 1. Upload Renewal
    const renewed = postApprovalStore.uploadDocumentRenewal({
      documentId: docId,
      fileName: "fire_noc_renewed_2028.pdf",
      newExpiryDate: "2028-06-30",
      issueDate: "2026-10-01",
      userId: "u-inst-1",
    });

    expect(renewed.status).toBe("Renewal Submitted");
    expect(renewed.currentVersion).toBe(initialVersion + 1);
    expect(renewed.history).toHaveLength(2);
    expect(renewed.history[0]?.fileName).toBe("fire_noc_renewed_2028.pdf");

    // 2. Verify Renewal
    const verifiedRenewal = postApprovalStore.verifyDocumentRenewal({
      documentId: docId,
      approved: true,
      remarks: "Renewal verified against municipal fire authority register",
      userId: "u-scr-1",
    });

    expect(verifiedRenewal.status).toBe("Renewed");
    expect(verifiedRenewal.expiryDate).toBe("2028-06-30");
    expect(verifiedRenewal.history[0]?.verified).toBe(true);
  });

  // ── 6. Compliance Statistics Calculation ────────────────────────────────────
  it("computes accurate aggregate compliance statistics", () => {
    const stats = postApprovalStore.getComplianceStats();
    expect(stats.totalUt).toBeGreaterThan(0);
    expect(stats.totalDocs).toBeGreaterThan(0);
    expect(typeof stats.pendingUt).toBe("number");
    expect(typeof stats.overdueUt).toBe("number");
    expect(typeof stats.verifiedUt).toBe("number");
    expect(typeof stats.expiringSoonDocs).toBe("number");
    expect(typeof stats.expiredDocs).toBe("number");
  });
});
