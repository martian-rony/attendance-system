import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Select } from "../../components/ui/index.jsx";
import { courseAPI, reportAPI } from "../../api/index.js";
import {
  Card,
  LoadingScreen,
  ErrorAlert,
  DataTable,
} from "../../components/ui/index.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";

export default function FacultyReports() {
  const { user } = useAuth();
  const [courseId, setCourseId] = useState("");

  const { data: courses } = useQuery({
    queryKey: ["faculty-courses"],
    queryFn: () => courseAPI.getMyCourses(),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["faculty-report", courseId],
    queryFn: () =>
      courseId
        ? reportAPI.getCourseReport(courseId)
        : reportAPI.getFacultyReport(user._id),
  });

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorAlert message="Failed to load report" />;

  const rows = data?.data?.data?.students || data?.data?.data?.report || [];

  const columns = [
    {
      key: "student",
      header: "Student",
      render: (_, row) => row.student?.fullName || row.studentName || row._id,
    },
    {
      key: "course",
      header: "Course",
      render: (_, row) => row.course?.code || "All",
    },
    {
      key: "attendanceRate",
      header: "Attendance %",
      render: (_, row) => {
        const rate = row.attendanceRate ?? 0;
        return (
          <span
            className={
              rate >= 75
                ? "text-success-600"
                : rate >= 60
                  ? "text-warning-600"
                  : "text-danger-600"
            }
          >
            {rate.toFixed(1)}%
          </span>
        );
      },
    },
    { key: "presentCount", header: "Present", render: (v) => v || 0 },
    { key: "absentCount", header: "Absent", render: (v) => v || 0 },
    { key: "lateCount", header: "Late", render: (v) => v || 0 },
  ];

  return (
    <div className="space-y-4">
      <Select
        value={courseId}
        onChange={(e) => setCourseId(e.target.value)}
        className="w-64"
      >
        <option value="">All My Courses</option>
        {(courses?.data?.data?.courses || []).map((c) => (
          <option key={c._id} value={c._id}>
            {c.code} — {c.name}
          </option>
        ))}
      </Select>

      <Card>
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="font-semibold text-gray-900">Attendance Report</h3>
        </div>
        <DataTable
          columns={columns}
          data={rows}
          loading={isLoading}
          emptyMessage="No records"
        />
      </Card>
    </div>
  );
}
