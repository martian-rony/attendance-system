import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Users, BookOpen, CalendarCheck, ClipboardList } from "lucide-react";
import { reportAPI } from "../../api/index.js";
import {
  Card,
  StatCard,
  LoadingScreen,
  ErrorAlert,
} from "../../components/ui/index.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";

export default function AdminDashboard() {
  const { user } = useAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => reportAPI.getOverview(),
  });

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorAlert message="Failed to load dashboard data" />;

  const stats = data?.data?.data || {};

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">
          Welcome back, {user?.firstName}
        </h2>
        <p className="text-sm text-gray-500">
          System overview and quick stats.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Users"
          value={stats.totalUsers || 0}
          icon={Users}
          color="brand"
          subtitle={`${stats.activeUsers || 0} active`}
        />
        <StatCard
          title="Faculty"
          value={stats.totalFaculty || 0}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Students"
          value={stats.totalStudents || 0}
          icon={Users}
          color="green"
        />
        <StatCard
          title="Courses"
          value={stats.totalCourses || 0}
          icon={BookOpen}
          color="yellow"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Sessions"
          value={stats.totalSessions || 0}
          icon={CalendarCheck}
          color="brand"
        />
        <StatCard
          title="Total Attendance Records"
          value={stats.totalAttendance || 0}
          icon={ClipboardList}
          color="blue"
        />
        <Card className="flex items-center justify-between p-5">
          <div>
            <p className="text-sm font-medium text-gray-500">
              Avg Attendance Rate
            </p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {stats.avgAttendanceRate
                ? `${stats.avgAttendanceRate.toFixed(1)}%`
                : "—"}
            </p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-3 font-semibold text-gray-900">Quick Actions</h3>
          <div className="space-y-2">
            <Link
              to="/admin/users"
              className="block rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Manage Users →
            </Link>
            <Link
              to="/admin/courses"
              className="block rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Manage Courses →
            </Link>
            <Link
              to="/admin/reports"
              className="block rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              View Reports →
            </Link>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 font-semibold text-gray-900">
            Department Breakdown
          </h3>
          <div className="space-y-2">
            {(stats.departmentStats || []).map((d) => (
              <div
                key={d._id}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-gray-600">{d._id}</span>
                <span className="font-medium text-gray-900">
                  {d.count} students
                </span>
              </div>
            ))}
            {(!stats.departmentStats || stats.departmentStats.length === 0) && (
              <p className="text-sm text-gray-400">No data available</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
