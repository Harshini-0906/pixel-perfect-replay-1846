// ApprovalFlow AI — Home / Landing page
// Route: /
import { createFileRoute, Link } from "@tanstack/react-router";
import { getCurrentDemoUser } from "@/lib/supabase";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ApprovalFlow AI — AICTE Institutional Approval Portal" },
      {
        name: "description",
        content:
          "ApprovalFlow AI is a modern Indian government regulatory portal for AICTE institutional approvals, scrutiny, and compliance management.",
      },
      { property: "og:title", content: "ApprovalFlow AI — AICTE Institutional Approval Portal" },
      { property: "og:description", content: "Regulatory compliance and institutional approval management." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const user = getCurrentDemoUser();
  if (user) {
    // If a demo session is already active, redirect to the app
    if (typeof window !== "undefined") {
      window.location.href = "/demo/approvalflow/applications";
    }
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
      {/* Top government band */}
      <div className="bg-[#163B65] text-white text-[11px] py-1.5 px-6 flex items-center justify-between">
        <span className="font-medium">Government of India — Ministry of Education</span>
        <span className="opacity-60">All India Council for Technical Education (AICTE)</span>
      </div>

      {/* Main hero */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-20 text-center">
        {/* Logo */}
        <div className="h-16 w-16 rounded-full bg-[#163B65] flex items-center justify-center shadow-lg mb-6">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="12" stroke="#E99A35" strokeWidth="2" fill="none" />
            <path d="M16 6v20M6 16h20" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx="16" cy="16" r="3.5" fill="#E99A35" />
          </svg>
        </div>

        <h1 className="text-[28px] font-bold text-[#163B65] leading-tight">ApprovalFlow AI</h1>
        <p className="text-[15px] text-[#5F6F82] mt-2">
          Institutional Approval &amp; Regulatory Compliance Platform
        </p>
        <p className="text-[12px] text-[#8290A0] mt-1">AICTE · Approval Process Handbook 2024–27</p>

        {/* Feature highlights */}
        <div className="grid sm:grid-cols-3 gap-4 mt-10 max-w-2xl w-full">
          {[
            {
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              ),
              title: "Application Management",
              desc: "Track and manage 120+ institutional applications across all processing stages.",
            },
            {
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              ),
              title: "Regulatory Scrutiny",
              desc: "Structured scrutiny workflow with deficiency notice and compliance tracking.",
            },
            {
              icon: (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ),
              title: "Approval Workflow",
              desc: "Multi-stage approval pipeline with EVC scheduling and audit trail.",
            },
          ].map(f => (
            <div key={f.title} className="bg-white rounded border border-[#E1E7ED] p-4 text-left">
              <div className="text-[#163B65] mb-2">{f.icon}</div>
              <p className="font-semibold text-[13px] text-[#172B40]">{f.title}</p>
              <p className="text-[11px] text-[#5F6F82] mt-1">{f.desc}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row items-center gap-3 mt-8">
          <Link
            to="/demo/login"
            className="inline-flex items-center gap-2 rounded bg-[#163B65] hover:bg-[#102F52] text-white font-semibold text-[13px] px-6 py-2.5 transition-colors shadow-sm"
          >
            Access Demo Portal
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </Link>
        </div>

        <p className="text-[11px] text-[#8290A0] mt-6">
          Demo environment — 60 institutions · 120 applications · Simulated data only
        </p>
      </div>

      {/* Footer */}
      <footer className="border-t border-[#E1E7ED] bg-white px-6 py-3 text-[11px] text-[#8290A0] flex items-center justify-between">
        <span>ApprovalFlow AI — AICTE Institutional Approval Portal</span>
        <span>© 2024–27 · Demo Prototype</span>
      </footer>
    </div>
  );
}
