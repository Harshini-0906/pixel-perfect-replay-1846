// ApprovalFlow AI — Main Authenticated Layout
// Route: /demo/approvalflow  (shell for all sub-pages)
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getCurrentDemoUser, signOutDemoUser, DEMO_USERS } from "@/lib/supabase";
import { afStore, storeEvents } from "@/lib/approval-flow";
import { useDemoRole } from "@/lib/demo-role-store";

export const Route = createFileRoute("/demo/approvalflow")({
  ssr: false,
  head: () => ({ meta: [{ title: "ApprovalFlow AI — AICTE Regulatory Portal" }] }),
  component: ApprovalFlowLayout,
});

// ── Lucide-style icon paths (inline SVG to avoid extra dep) ──────────────────
function Icon({ d, size = 16, className = "" }: { d: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={d} />
    </svg>
  );
}

const ICONS: Record<string, string> = {
  applications: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  scrutiny: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  evc: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  compliance: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  admin: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  logout: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 18L18 6M6 6l12 12",
  chevron: "M9 5l7 7-7 7",
};

const NAV_ITEMS = [
  { path: "/demo/approvalflow/applications", label: "Applications", icon: "applications" },
  { path: "/demo/approvalflow/scrutiny",     label: "Scrutiny & Verification", icon: "scrutiny" },
  { path: "/demo/approvalflow/evc",          label: "EVC Scheduler", icon: "evc" },
  { path: "/demo/approvalflow/compliance",   label: "Compliance Monitoring", icon: "compliance" },
  { path: "/demo/approvalflow/admin",        label: "Admin Report", icon: "admin" },
];

const ROLE_LABEL: Record<string, string> = {
  institution: "Institution Representative",
  aicte_office: "AICTE Scrutiny Officer",
  admin: "System Administrator",
};

// ── Header exported for other pages (index.tsx) ───────────────────────────────
export function Header({ kicker, title, sub }: { kicker: string; title: string; sub: string }) {
  return (
    <div className="text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-[#E99A35] mb-1">{kicker}</p>
      <h1 className="text-3xl font-bold text-[#163B65]">{title}</h1>
      <p className="mt-1 text-sm text-[#5F6F82]">{sub}</p>
    </div>
  );
}

// ── Badge counter ─────────────────────────────────────────────────────────────
function NavBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-auto min-w-[18px] h-[18px] rounded-full bg-[#E99A35] text-white text-[10px] font-bold flex items-center justify-center px-1">
      {count}
    </span>
  );
}

