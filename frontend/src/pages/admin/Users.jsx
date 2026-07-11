import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, Search, UserX, UserCheck } from "lucide-react";
import { userAPI } from "../../api/index.js";
import {
  Card,
  Button,
  Input,
  Select,
  DataTable,
  Badge,
  Modal,
  LoadingScreen,
  ErrorAlert,
  Avatar,
} from "../../components/ui/index.jsx";
import { useAuth } from "../../contexts/AuthContext.jsx";

export default function AdminUsers() {
  const { user: currentUser } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [page, setPage] = useState(1);
  const [confirmDeactivate, setConfirmDeactivate] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["users", { search, role: roleFilter, page }],
    queryFn: () =>
      userAPI.getAll({ search, role: roleFilter, page, limit: 10 }),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id) => userAPI.deactivate(id),
    onSuccess: () => {
      queryClient.invalidateQueries(["users"]);
      setConfirmDeactivate(null);
    },
  });

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorAlert message="Failed to load users" />;

  const users = data?.data?.data?.users || [];
  const meta = data?.data?.data?.pagination || {};

  const columns = [
    {
      key: "name",
      header: "User",
      render: (_, row) => (
        <div className="flex items-center gap-3">
          <Avatar name={`${row.firstName} ${row.lastName}`} src={row.avatar} />
          <div>
            <p className="font-medium text-gray-900">
              {row.firstName} {row.lastName}
            </p>
            <p className="text-xs text-gray-500">{row.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (v) => (
        <Badge
          color={v === "admin" ? "blue" : v === "faculty" ? "yellow" : "green"}
        >
          {v}
        </Badge>
      ),
    },
    { key: "department", header: "Department" },
    {
      key: "isActive",
      header: "Status",
      render: (v) => (
        <Badge color={v ? "green" : "red"}>{v ? "Active" : "Inactive"}</Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (_, row) => (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => navigate(`/admin/users/${row._id}`)}
          >
            View
          </Button>
          {currentUser.role === "admin" &&
            row._id !== currentUser._id &&
            (row.isActive ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDeactivate(row)}
              >
                <UserX className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="sm" variant="ghost">
                <UserCheck className="h-4 w-4" />
              </Button>
            ))}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              className="pl-9"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-32"
          >
            <option value="">All roles</option>
            <option value="admin">Admin</option>
            <option value="faculty">Faculty</option>
            <option value="student">Student</option>
          </Select>
        </div>
        <Button onClick={() => navigate("/register")}>
          <Plus className="h-4 w-4" /> Add User
        </Button>
      </div>

      <Card>
        <DataTable
          columns={columns}
          data={users}
          loading={isLoading}
          emptyMessage="No users found"
        />
        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <p className="text-sm text-gray-500">
              Page {meta.page} of {meta.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Modal
        open={!!confirmDeactivate}
        onClose={() => setConfirmDeactivate(null)}
        title="Deactivate User"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmDeactivate(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => deactivateMutation.mutate(confirmDeactivate._id)}
            >
              Deactivate
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Are you sure you want to deactivate{" "}
          <span className="font-medium">
            {confirmDeactivate?.firstName} {confirmDeactivate?.lastName}
          </span>
          ? They will no longer be able to log in.
        </p>
      </Modal>
    </div>
  );
}
