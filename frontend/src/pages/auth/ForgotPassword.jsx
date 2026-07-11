import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router-dom";
import {
  Button,
  Input,
  ErrorAlert,
  SuccessAlert,
} from "../../components/ui/index.jsx";
import { authAPI } from "../../api/index.js";

export default function ForgotPassword() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  const onSubmit = async (data) => {
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      await authAPI.forgotPassword(data.email);
      setSuccess("If an account exists, a password reset link has been sent.");
    } catch (err) {
      setError(err.response?.data?.message || "Request failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <h2 className="text-xl font-bold text-gray-900">Forgot Password</h2>
          <p className="mt-1 text-sm text-gray-500">
            Enter your email to receive a reset link.
          </p>
          <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
            {error && <ErrorAlert message={error} />}
            {success && <SuccessAlert message={success} />}
            <Input
              label="Email"
              type="email"
              error={errors.email?.message}
              {...register("email", { required: "Email is required" })}
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Sending..." : "Send Reset Link"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm">
            <Link to="/login" className="text-brand-600">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm({
    defaultValues: { token: searchParams.get("token") || "", password: "", confirmPassword: "" },
  });

  // If the link carried a token, surface it in the field automatically.
  const urlToken = searchParams.get("token");
  if (urlToken) setValue("token", urlToken, { shouldValidate: false });
  const password = watch("password");

  const onSubmit = async (data) => {
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      await authAPI.resetPassword({
        token: data.token,
        password: data.password,
        confirmPassword: data.confirmPassword,
      });
      setSuccess("Password reset successful. You can now sign in.");
    } catch (err) {
      setError(err.response?.data?.message || "Reset failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="card p-8">
          <h2 className="text-xl font-bold text-gray-900">Reset Password</h2>
          <form className="mt-6 space-y-4" onSubmit={handleSubmit(onSubmit)}>
            {error && <ErrorAlert message={error} />}
            {success && <SuccessAlert message={success} />}
            <Input
              label="Reset Token"
              error={errors.token?.message}
              {...register("token", { required: "Token is required" })}
            />
            <Input
              label="New Password"
              type="password"
              error={errors.password?.message}
              {...register("password", {
                required: "Required",
                minLength: { value: 8, message: "Min 8 chars" },
              })}
            />
            <Input
              label="Confirm Password"
              type="password"
              error={errors.confirmPassword?.message}
              {...register("confirmPassword", {
                required: "Required",
                validate: (val) => val === password || "Passwords do not match",
              })}
            />
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Resetting..." : "Reset Password"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
