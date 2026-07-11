import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Play, Square, LocateFixed, Loader2 } from "lucide-react";
import { sessionAPI, courseAPI } from "../../api/index.js";
import {
  Card,
  Button,
  Modal,
  Input,
  LoadingScreen,
  ErrorAlert,
  Textarea,
  Badge,
} from "../../components/ui/index.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { useForm } from "react-hook-form";
import { formatDateTime } from "../../utils/helpers.js";

// Build local-date / local-time strings from the CURRENT clock so a session
// created via this form opens its attendance window immediately. (Previously
// the form used `new Date().toISOString().slice(0,10)`, which is UTC and can
// land on the wrong calendar day in non-UTC timezones — that made freshly
// created sessions appear "already closed" because the window was in the past.)
const pad = (n) => String(n).padStart(2, "0");
const localDateValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTimeValue = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const sessionDefaults = () => {
  const now = new Date();
  return {
    courseId: "",
    title: "",
    date: localDateValue(now),
    startTime: localTimeValue(now),
    endTime: localTimeValue(new Date(now.getTime() + 60 * 60 * 1000)),
    room: "",
    building: "",
    latitude: "",
    longitude: "",
    geofenceRadius: 100,
    allowLate: true,
    lateThreshold: 10,
  };
};

export default function FacultySessions() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: courses } = useQuery({
    queryKey: ["faculty-courses"],
    queryFn: () => courseAPI.getMyCourses(),
  });
  const { data, isLoading, error } = useQuery({
    queryKey: ["faculty-sessions"],
    queryFn: () => sessionAPI.getAll({ faculty: user._id, limit: 50 }),
  });

  const { register, handleSubmit, reset, setValue, watch } = useForm({
    defaultValues: sessionDefaults(),
  });

  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");
  const latVal = watch("latitude");
  const lngVal = watch("longitude");

  const fetchLocation = () => {
    setLocError("");
    if (!navigator.geolocation) {
      setLocError("Geolocation is not supported by this device.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setValue("latitude", pos.coords.latitude.toFixed(6), {
          shouldValidate: true,
        });
        setValue("longitude", pos.coords.longitude.toFixed(6), {
          shouldValidate: true,
        });
        setLocating(false);
      },
      (err) => {
        setLocError(
          err?.code === 1
            ? "Location permission denied. Allow access or enter coordinates manually."
            : err?.code === 3
              ? "Location request timed out. Try again."
              : "Could not get location.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const createMutation = useMutation({
    mutationFn: (payload) =>
      sessionAPI.create({
        courseId: payload.courseId,
        title: payload.title,
        description: payload.notes || undefined,
        date: payload.date,
        startTime: payload.startTime,
        endTime: payload.endTime,
        room: payload.room,
        location:
          payload.latitude !== "" && payload.longitude !== ""
            ? {
                coordinates: [
                  parseFloat(payload.longitude),
                  parseFloat(payload.latitude),
                ],
              }
            : undefined,
        geofenceRadius: parseInt(payload.geofenceRadius) || 100,
        settings: { lateThreshold: parseInt(payload.lateThreshold) || 15 },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(["faculty-sessions"]);
      setCreateOpen(false);
      reset();
      setLocError("");
    },
  });

  const startMutation = useMutation({
    mutationFn: (id) => sessionAPI.start(id),
    onSuccess: () => queryClient.invalidateQueries(["faculty-sessions"]),
  });

  const endMutation = useMutation({
    mutationFn: (id) => sessionAPI.end(id),
    onSuccess: () => queryClient.invalidateQueries(["faculty-sessions"]),
  });

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorAlert message="Failed to load sessions" />;

  const sessions = data?.data?.data?.sessions || [];
  const myCourses = courses?.data?.data?.courses || [];

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => {
            reset(sessionDefaults());
            setCreateOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> New Session
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sessions.map((s) => (
          <Card key={s._id} className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-gray-900">
                  {s.course?.code} — {s.title}
                </p>
                <p className="text-xs text-gray-500">{s.course?.name}</p>
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
            <div className="mt-3 space-y-1 text-sm text-gray-600">
              <p>📅 {formatDateTime(s.date)}</p>
              <p>
                ⏰ {s.startTime} – {s.endTime}
              </p>
              <p>
                📍 {s.room}, {s.building}
              </p>
            </div>
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigate(`/faculty/sessions/${s._id}`)}
              >
                Details
              </Button>
              {s.status === "scheduled" && (
                <Button size="sm" onClick={() => startMutation.mutate(s._id)}>
                  <Play className="h-3 w-3" /> Start
                </Button>
              )}
              {s.status === "active" && (
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => endMutation.mutate(s._id)}
                >
                  <Square className="h-3 w-3" /> End
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Attendance Session"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit((d) => createMutation.mutate(d))}
              disabled={createMutation.isLoading}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="label">Course</label>
            <select
              className="input"
              {...register("courseId", { required: "Required" })}
            >
              <option value="">Select course</option>
              {myCourses.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2">
            <Input
              label="Session Title"
              {...register("title", { required: "Required" })}
            />
          </div>
          <Input
            label="Date"
            type="date"
            {...register("date", { required: "Required" })}
          />
          <div />
          <Input
            label="Start Time"
            type="time"
            {...register("startTime", { required: "Required" })}
          />
          <Input
            label="End Time"
            type="time"
            {...register("endTime", { required: "Required" })}
          />
          <Input label="Room" {...register("room", { required: "Required" })} />
          <Input
            label="Building"
            {...register("building", { required: "Required" })}
          />
          <div className="col-span-2">
            <div className="flex items-center justify-between">
              <label className="label mb-0">Class Location</label>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={fetchLocation}
                disabled={locating}
              >
                {locating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <LocateFixed className="h-3 w-3" />
                )}
                {locating ? "Getting…" : "Get Location"}
              </Button>
            </div>
            {latVal && lngVal && (
              <p className="mt-1 text-xs text-success-600">
                📍 Captured: {latVal}, {lngVal}
              </p>
            )}
            {locError && (
              <p className="mt-1 text-xs text-danger-600">{locError}</p>
            )}
          </div>
          <Input
            label="Location Latitude"
            type="number"
            step="any"
            {...register("latitude", { required: "Required" })}
          />
          <Input
            label="Location Longitude"
            type="number"
            step="any"
            {...register("longitude", { required: "Required" })}
          />
          <Input
            label="Geofence Radius (m)"
            type="number"
            {...register("geofenceRadius")}
          />
          <Input
            label="Late Threshold (min)"
            type="number"
            {...register("lateThreshold")}
          />
          <div className="col-span-2">
            <Textarea label="Notes" {...register("notes")} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
