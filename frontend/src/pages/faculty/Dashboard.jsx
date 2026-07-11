import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen, CalendarCheck, Users, Clock } from "lucide-react";
import { courseAPI, sessionAPI } from "../../api/index.js";
import { Card, StatCard, LoadingScreen } from "../../components/ui/index.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";

export default function FacultyDashboard() {
  const { user } = useAuth();

  const { data: courses } = useQuery({
    queryKey: ["faculty-courses"],
    queryFn: () => courseAPI.getMyCourses(),
  });

  const { data: today } = useQuery({
    queryKey: ["faculty-today"],
    queryFn: () => sessionAPI.getToday(),
  });

  const { data: active } = useQuery({
    queryKey: ["faculty-active"],
    queryFn: () => sessionAPI.getActive(),
  });

  if (!courses) return <LoadingScreen />;

  const myCourses = courses?.data?.data?.courses || [];
  const todaySessions = today?.data?.data?.sessions || [];
  const activeSessions = active?.data?.data?.sessions || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">
          Welcome, {user?.firstName}
        </h2>
        <p className="text-sm text-gray-500">Your teaching overview.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="My Courses"
          value={myCourses.length}
          icon={BookOpen}
          color="brand"
        />
        <StatCard
          title="Today's Sessions"
          value={todaySessions.length}
          icon={CalendarCheck}
          color="blue"
        />
        <StatCard
          title="Active Sessions"
          value={activeSessions.length}
          icon={Clock}
          color="green"
        />
        <StatCard
          title="Total Students"
          value={myCourses.reduce((sum, c) => sum + (c.enrolledCount || 0), 0)}
          icon={Users}
          color="yellow"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Active Sessions</h3>
          </div>
          {activeSessions.length === 0 ? (
            <p className="text-sm text-gray-400">
              No active sessions right now.
            </p>
          ) : (
            <div className="space-y-2">
              {activeSessions.map((s) => (
                <Link
                  key={s._id}
                  to={`/faculty/sessions/${s._id}`}
                  className="block rounded-xl border border-gray-200 px-4 py-3 hover:bg-gray-50"
                >
                  <p className="font-medium text-gray-900">
                    {s.course?.code} — {s.title}
                  </p>
                  <p className="text-xs text-gray-500">
                    {s.room}, {s.building}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 font-semibold text-gray-900">
            Today&apos;s Schedule
          </h3>
          {todaySessions.length === 0 ? (
            <p className="text-sm text-gray-400">
              No sessions scheduled for today.
            </p>
          ) : (
            <div className="space-y-2">
              {todaySessions.map((s) => (
                <div
                  key={s._id}
                  className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {s.course?.code} — {s.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {s.startTime} – {s.endTime}
                    </p>
                  </div>
                  <Link
                    to={`/faculty/sessions/${s._id}`}
                    className="text-sm font-medium text-brand-600"
                  >
                    Open →
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
