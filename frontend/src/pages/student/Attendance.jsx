import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select } from "../../components/ui/index.jsx";
import { courseAPI, attendanceAPI } from "../../api/index.js";
import {
  Card,
  LoadingScreen,
  ErrorAlert,
  DataTable,
  Badge,
} from "../../components/ui/index.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { formatDateTime } from "../../utils/helpers.js";

export default function StudentAttendance() {
  const { user } = useAuth();
  const [courseId, setCourseId] = useState("");

  const { data: courses } = useQuery({
    queryKey: ["student-courses"],
    queryFn: () => courseAPI.getMyCourses(),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["student-attendance", courseId],
    queryFn: () =>
      attendanceAPI.getStudent(user._id, courseId ? { courseId } : {}),
  });

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorAlert message="Failed to load attendance" />;

  const records = data?.data?.data?.attendance || [];

  const columns = [
    {
      key: "session",
      header: "Session",
      render: (_, row) =>
        row.session?.title || row.session?.course?.code || "—",
    },
    {
      key: "course",
      header: "Course",
      render: (_, row) => row.session?.course?.code || "—",
    },
    {
      key: "date",
      header: "Date",
      render: (_, row) => formatDateTime(row.session?.date || row.date),
    },
    { key: "markedAt", header: "Marked At", render: (v) => formatDateTime(v) },
    {
      key: "status",
      header: "Status",
      render: (v) => (
        <Badge
          color={
            v === "present"
              ? "green"
              : v === "late"
                ? "yellow"
                : v === "excused"
                  ? "blue"
                  : "red"
          }
        >
          {v}
        </Badge>
      ),
    },
    { key: "method", header: "Method", render: (v) => v || "qr" },
  ];

  return (
    <div className="space-y-4">
      <Select
        value={courseId}
        onChange={(e) => setCourseId(e.target.value)}
        className="w-64"
      >
        <option value="">All Courses</option>
        {(courses?.data?.data?.courses || []).map((c) => (
          <option key={c._id} value={c._id}>
            {c.code} — {c.name}
          </option>
        ))}
      </Select>

      <Card>
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="font-semibold text-gray-900">
            My Attendance ({records.length})
          </h3>
        </div>
        <DataTable
          columns={columns}
          data={records}
          loading={isLoading}
          emptyMessage="No attendance records yet"
        />
      </Card>
    </div>
  );
}
