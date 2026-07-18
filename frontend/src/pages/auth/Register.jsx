import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext.jsx";
import { Button, Input, ErrorAlert, SuccessAlert, Card } from "../../components/ui/index.jsx";
import { Label } from "../../components/ui/label.jsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select.jsx";
import { authAPI } from "../../api/index.js";

const ROLES = [
  { value: "faculty", label: "Faculty" },
  { value: "student", label: "Student" },
];

export default function Register() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    defaultValues: {
      role: "student",
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const password = watch("password");

  const onSubmit = async (data) => {
    setError("");
    setSuccess("");
    try {
      const payload = { ...data };
      delete payload.confirmPassword;
      await authAPI.register(payload);
      setSuccess("User created successfully! They can now log in.");
      setTimeout(() => navigate("/admin/users"), 1500);
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed.");
    }
  };

  if (!user || user.role !== "admin") {
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <Card className="max-w-md p-8 text-center">
          <h2 className="text-lg font-semibold">Access Denied</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Only administrators can register new users. Please{" "}
            <Link to="/login" className="text-primary">
              sign in
            </Link>
            .
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Register New User</h1>
        <p className="text-sm text-muted-foreground">
          Create a faculty or student account.
        </p>
      </div>

      <Card className="p-6">
        <form
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={handleSubmit(onSubmit)}
        >
          {error && (
            <div className="sm:col-span-2">
              <ErrorAlert message={error} />
            </div>
          )}
          {success && (
            <div className="sm:col-span-2">
              <SuccessAlert message={success} />
            </div>
          )}

          <Input
            label="First Name"
            error={errors.firstName?.message}
            {...register("firstName", { required: "Required" })}
          />
          <Input
            label="Last Name"
            error={errors.lastName?.message}
            {...register("lastName", { required: "Required" })}
          />
          <Input
            label="Email"
            type="email"
            error={errors.email?.message}
            {...register("email", {
              required: "Required",
              pattern: { value: /^\S+@\S+\.\S+$/, message: "Invalid email" },
            })}
          />
          <div>
            <Label>Role</Label>
            <Select
              value={watch("role")}
              onValueChange={(v) => setValue("role", v, { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Input
            label="Password"
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

          <div className="sm:col-span-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(-1)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create User"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
