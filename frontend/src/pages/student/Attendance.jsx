import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Select } from "../../components/ui/index.jsx";
import { courseAPI, attendanceAPI, correctionAPI } from "../../api/index.js";
import {
  Card,
  LoadingScreen,
  ErrorAlert,
  DataTable,
  Badge,
  Button,
  Modal,
} from "../../components/ui/index.jsx";
import { Textarea, Select as FormSelect, Input } from "../../components/ui/form.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { formatDateTime } from "../../utils/helpers.js";

export default function StudentAttendance() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [courseId, setCourseId] = useState("");
  const [dispute, setDispute] = useState(null); // the row being disputed
  const [form, setForm] = useState({
    requestedStatus: "present",
    reason: "",
    evidenceUrl: "",
  });
  const [formError, setFormError] = useState("");

  const { data: courses } = useQuery({
    queryKey: ["student-courses"],
    queryFn: () => courseAPI.getMyCourses(),
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["student-attendance", courseId],
    queryFn: () =>
      attendanceAPI.getStudent(user._id, courseId ? { courseId } : {}),
  });

  const createMutation = useMutation({
    mutationFn: (payload) => correctionAPI.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-attendance"] });
      closeDispute();
    },
    onError: (err) => {
      setFormError(
        err.response?.data?.message || "Failed to submit correction request",
      );
    },
  });

  const openDispute = (row) => {
    setDispute(row);
    setForm({ requestedStatus: "present", reason: "", evidenceUrl: "" });
    setFormError("");
  };
  const closeDispute = () => setDispute(null);

  const submitDispute = () => {
    setFormError("");
    if (!form.reason || form.reason.trim().length < 5) {
      setFormError("Please give a reason (at least 5 characters).");
      return;
    }
    const sessionId = dispute?.session?._id || dispute?.session;
    createMutation.mutate({
      sessionId,
      requestedStatus: form.requestedStatus,
      reason: form.reason.trim(),
      ...(form.evidenceUrl.trim()
        ? { evidenceUrl: form.evidenceUrl.trim() }
        : {}),
    });
  };

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
    {
      key: "actions",
      header: "",
      render: (_, row) =>
        row.session ? (
          <Button size="sm" variant="secondary" onClick={() => openDispute(row)}>
            Dispute
          </Button>
        ) : null,
    },
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
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-semibold text-foreground">
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

      <Modal
        open={!!dispute}
        onClose={closeDispute}
        title="Request attendance correction"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={closeDispute}>
              Cancel
            </Button>
            <Button
              onClick={submitDispute}
              disabled={createMutation.isLoading}
            >
              {createMutation.isLoading ? "Submitting…" : "Submit request"}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {dispute?.session?.title || "This session"} — current status:{" "}
            <span className="font-medium">{dispute?.status}</span>
          </p>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Requested status
            </label>
            <FormSelect
              value={form.requestedStatus}
              onChange={(e) =>
                setForm((f) => ({ ...f, requestedStatus: e.target.value }))
              }
            >
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="excused">Excused</option>
            </FormSelect>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Reason
            </label>
            <Textarea
              rows={3}
              placeholder="Explain why this record should be corrected…"
              value={form.reason}
              onChange={(e) =>
                setForm((f) => ({ ...f, reason: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Evidence URL (optional)
            </label>
            <Input
              placeholder="https://…"
              value={form.evidenceUrl}
              onChange={(e) =>
                setForm((f) => ({ ...f, evidenceUrl: e.target.value }))
              }
            />
          </div>
          {formError && <p className="text-sm text-destructive">{formError}</p>}
        </div>
      </Modal>
    </div>
  );
}
