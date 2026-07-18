import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { reportAPI, courseAPI } from "../../api/index.js";
import {
  Card,
  Button,
  Select,
  LoadingScreen,
  ErrorAlert,
  DataTable,
  Badge,
} from "../../components/ui/index.jsx";
import { downloadBlob } from "../../utils/helpers.js";

export default function AdminReports() {
  const [courseId, setCourseId] = useState("");
  const [department, setDepartment] = useState("");

  const { data: courses } = useQuery({
    queryKey: ["courses-list"],
    queryFn: () => courseAPI.getAll({ limit: 100 }),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-report", { courseId, department }],
    queryFn: () => {
      if (courseId) return reportAPI.getCourseReport(courseId);
      if (department) return reportAPI.getDepartmentReport(department);
      return reportAPI.getLowAttendance({ threshold: 75 });
    },
  });

  const handleExport = async () => {
    try {
      const { data: blob } = await reportAPI.getLowAttendance({
        threshold: 75,
      });
      downloadBlob(blob, "low-attendance.csv");
    } catch {
      // ignore
    }
  };

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorAlert message="Failed to load report" />;

  const rows =
    data?.data?.data?.lowAttendance || data?.data?.data?.students || [];

  const columns = [
    {
      key: "student",
      header: "Student",
      render: (_, row) =>
        row.student?.fullName || row.student?.firstName || row._id,
    },
    {
      key: "course",
      header: "Course",
      render: (_, row) => row.course?.code || "—",
    },
    {
      key: "attendanceRate",
      header: "Attendance %",
      render: (_, row) => {
        const rate = row.attendanceRate ?? row.rate ?? 0;
        const color = rate >= 75 ? "green" : rate >= 60 ? "yellow" : "red";
        return (
          <span
            className={`font-medium text-${color === "green" ? "success" : color === "yellow" ? "warning" : "danger"}-600`}
          >
            {rate.toFixed(1)}%
          </span>
        );
      },
    },
    { key: "presentCount", header: "Present", render: (v) => v || 0 },
    { key: "totalCount", header: "Total", render: (v) => v || 0 },
    {
      key: "status",
      header: "Status",
      render: (_, row) => (
        <Badge color={row.flagged ? "red" : "gray"}>
          {row.flagged ? "Flagged" : "OK"}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={courseId}
          onChange={(e) => {
            setCourseId(e.target.value);
            setDepartment("");
          }}
          className="w-48"
        >
          <option value="">All Courses (Low Attendance)</option>
          {(courses?.data?.data?.courses || []).map((c) => (
            <option key={c._id} value={c._id}>
              {c.code} — {c.name}
            </option>
          ))}
        </Select>
        <Select
          value={department}
          onChange={(e) => {
            setDepartment(e.target.value);
            setCourseId("");
          }}
          className="w-48"
        >
          <option value="">All Departments</option>
          {[
            "Computer Science",
            "Mathematics",
            "Physics",
            "Chemistry",
            "Engineering",
          ].map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </Select>
        <Button variant="secondary" onClick={handleExport}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      <Card>
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-semibold text-foreground">Attendance Report</h3>
          <p className="text-xs text-muted-foreground">
            {courseId
              ? "Course report"
              : department
                ? "Department report"
                : "Students below 75% threshold"}
          </p>
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
