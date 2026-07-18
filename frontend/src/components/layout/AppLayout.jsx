import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  CalendarDays,
  BarChart3,
  FileText,
  Search,
  ClipboardCheck,
  ScanLine,
  LogOut,
  Menu,
  GraduationCap,
} from "lucide-react";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { cn, getInitials } from "../../utils/helpers.js";
import { useSocket } from "../../contexts/SocketContext.jsx";
import { NotificationBell } from "./NotificationBell.jsx";
import { ThemeToggle } from "../theme-toggle.jsx";
import { Button } from "../ui/button.jsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu.jsx";
import { Avatar, AvatarFallback } from "../ui/avatar.jsx";
import { Separator } from "../ui/separator.jsx";

const ICONS = {
  Dashboard: LayoutDashboard,
  Users,
  Courses: BookOpen,
  Sessions: CalendarDays,
  Reports: BarChart3,
  "Audit Logs": FileText,
  "Browse Courses": Search,
  "My Attendance": ClipboardCheck,
  "Mark Attendance": ScanLine,
  Corrections: FileText,
};

const NAV = {
  admin: [
    { to: "/admin", label: "Dashboard" },
    { to: "/admin/users", label: "Users" },
    { to: "/admin/courses", label: "Courses" },
    { to: "/admin/sessions", label: "Sessions" },
    { to: "/admin/reports", label: "Reports" },
    { to: "/admin/audit", label: "Audit Logs" },
  ],
  faculty: [
    { to: "/faculty", label: "Dashboard" },
    { to: "/faculty/courses", label: "My Courses" },
    { to: "/faculty/sessions", label: "Sessions" },
    { to: "/faculty/reports", label: "Reports" },
    { to: "/faculty/corrections", label: "Corrections" },
  ],
  student: [
    { to: "/student", label: "Dashboard" },
    { to: "/student/courses", label: "My Courses" },
    { to: "/student/browse", label: "Browse Courses" },
    { to: "/student/attendance", label: "My Attendance" },
    { to: "/student/scan", label: "Mark Attendance" },
  ],
};

export function AppLayout({ role, title, children }) {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const nav = NAV[role] || [];

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="flex h-screen overflow-hidden bg-muted/30">
      {/* Mobile sidebar (Sheet-style overlay) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-card transition-transform duration-200 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-2.5 border-b px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            AS
          </div>
          <span className="text-base font-semibold tracking-tight">
            Attendance
          </span>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {nav.map((item) => {
            const ItemIcon = ICONS[item.label] || LayoutDashboard;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === `/${role}`}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )
                }
              >
                <ItemIcon className="h-[18px] w-[18px]" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3">
          <Separator className="mb-3" />
          <div className="flex items-center gap-3 rounded-lg px-2 py-1.5">
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary/10 text-primary">
                {getInitials(user?.firstName, user?.lastName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="truncate text-xs capitalize text-muted-foreground">
                {user?.role}
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card px-6">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <span
              className={cn(
                "hidden items-center gap-1.5 text-xs font-medium sm:flex",
                connected ? "text-success" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  connected ? "bg-success" : "bg-muted-foreground/40",
                )}
              />
              {connected ? "Live" : "Offline"}
            </span>
            <ThemeToggle />
            <NotificationBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Account">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-xs text-primary">
                      {getInitials(user?.firstName, user?.lastName)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  {user?.firstName} {user?.lastName}
                  <div className="text-xs font-normal capitalize text-muted-foreground">
                    {user?.role}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={handleLogout}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
