// ApprovalFlow AI — Main Authenticated Layout
// Route: /demo/approvalflow  (shell for all sub-pages)
import { createFileRoute, Link, Outlet, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { getCurrentDemoUser, signOutDemoUser, DEMO_USERS } from "@/lib/supabase";
import { afStore, storeEvents } from "@/lib/approval-flow";
import { notifStore, type AppNotification } from "@/lib/notifications";
import { useDemoRole } from "@/lib/demo-role-store";

export const Route = createFileRoute("/demo/approvalflow")({
  ssr: false,
  head: () => ({ meta: [{ title: "ApprovalFlow AI — AICTE Regulatory Portal" }] }),
  component: ApprovalFlowLayout,
});

// ── Lucide-style icon paths (inline SVG to avoid extra dep) ──────────────────
function Icon({ d, size = 16, className = "" }: { d: string; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={d} />
    </svg>
  );
}

const ICONS: Record<string, string> = {
  applications:
    "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  scrutiny:
    "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  evc: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  compliance: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  admin:
    "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  logout:
    "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 18L18 6M6 6l12 12",
  chevron: "M9 5l7 7-7 7",
  bell: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  check: "M5 13l4 4L19 7",
  filter:
    "M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z",
};

const NAV_ITEMS = [
  { path: "/demo/approvalflow/applications", label: "Applications", icon: "applications" },
  { path: "/demo/approvalflow/scrutiny", label: "Scrutiny & Verification", icon: "scrutiny" },
  { path: "/demo/approvalflow/evc", label: "EVC Scheduler", icon: "evc" },
  { path: "/demo/approvalflow/compliance", label: "Compliance Monitoring", icon: "compliance" },
  { path: "/demo/approvalflow/admin", label: "Admin Report", icon: "admin" },
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
      <p className="text-xs font-semibold uppercase tracking-widest text-[#E99A35] mb-1">
        {kicker}
      </p>
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

function NotificationCenter({
  userRole,
  userId,
}: {
  userRole: string | null;
  userId?: string | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>("ALL");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Re-render when store events fire
  const [, setTick] = useState(0);
  useEffect(() => {
    const unsub = storeEvents.subscribe(() => setTick((t) => t + 1));
    return unsub;
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const allUserNotifs = notifStore.getNotificationsForUser(userRole, userId);
  const unreadCount = allUserNotifs.filter((n) => !n.read).length;

  const filteredNotifs = allUserNotifs.filter((n) => {
    if (onlyUnread && n.read) return false;
    if (filterType === "ALL") return true;
    if (filterType === "SLA") return n.type === "SLA_APPROACHING" || n.type === "SLA_OVERDUE";
    if (filterType === "ESCALATION") return n.type === "APP_ESCALATED";
    if (filterType === "STAGE") return n.type === "STAGE_FORWARDED" || n.type === "APP_SUBMITTED";
    if (filterType === "COMPLIANCE")
      return n.type === "DEFICIENCY_RAISED" || n.type === "COMPLIANCE_REQUIRED";
    return true;
  });

  const getPriorityBadge = (priority: string) => {
    if (priority === "critical")
      return (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-800 border border-red-300">
          CRITICAL
        </span>
      );
    if (priority === "high")
      return (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
          HIGH
        </span>
      );
    if (priority === "medium")
      return (
        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
          MEDIUM
        </span>
      );
    return (
      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
        INFO
      </span>
    );
  };

  const handleSelectNotif = (notif: AppNotification) => {
    notifStore.markAsRead(notif.id);
    setOpen(false);
    if (notif.route) {
      navigate({ to: notif.route });
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-full hover:bg-[#F0F3F6] text-[#5F6F82] transition-colors focus:outline-none"
        title="Notifications"
        aria-label="Notification Centre"
      >
        <Icon d={ICONS["bell"] || ""} size={18} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 min-w-[17px] h-[17px] rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center px-1 border-2 border-white animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown Panel */}
      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-lg shadow-xl border border-[#E1E7ED] z-50 overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 bg-[#163B65] text-white flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Icon d={ICONS["bell"] || ""} size={14} className="text-[#E99A35]" />
                <h3 className="text-[13px] font-bold tracking-tight">Notification Centre</h3>
              </div>
              <p className="text-[10px] text-white/60 mt-0.5">
                In-app prototype notifications · {allUserNotifs.length} total
              </p>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={() => notifStore.markAllAsRead(userRole, userId)}
                className="text-[11px] text-[#E99A35] hover:text-white transition-colors underline font-medium"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Filter Bar */}
          <div className="p-2 border-b border-[#E1E7ED] bg-[#F5F7FA] flex items-center justify-between gap-1 text-[11px]">
            <div className="flex items-center gap-1 overflow-x-auto py-0.5">
              {(["ALL", "SLA", "ESCALATION", "STAGE", "COMPLIANCE"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                    filterType === t
                      ? "bg-[#163B65] text-white"
                      : "bg-white text-[#5F6F82] border border-[#E1E7ED] hover:bg-[#EEF3F8]"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1 text-[10px] text-[#5F6F82] shrink-0 cursor-pointer pl-1">
              <input
                type="checkbox"
                checked={onlyUnread}
                onChange={(e) => setOnlyUnread(e.target.checked)}
                className="rounded border-[#D5DDE6] text-[#163B65] text-[10px]"
              />
              <span>Unread</span>
            </label>
          </div>

          {/* Notifications List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-[#E1E7ED]">
            {filteredNotifs.length === 0 ? (
              <div className="py-12 text-center text-[#8290A0]">
                <Icon
                  d={ICONS["check"] || ""}
                  size={24}
                  className="mx-auto mb-2 opacity-40 text-green-600"
                />
                <p className="text-[12px] font-medium text-[#172B40]">All caught up!</p>
                <p className="text-[11px] mt-0.5">No notifications match your current filters.</p>
              </div>
            ) : (
              filteredNotifs.map((n) => (
                <div
                  key={n.id}
                  onClick={() => handleSelectNotif(n)}
                  className={`p-3 transition-colors cursor-pointer text-left hover:bg-[#F8FAFC] flex gap-2.5 items-start ${
                    !n.read ? "bg-blue-50/40" : ""
                  }`}
                >
                  {/* Unread dot */}
                  <div className="mt-1 shrink-0">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        !n.read ? "bg-[#E99A35]" : "bg-transparent"
                      }`}
                    />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[11px] font-semibold text-[#172B40] truncate">
                        {n.title}
                      </span>
                      {getPriorityBadge(n.priority)}
                    </div>
                    <p className="text-[11px] text-[#5F6F82] line-clamp-2 leading-relaxed">
                      {n.description}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-[#8290A0] mt-1.5 pt-1 border-t border-[#E1E7ED]/50">
                      <span className="font-mono bg-[#E1E7ED]/50 px-1 rounded text-[#163B65]">
                        {n.appId}
                      </span>
                      <span>
                        {new Date(n.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer note */}
          <div className="px-3 py-1.5 bg-[#F5F7FA] border-t border-[#E1E7ED] text-[10px] text-[#8290A0] flex items-center justify-between">
            <span>Prototype in-app alerts</span>
            <span>External delivery pending</span>
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalFlowLayout() {
  const [role] = useDemoRole();
  const roleStr = role as string | null;
  const isInstitution = roleStr === "institution";
  const user = getCurrentDemoUser();
  
  const computeStats = () => {
    const u = getCurrentDemoUser();
    const instId = isInstitution
      ? ((u as { institutionId?: string } | null)?.institutionId || "inst-1")
      : undefined;
    return afStore.getStats(instId);
  };

  const [stats, setStats] = useState(computeStats);
  const router = useRouterState();
  const currentPath = router.location.pathname;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setStats(computeStats());
  }, [roleStr, isInstitution]);

  useEffect(() => {
    const unsub = storeEvents.subscribe(() => setStats(computeStats()));
    return unsub;
  }, [isInstitution]);

  const handleLogout = async () => {
    await signOutDemoUser();
    window.location.href = "/demo/login";
  };

  // Role-based nav filtering (role is typed as Role | null from workflow.ts but actually holds demo strings)
  const visibleNav = NAV_ITEMS.filter((n) => {
    if (roleStr === "institution") {
      return (
        n.path === "/demo/approvalflow/applications" ||
        n.path === "/demo/approvalflow/compliance"
      );
    }
    return true;
  });

  // Current page label for breadcrumb
  const currentNav = visibleNav.find(
    (n) => currentPath === n.path || currentPath.startsWith(n.path),
  );

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo / portal name */}
      <div className="px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-lg bg-[#E99A35] flex items-center justify-center flex-shrink-0 shadow">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r="8" stroke="white" strokeWidth="1.8" fill="none" />
              <path d="M10 4v12M4 10h12" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="10" cy="10" r="2.5" fill="white" />
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
          {(isInstitution
            ? [
                { label: "Pending", value: stats.pending, color: "text-amber-300" },
                { label: "Action Needed", value: stats.overdue, color: "text-red-400" },
                { label: "Approved", value: stats.approved, color: "text-green-400" },
                { label: "My Apps", value: stats.total, color: "text-white" },
              ]
            : [
                { label: "Pending", value: stats.pending, color: "text-amber-300" },
                { label: "Overdue", value: stats.overdue, color: "text-red-400" },
                { label: "Approved", value: stats.approved, color: "text-green-400" },
                { label: "Total", value: stats.total, color: "text-white" },
              ]
          ).map((s) => (
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
        {visibleNav.map((item) => {
          const isActive = currentPath === item.path || currentPath.startsWith(item.path);
          const badge =
            item.icon === "scrutiny"
              ? (stats.byStage?.Scrutiny ?? 0)
              : item.icon === "evc"
                ? (stats.byStage?.EVC ?? 0)
                : 0;
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
              <p className="text-[10px] text-white/40 truncate">
                {ROLE_LABEL[user.role] ?? user.role}
              </p>
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
          <Link to="/demo/login" className="text-xs text-[#E99A35] hover:underline">
            Sign in →
          </Link>
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

            {/* Notification Center */}
            <NotificationCenter userRole={roleStr} userId={user?.id} />

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
