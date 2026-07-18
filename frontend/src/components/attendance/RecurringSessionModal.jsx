import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarRange } from "lucide-react";
import { sessionAPI } from "../../api/index.js";
import { Button, Modal } from "../ui/index.jsx";
import { Input, Select } from "../ui/form.jsx";

const DAYS = [
  { v: 1, label: "Mon" },
  { v: 2, label: "Tue" },
  { v: 3, label: "Wed" },
  { v: 4, label: "Thu" },
  { v: 5, label: "Fri" },
  { v: 6, label: "Sat" },
  { v: 0, label: "Sun" },
];

/**
 * Faculty tool to create a weekly recurring series of sessions across a date
 * range. Backend generates one session per matching weekday; the auto
 * open/close scheduler then runs them hands-free.
 */
export function RecurringSessionModal({ open, onClose, courses }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    courseId: "",
    title: "",
    startTime: "09:00",
    endTime: "10:00",
    startDate: "",
    endDate: "",
  });
  const [days, setDays] = useState([1, 3, 5]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      sessionAPI.createRecurring({
        ...form,
        daysOfWeek: days,
      }),
    onSuccess: (res) => {
      setResult(res.data.data);
      queryClient.invalidateQueries({ queryKey: ["faculty-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
    onError: (err) =>
      setError(err.response?.data?.message || "Failed to create sessions"),
  });

  const toggleDay = (v) =>
    setDays((d) => (d.includes(v) ? d.filter((x) => x !== v) : [...d, v]));

  const submit = () => {
    setError("");
    if (!form.courseId) return setError("Select a course");
    if (!form.startDate || !form.endDate) return setError("Pick a date range");
    if (days.length === 0) return setError("Select at least one weekday");
    mutation.mutate();
  };

  const close = () => {
    setResult(null);
    setError("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Create recurring sessions"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={close}>
            Close
          </Button>
          <Button onClick={submit} disabled={mutation.isLoading}>
            <CalendarRange className="h-4 w-4" />
            {mutation.isLoading ? "Creating…" : "Generate series"}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Course
          </label>
          <Select
            value={form.courseId}
            onChange={(e) => setForm((f) => ({ ...f, courseId: e.target.value }))}
          >
            <option value="">Select a course…</option>
            {courses.map((c) => (
              <option key={c._id} value={c._id}>
                {c.code} — {c.name}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Title (optional)
          </label>
          <Input
            placeholder="Lecture"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Start time
            </label>
            <Input
              type="time"
              value={form.startTime}
              onChange={(e) =>
                setForm((f) => ({ ...f, startTime: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              End time
            </label>
            <Input
              type="time"
              value={form.endTime}
              onChange={(e) =>
                setForm((f) => ({ ...f, endTime: e.target.value }))
              }
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Repeat on
          </label>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d) => (
              <button
                key={d.v}
                type="button"
                onClick={() => toggleDay(d.v)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  days.includes(d.v)
                    ? "bg-brand-600 text-white"
                    : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              From
            </label>
            <Input
              type="date"
              value={form.startDate}
              onChange={(e) =>
                setForm((f) => ({ ...f, startDate: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              To
            </label>
            <Input
              type="date"
              value={form.endDate}
              onChange={(e) =>
                setForm((f) => ({ ...f, endDate: e.target.value }))
              }
            />
          </div>
        </div>

        {error && <p className="text-sm text-danger-600">{error}</p>}
        {result && (
          <div className="rounded-xl border border-success-200 bg-success-50 p-3 text-sm text-success-700">
            Created {result.count} sessions. They will auto-open and auto-close
            on schedule.
          </div>
        )}
      </div>
    </Modal>
  );
}
