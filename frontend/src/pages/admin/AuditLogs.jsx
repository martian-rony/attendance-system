import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { reportAPI } from "../../api/index.js";
import {
  Card,
  Select,
  LoadingScreen,
  ErrorAlert,
  DataTable,
} from "../../components/ui/index.jsx";
import { formatDateTime } from "../../utils/helpers.js";

export default function AdminAudit() {
  const [action, setAction] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-logs", { action }],
    queryFn: () => reportAPI.getAuditLogs({ action, limit: 50 }),
  });

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorAlert message="Failed to load audit logs" />;

  const logs = data?.data?.data?.logs || [];

  const columns = [
    { key: "createdAt", header: "Time", render: (v) => formatDateTime(v) },
    {
      key: "action",
      header: "Action",
      render: (v) => <span className="font-mono text-xs">{v}</span>,
    },
    {
      key: "user",
      header: "User",
      render: (_, row) => row.user?.email || "system",
    },
    {
      key: "resource",
      header: "Resource",
      render: (_, row) => row.resource || "—",
    },
    { key: "ip", header: "IP", render: (_, row) => row.ipAddress || "—" },
    {
      key: "status",
      header: "Status",
      render: (v) => (v === "success" ? "✓" : "✗"),
    },
  ];

  return (
    <div className="space-y-4">
      <Select
        value={action}
        onChange={(e) => setAction(e.target.value)}
        className="w-56"
      >
        <option value="">All actions</option>
        <option value="login">Login</option>
        <option value="logout">Logout</option>
        <option value="create_user">Create User</option>
        <option value="mark_attendance">Mark Attendance</option>
        <option value="create_session">Create Session</option>
      </Select>

      <Card>
        <DataTable
          columns={columns}
          data={logs}
          loading={isLoading}
          emptyMessage="No audit logs"
        />
      </Card>
    </div>
  );
}
