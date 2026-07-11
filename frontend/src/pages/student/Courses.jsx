import { useQuery } from "@tanstack/react-query";
import { BookOpen, Users } from "lucide-react";
import { courseAPI } from "../../api/index.js";
import { Card, LoadingScreen, ErrorAlert } from "../../components/ui/index.jsx";

export default function StudentCourses() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["student-courses-list"],
    queryFn: () => courseAPI.getMyCourses(),
  });

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorAlert message="Failed to load courses" />;

  const courses = data?.data?.data?.courses || [];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {courses.map((c) => (
        <Card key={c._id} className="p-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
            <BookOpen className="h-5 w-5" />
          </div>
          <h3 className="mt-3 font-semibold text-gray-900">{c.code}</h3>
          <p className="text-sm text-gray-500">{c.name}</p>
          <p className="mt-1 text-xs text-gray-400">
            {c.department} · {c.program?.toUpperCase()} Y{c.year}S{c.semester}
          </p>
          <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" /> {c.enrolledCount || 0} students
            </span>
            <span className="font-medium text-gray-900">{c.credits} cr</span>
          </div>
        </Card>
      ))}
      {courses.length === 0 && (
        <p className="col-span-full text-center text-sm text-gray-400">
          You are not enrolled in any courses.
        </p>
      )}
    </div>
  );
}
