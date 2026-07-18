import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Calendar } from "lucide-react";
import { sessionAPI } from "../../api/index.js";
import {
  Card,
  Badge,
  LoadingScreen,
  ErrorAlert,
  EmptyState,
} from "../../components/ui/index.jsx";
import { formatDateTime } from "../../utils/helpers.js";
import { useRealtimeInvalidation } from "../../hooks/useRealtimeInvalidation.js";

export default function AdminSessions() {
  useRealtimeInvalidation();
  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-sessions"],
    queryFn: () => sessionAPI.getAll({ limit: 50 }),
  });

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorAlert message="Failed to load sessions" />;

  const sessions = data?.data?.data?.sessions || [];

  if (sessions.length === 0) {
    return (
      <EmptyState
        icon={Calendar}
        title="No sessions yet"
        description="Faculty can create attendance sessions."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {sessions.map((s) => (
        <Card key={s._id} className="p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-foreground">
                {s.course?.code} — {s.title}
              </p>
              <p className="text-xs text-muted-foreground">{s.course?.name}</p>
            </div>
            <Badge
              color={
                s.status === "active"
                  ? "green"
                  : s.status === "scheduled"
                    ? "blue"
                    : "gray"
              }
            >
              {s.status}
            </Badge>
          </div>
          <div className="mt-3 space-y-1 text-sm text-muted-foreground">
            <p>📅 {formatDateTime(s.date)}</p>
            <p>
              ⏰ {s.startTime} – {s.endTime}
            </p>
            <p>
              📍 {s.room}, {s.building}
            </p>
          </div>
          {s.status === "active" && (
            <Link
              to={`/faculty/sessions/${s._id}`}
              className="mt-3 inline-block text-sm font-medium text-primary hover:text-primary"
            >
              View live session →
            </Link>
          )}
        </Card>
      ))}
    </div>
  );
}
