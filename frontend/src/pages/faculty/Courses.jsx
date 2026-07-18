import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen, Users } from "lucide-react";
import { courseAPI } from "../../api/index.js";
import {
  Card,
  LoadingScreen,
  ErrorAlert,
  Badge,
} from "../../components/ui/index.jsx";

export default function FacultyCourses() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["faculty-courses-list"],
    queryFn: () => courseAPI.getMyCourses(),
  });

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorAlert message="Failed to load courses" />;

  const courses = data?.data?.data?.courses || [];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {courses.map((c) => (
        <Card key={c._id} className="p-5">
          <div className="flex items-start justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-primary">
              <BookOpen className="h-5 w-5" />
            </div>
            <Badge color={c.isActive ? "green" : "red"}>
              {c.isActive ? "Active" : "Inactive"}
            </Badge>
          </div>
          <h3 className="mt-3 font-semibold text-foreground">{c.code}</h3>
          <p className="text-sm text-muted-foreground">{c.name}</p>
          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Users className="h-4 w-4" /> {c.enrolledCount || 0} students
            </span>
            <Link
              to={`/faculty/sessions?course=${c._id}`}
              className="font-medium text-primary hover:text-primary"
            >
              Sessions →
            </Link>
          </div>
        </Card>
      ))}
      {courses.length === 0 && (
        <p className="col-span-full text-center text-sm text-muted-foreground/70">
          You have no assigned courses.
        </p>
      )}
    </div>
  );
}
