import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { Button, Input, ErrorAlert } from "../../components/ui/index.jsx";
import { APP_NAME } from "../../config.js";

export default function Login() {
  const { login, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const from = location.state?.from?.pathname || (user ? `/${user.role}` : "/");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({ defaultValues: { email: "", password: "" } });

  if (isAuthenticated && user) {
    navigate(from, { replace: true });
  }

  const onSubmit = async (data) => {
    setError("");
    setLoading(true);
    try {
      const loggedInUser = await login(data);
      navigate(`/${loggedInUser.role}`, { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Login failed. Please check your credentials.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <GraduationCap className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign in to {APP_NAME}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            {error && <ErrorAlert message={error} />}
            <Input
              label="Email address"
              type="email"
              autoComplete="email"
              error={errors.email?.message}
              {...register("email", { required: "Email is required" })}
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register("password", { required: "Password is required" })}
            />
            <div className="flex items-center justify-between">
              <label className="flex items-center text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  className="mr-2 h-4 w-4 rounded border-input text-primary focus:ring-ring"
                  {...register("rememberMe")}
                />
                Remember me
              </label>
              <Link
                to="/forgot-password"
                className="text-sm font-medium text-primary hover:text-primary/80"
              >
                Forgot password?
              </Link>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Demo accounts: admin@college.edu · faculty1@college.edu ·
          student1@college.edu
        </p>
      </div>
    </div>
  );
}
