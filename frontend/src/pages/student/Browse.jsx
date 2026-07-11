import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, Plus, LogOut } from "lucide-react";
import { courseAPI } from "../../api/index.js";
import {
  Card,
  Button,
  LoadingScreen,
  ErrorAlert,
  Badge,
} from "../../components/ui/index.jsx";

export default function StudentBrowse() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["student-browse"],
    queryFn: () => courseAPI.browse(),
  });

  const enrollMutation = useMutation({
    mutationFn: (id) => courseAPI.enrollSelf(id),
    onSuccess: () => queryClient.invalidateQueries(["student-browse"]),
  });

  const unenrollMutation = useMutation({
    mutationFn: (id) => courseAPI.unenrollSelf(id),
    onSuccess: () => queryClient.invalidateQueries(["student-browse"]),
  });

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorAlert message="Failed to load courses" />;

  const courses = data?.data?.data?.courses || [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Browse Courses</h2>
        <p className="text-sm text-gray-500">
          Join the courses you're taking this term.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {courses.map((c) => (
          <Card key={c._id} className="flex flex-col p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <BookOpen className="h-5 w-5" />
            </div>
            <h3 className="mt-3 font-semibold text-gray-900">{c.code}</h3>
            <p className="text-sm text-gray-500">{c.name}</p>
            <p className="mt-1 text-xs text-gray-400">
              {c.department} · {c.program?.toUpperCase()} Y{c.year}S{c.semester}
            </p>
            <p className="mt-1 text-xs text-gray-400">
              {c.faculty
                ? `${c.faculty.firstName} ${c.faculty.lastName}`
                : "TBA"}
            </p>

            <div className="mt-4 flex items-center justify-between">
              <Badge color={c.enrolled ? "green" : "gray"}>
                {c.enrolled ? "Enrolled" : "Not enrolled"}
              </Badge>

              {c.enrolled ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => unenrollMutation.mutate(c._id)}
                  disabled={unenrollMutation.isLoading}
                >
                  <LogOut className="h-4 w-4" /> Leave
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={() => enrollMutation.mutate(c._id)}
                  disabled={enrollMutation.isLoading}
                >
                  <Plus className="h-4 w-4" /> Join
                </Button>
              )}
            </div>
          </Card>
        ))}
        {courses.length === 0 && (
          <p className="col-span-full text-center text-sm text-gray-400">
            No courses are open for enrollment yet.
          </p>
        )}
      </div>
    </div>
  );
}