function ApprovalFlowLayout() {
  const [role] = useDemoRole();
  const user = getCurrentDemoUser();
  const [stats, setStats] = useState(() => afStore.getStats());
  const router = useRouterState();
  const currentPath = router.location.pathname;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const unsub = storeEvents.subscribe(() => setStats(afStore.getStats()));
    return unsub;
  }, []);

  const handleLogout = async () => {
    await signOutDemoUser();
    window.location.href = "/demo/login";
  };

  // Role-based nav filtering (role is typed as Role | null from workflow.ts but actually holds demo strings)
  const roleStr = role as string | null;
  const visibleNav = NAV_ITEMS.filter(n => {
    if (roleStr === "institution") return n.path === "/demo/approvalflow/applications";
    return true;
  });

  // Current page label for breadcrumb
  const currentNav = visibleNav.find(n => currentPath === n.path || currentPath.startsWith(n.path));

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo / portal name */}
      <div className="px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-[#E99A35] flex items-center justify-center flex-shrink-0 shadow">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8" stroke="white" strokeWidth="1.8" fill="none"/>
              <path d="M10 4v12M4 10h12" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="10" cy="10" r="2.5" fill="white"/>
            </svg>
          </div>
          <div>
            <p className="font-bold text-[13px] text-white leading-tight">ApprovalFlow AI</p>
            <p className="text-[10px] text-white/50 leading-tight">AICTE · APH 2024–27</p>
          </div>
        </div>
      </div>

      {/* Quick stats strip */}
      <div className="px-3 py-3 border-b border-white/10">
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: "Pending", value: stats.pending, color: "text-amber-300" },
            { label: "Overdue", value: stats.overdue, color: "text-red-400" },
            { label: "Approved", value: stats.approved, color: "text-green-400" },
            { label: "Total", value: stats.total, color: "text-white" },
          ].map(s => (
            <div key={s.label} className="rounded bg-white/5 px-2 py-1.5 text-center">
              <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[10px] text-white/40">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        <p className="section-header mt-1 mb-2">Navigation</p>
        {visibleNav.map(item => {
          const isActive = currentPath === item.path || currentPath.startsWith(item.path);
          const badge =
            item.icon === "scrutiny" ? (stats.byStage?.Scrutiny ?? 0) :
            item.icon === "evc"      ? (stats.byStage?.EVC ?? 0) : 0;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={`sidebar-item ${isActive ? "active" : ""}`}
            >
              <Icon d={ICONS[item.icon] ?? ""} size={15} className="flex-shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              <NavBadge count={badge} />
            </Link>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div className="px-3 py-3 border-t border-white/10">
        {user ? (
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-[#E99A35] flex items-center justify-center text-[13px] font-bold text-white flex-shrink-0">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-semibold text-white truncate">{user.name}</p>
              <p className="text-[10px] text-white/40 truncate">{ROLE_LABEL[user.role] ?? user.role}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="text-white/30 hover:text-red-400 transition-colors p-1 rounded hover:bg-white/5"
            >
              <Icon d={ICONS["logout"] ?? ""} size={14} />
            </button>
          </div>
        ) : (
          <Link to="/demo/login" className="text-xs text-[#E99A35] hover:underline">Sign in →</Link>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#F5F7FA] font-sans">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 flex-shrink-0 bg-[#163B65] flex-col fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-56 bg-[#163B65] flex flex-col h-full shadow-xl">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 lg:ml-56 flex flex-col min-h-screen">
        {/* Top header bar */}
        <header className="bg-white border-b border-[#E1E7ED] sticky top-0 z-20">
          {/* Government top-band */}
          <div className="bg-[#163B65] text-white text-[10px] py-1 px-4 flex items-center justify-between">
            <span className="opacity-70">Government of India — Ministry of Education · AICTE</span>
            <span className="opacity-50">Approval Process Handbook 2024–27</span>
          </div>

          {/* Main header row */}
          <div className="flex items-center gap-3 px-4 py-2.5">
            {/* Mobile hamburger */}
            <button
              className="lg:hidden p-1.5 rounded hover:bg-[#F0F3F6] text-[#5F6F82] transition-colors"
              onClick={() => setSidebarOpen(true)}
            >
              <Icon d={ICONS["menu"] ?? ""} size={18} />
            </button>

            {/* Breadcrumb */}
            <div className="flex-1 min-w-0">
              <nav className="flex items-center gap-1.5 text-[11px] text-[#8290A0]">
                <span>ApprovalFlow AI</span>
                <Icon d={ICONS["chevron"] ?? ""} size={10} className="opacity-40" />
                <span className="text-[#172B40] font-medium truncate">
                  {currentNav?.label ?? "Dashboard"}
                </span>
              </nav>
              <h1 className="text-[15px] font-semibold text-[#172B40] leading-tight mt-0.5">
                {currentNav?.label ?? "Dashboard"}
              </h1>
            </div>

            {/* Role badge */}
            {user && (
              <div className="hidden sm:flex items-center gap-2">
                <div className="text-right">
                  <p className="text-[11px] font-semibold text-[#172B40]">{user.name}</p>
                  <p className="text-[10px] text-[#8290A0]">{ROLE_LABEL[user.role] ?? user.role}</p>
                </div>
                <div className="h-7 w-7 rounded-full bg-[#163B65] flex items-center justify-center text-[11px] font-bold text-white">
                  {user.name.charAt(0)}
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1400px] w-full">
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="border-t border-[#E1E7ED] bg-white px-6 py-3 text-[11px] text-[#8290A0] flex items-center justify-between">
          <span>ApprovalFlow AI — AICTE Institutional Approval Portal</span>
          <span>Demo Mode · Data is simulated</span>
        </footer>
      </div>
    </div>
  );
}
