import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Square, RefreshCw, Users } from "lucide-react";
import { sessionAPI, attendanceAPI } from "../../api/index.js";
import {
  Card,
  Button,
  Badge,
  LoadingScreen,
  ErrorAlert,
} from "../../components/ui/index.jsx";
import { QRDisplay } from "../../components/attendance/QRDisplay.jsx";
import { useSocket } from "../../contexts/SocketContext.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { formatDateTime } from "../../utils/helpers.js";

export default function FacultySessionDetail() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const { on, connected, joinRoom } = useSocket();
  const { user } = useAuth();
  const canControl = user?.role === "faculty" || user?.role === "admin";
  const [liveAttendance, setLiveAttendance] = useState([]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["session-detail", id],
    queryFn: () => sessionAPI.getById(id),
  });

  const { data: attendance } = useQuery({
    queryKey: ["session-attendance", id],
    queryFn: () => attendanceAPI.getSession(id),
  });

  // Join session room + listen for live updates
  useEffect(() => {
    if (!connected || !id) return;
    joinRoom(`session:${id}`);
    const offMarked = on("attendance:marked", (payload) => {
      queryClient.invalidateQueries(["session-attendance", id]);
      setLiveAttendance((prev) => [payload, ...prev].slice(0, 20));
    });
    const offStarted = on("session:started", () =>
      queryClient.invalidateQueries(["session-detail", id]),
    );
    const offEnded = on("session:ended", () =>
      queryClient.invalidateQueries(["session-detail", id]),
    );
    return () => {
      offMarked();
      offStarted();
      offEnded();
    };
  }, [connected, id, on, joinRoom, queryClient]);

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorAlert message="Failed to load session" />;

  const session = data?.data?.data?.session || {};
  const records = attendance?.data?.data?.attendance || liveAttendance;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left: QR + info */}
      <div className="space-y-4 lg:col-span-1">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-foreground">{session.title}</h3>
            <Badge
              color={
                session.status === "active"
                  ? "green"
                  : session.status === "scheduled"
                    ? "blue"
                    : "gray"
              }
            >
              {session.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {session.course?.code} — {session.course?.name}
          </p>
          <div className="mt-3 space-y-1 text-sm text-muted-foreground">
            <p>📅 {formatDateTime(session.date)}</p>
            <p>
              ⏰ {session.startTime} – {session.endTime}
            </p>
            <p>
              📍 {session.room}, {session.building}
            </p>
          </div>
          <div className="mt-4 flex gap-2">
            {canControl && session.status === "scheduled" && (
              <Button
                size="sm"
                onClick={async () => {
                  await sessionAPI.start(id);
                  queryClient.invalidateQueries(["session-detail", id]);
                }}
              >
                <Play className="h-3 w-3" /> Start
              </Button>
            )}
            {canControl && session.status === "active" && (
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  await sessionAPI.end(id);
                  queryClient.invalidateQueries(["session-detail", id]);
                }}
              >
                <Square className="h-3 w-3" /> End
              </Button>
            )}
          </div>
        </Card>

        {session.status === "active" || session.status === "scheduled" ? (
          <Card className="p-5">
            <h3 className="mb-3 text-center font-semibold text-foreground">
              Scan to Mark Attendance
            </h3>
            <QRDisplay sessionId={id} />
            <p className="mt-3 text-center text-xs text-muted-foreground/70">
              Students scan this QR within the geofence to mark attendance.
            </p>
          </Card>
        ) : (
          <Card className="p-5 text-center text-sm text-muted-foreground/70">
            Session ended. QR no longer active.
          </Card>
        )}
      </div>

      {/* Right: attendance list */}
      <div className="lg:col-span-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold text-foreground">
              <Users className="h-5 w-5" /> Attendance ({records.length})
            </h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                queryClient.invalidateQueries(["session-attendance", id])
              }
            >
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted/40">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">
                    Student
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">
                    Time
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase text-muted-foreground">
                    Method
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.map((r, i) => (
                  <tr
                    key={r._id || r.attendanceId || i}
                    className="animate-fade-in"
                  >
                    <td className="px-4 py-2 text-sm text-foreground">
                      {r.studentName ||
                        r.student?.fullName ||
                        r.student?.firstName ||
                        "—"}
                    </td>
                    <td className="px-4 py-2 text-sm text-muted-foreground">
                      {formatDateTime(r.markedAt || r.timestamp)}
                    </td>
                    <td className="px-4 py-2">
                      <Badge
                        color={
                          r.status === "present"
                            ? "green"
                            : r.status === "late"
                              ? "yellow"
                              : "red"
                        }
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-sm text-muted-foreground">
                      {r.method || "qr"}
                    </td>
                  </tr>
                ))}
                {records.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-8 text-center text-sm text-muted-foreground/70"
                    >
                      No attendance marked yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
