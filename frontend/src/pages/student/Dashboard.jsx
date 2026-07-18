import { useQuery } from "@tanstack/react-query";
import { courseAPI, sessionAPI, attendanceAPI } from "../../api/index.js";
import {
  Card,
  StatCard,
  LoadingScreen,
  Badge,
} from "../../components/ui/index.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { formatDateTime } from "../../utils/helpers.js";

export default function StudentDashboard() {
  const { user } = useAuth();

  const { data: courses } = useQuery({
    queryKey: ["student-courses"],
    queryFn: () => courseAPI.getMyCourses(),
  });

  const { data: active } = useQuery({
    queryKey: ["student-active"],
    queryFn: () => sessionAPI.getActive(),
  });

  const { data: attendance } = useQuery({
    queryKey: ["student-summary", user._id],
    queryFn: () => studentSummary(user._id),
  });

  if (!courses) return <LoadingScreen />;

  const myCourses = courses?.data?.data?.courses || [];
  const activeSessions = active?.data?.data?.sessions || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground">
          Hi, {user?.firstName}
        </h2>
        <p className="text-sm text-muted-foreground">
          {user?.program?.toUpperCase()} — Year {user?.year}, Semester{" "}
          {user?.semester}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Enrolled Courses"
          value={myCourses.length}
          color="brand"
        />
        <StatCard
          title="Active Sessions"
          value={activeSessions.length}
          color="green"
        />
        <StatCard
          title="Overall Attendance"
          value={attendance?.rate ? `${attendance.rate.toFixed(1)}%` : "—"}
          color={attendance?.rate >= 75 ? "green" : "yellow"}
        />
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-foreground">
            Open Sessions — Mark Now
          </h3>
        </div>
        {activeSessions.length === 0 ? (
          <p className="text-sm text-muted-foreground/70">
            No active sessions right now. Check back during class.
          </p>
        ) : (
          <div className="space-y-2">
            {activeSessions.map((s) => (
              <div
                key={s._id}
                className="flex items-center justify-between rounded-xl border border-border px-4 py-3"
              >
                <div>
                  <p className="font-medium text-foreground">
                    {s.course?.code} — {s.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.room}, {s.building} · {formatDateTime(s.date)}
                  </p>
                </div>
                <Badge color="green">{s.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

async function studentSummary(studentId) {
  const { data } = await attendanceAPI.getSummary({ studentId });
  return data?.data?.data || {};
}
