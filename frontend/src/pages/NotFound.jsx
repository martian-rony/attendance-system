import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext.jsx";

export default function NotFound() {
  const { user } = useAuth();
  const home = user ? `/${user.role}` : "/login";
  return (
    <div className="flex min-h-full flex-col items-center justify-center p-6">
      <p className="text-6xl font-bold text-brand-600">404</p>
      <h1 className="mt-4 text-xl font-semibold text-gray-900">
        Page not found
      </h1>
      <p className="mt-2 text-sm text-gray-500">
        The page you&apos;re looking for doesn&apos;t exist.
      </p>
      <Link
        to={home}
        className="mt-6 rounded-xl bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
