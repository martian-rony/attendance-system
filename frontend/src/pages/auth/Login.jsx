import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useLocation, Link } from "react-router-dom";
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
    <div className="flex min-h-full flex-col justify-center px-6 py-12 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="rounded-2xl bg-brand-600 px-4 py-3 text-2xl font-bold text-white">
            AS
          </div>
        </div>
        <h2 className="mt-6 text-center text-2xl font-bold tracking-tight text-gray-900">
          Sign in to {APP_NAME}
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="card px-6 py-8">
          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)}>
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
              <label className="flex items-center text-sm text-gray-600">
                <input
                  type="checkbox"
                  className="mr-2 rounded border-gray-300"
                  {...register("rememberMe")}
                />
                Remember me
              </label>
              <Link
                to="/forgot-password"
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Forgot password?
              </Link>
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-gray-500">
          Demo accounts: admin@college.edu / faculty1@college.edu /
          student1@college.edu
        </p>
      </div>
    </div>
  );
}
