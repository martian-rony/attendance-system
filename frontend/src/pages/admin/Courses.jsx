import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { courseAPI } from "../../api/index.js";
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
  Textarea,
} from "../../components/ui/index.jsx";
import { useForm } from "react-hook-form";

export default function AdminCourses() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["courses", { search }],
    queryFn: () => courseAPI.getAll({ search }),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    defaultValues: {
      code: "",
      name: "",
      department: "",
      program: "btech",
      year: 1,
      semester: 1,
      credits: 3,
      description: "",
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload) => courseAPI.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries(["courses"]);
      setCreateOpen(false);
      reset();
    },
  });

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorAlert message="Failed to load courses" />;

  const courses = data?.data?.data?.courses || [];

  const columns = [
    {
      key: "code",
      header: "Code",
      render: (v) => <span className="font-mono text-sm font-medium">{v}</span>,
    },
    { key: "name", header: "Name" },
    { key: "department", header: "Department" },
    { key: "program", header: "Program", render: (v) => v?.toUpperCase() },
    { key: "credits", header: "Credits" },
    {
      key: "isActive",
      header: "Status",
      render: (v) => (
        <Badge color={v ? "green" : "red"}>{v ? "Active" : "Inactive"}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (_, row) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => navigate(`/admin/reports?course=${row._id}`)}
        >
          Report
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Input
          className="max-w-xs"
          placeholder="Search courses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New Course
        </Button>
      </div>

      <Card>
        <DataTable
          columns={columns}
          data={courses}
          loading={isLoading}
          emptyMessage="No courses found"
        />
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Course"
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
          <Input
            label="Course Code"
            error={errors.code?.message}
            {...register("code", { required: "Required" })}
          />
          <Input
            label="Course Name"
            error={errors.name?.message}
            {...register("name", { required: "Required" })}
          />
          <Input
            label="Department"
            error={errors.department?.message}
            {...register("department", { required: "Required" })}
          />
          <Select label="Program" {...register("program")}>
            <option value="btech">BTech</option>
            <option value="mtech">MTech</option>
            <option value="mba">MBA</option>
            <option value="bsc">BSc</option>
            <option value="msc">MSc</option>
            <option value="phd">PhD</option>
          </Select>
          <Select label="Year" {...register("year", { valueAsNumber: true })}>
            {[1, 2, 3, 4, 5].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
          <Select
            label="Semester"
            {...register("semester", { valueAsNumber: true })}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
          <Input
            label="Credits"
            type="number"
            {...register("credits", { valueAsNumber: true })}
          />
          <div className="col-span-2">
            <Textarea label="Description" {...register("description")} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
