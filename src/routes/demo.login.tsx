// ApprovalFlow AI — Government-Style Login Page
// Route: /demo/login
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DEMO_USERS, getCurrentDemoUser } from "@/lib/supabase";
import { useDemoRole } from "@/lib/demo-role-store";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/demo/login")({
  ssr: false,
  head: () => ({ meta: [{ title: "Login — ApprovalFlow AI | AICTE Regulatory Portal" }] }),
  component: LoginPage,
});

const ROLE_DESCRIPTIONS: Record<string, { desc: string; role_label: string; badge: string; access: string[] }> = {
  institution: {
    role_label: "Institution Representative",
    badge: "INSTITUTION",
    desc: "College / Technical Institute representative authorised to submit and track applications",
    access: ["Submit new applications", "Upload supporting documents", "Track application status", "View compliance tasks"],
  },
  aicte_office: {
    role_label: "AICTE Scrutiny Officer",
    badge: "OFFICER",
    desc: "Regional or scrutiny officer responsible for application verification and processing",
    access: ["Scrutinise applications", "Raise deficiency notices", "Schedule EVC visits", "Forward for recommendation"],
  },
  admin: {
    role_label: "System Administrator",
    badge: "ADMIN",
    desc: "Privileged administrator with full system access and reporting capabilities",
    access: ["Full system access", "Analytics & reports", "Audit logs", "All dashboards"],
  },
};

const BADGE_COLORS: Record<string, string> = {
  INSTITUTION: "bg-blue-50 text-blue-700 border border-blue-200",
  OFFICER: "bg-amber-50 text-amber-700 border border-amber-200",
  ADMIN: "bg-purple-50 text-purple-700 border border-purple-200",
};

const BORDER_COLORS: Record<string, string> = {
  institution: "border-blue-200 hover:border-blue-400",
  aicte_office: "border-amber-200 hover:border-amber-500",
  admin: "border-purple-200 hover:border-purple-400",
};

function LoginPage() {
  const [, setRole] = useDemoRole();
  const navigate = useNavigate();
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => {
    localStorage.removeItem("approvalFlowStore");
    localStorage.removeItem("approvalFlowStore_v2");
    const existing = getCurrentDemoUser();
    if (existing) navigate({ to: "/demo/approvalflow/applications" });
  }, []);

  const handleLogin = (user: typeof DEMO_USERS[0]) => {
    setLoading(user.id);
    localStorage.setItem("demoUser", JSON.stringify(user));
    setRole(user.role as any);
    setTimeout(() => {
      navigate({ to: "/demo/approvalflow/applications" });
    }, 400);
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col">
      {/* Top government header band */}
      <div className="bg-[#163B65] text-white text-[11px] py-1.5 px-4 flex items-center justify-between">
        <span className="font-medium">Government of India — Ministry of Education</span>
        <span className="opacity-60">All India Council for Technical Education (AICTE)</span>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          {/* Portal header */}
          <div className="text-center mb-10">
            {/* Emblem placeholder */}
            <div className="inline-flex items-center justify-center mb-4">
              <div className="h-16 w-16 rounded-full bg-[#163B65] flex items-center justify-center shadow-lg">
                <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="18" cy="18" r="14" stroke="#E99A35" strokeWidth="2.5" fill="none"/>
                  <path d="M18 8v20M8 18h20" stroke="#ffffff" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="18" cy="18" r="4" fill="#E99A35"/>
                </svg>
              </div>
            </div>

            <h1 className="text-[22px] font-bold text-[#163B65] leading-tight">ApprovalFlow AI</h1>
            <p className="text-sm text-[#5F6F82] mt-1">Institutional Approval &amp; Regulatory Compliance Platform</p>
            <p className="text-[11px] text-[#8290A0] mt-0.5">AICTE · Approval Process Handbook 2024–27</p>

            {/* Demo mode indicator */}
            <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-green-50 border border-green-200">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[11px] text-green-700 font-medium">Demo Mode · 120 Applications · 60 Institutions</span>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-6">
            <div className="flex-1 h-px bg-[#E1E7ED]" />
            <span className="text-[11px] text-[#8290A0] font-medium uppercase tracking-wider">Select Demo Role</span>
            <div className="flex-1 h-px bg-[#E1E7ED]" />
          </div>

          {/* Role cards */}
          <div className="space-y-3">
            {DEMO_USERS.map(user => {
              const meta = ROLE_DESCRIPTIONS[user.role];
              if (!meta) return null;
              const isLoading = loading === user.id;
              return (
                <button
                  key={user.id}
                  onClick={() => handleLogin(user)}
                  disabled={!!loading}
                  className={`w-full rounded-lg border-2 bg-white p-4 text-left transition-all duration-150 hover:shadow-md active:scale-[0.995] cursor-pointer ${BORDER_COLORS[user.role]} ${isLoading ? "opacity-70" : ""}`}
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <p className="font-semibold text-[#172B40] text-sm">{user.name}</p>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded font-mono ${BADGE_COLORS[meta.badge]}`}>
                          {meta.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#5F6F82] mb-2">{meta.desc}</p>
                      <div className="flex flex-wrap gap-1">
                        {meta.access.map(a => (
                          <span key={a} className="text-[10px] bg-[#F0F3F6] text-[#5F6F82] px-1.5 py-0.5 rounded">
                            ✓ {a}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center self-center flex-shrink-0">
                      {isLoading ? (
                        <div className="h-4 w-4 rounded-full border-2 border-[#163B65]/20 border-t-[#163B65] animate-spin" />
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-[#8290A0]">
                          <path d="M6 12l4-4-4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Footer */}
          <p className="text-center text-[11px] text-[#8290A0] mt-8">
            ApprovalFlow AI · Prototype Portal · Data is simulated and not stored permanently
          </p>
        </div>
      </div>
    </div>
  );
}
