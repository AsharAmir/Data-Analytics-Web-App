import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import apiClient from "../lib/api";
import { User } from "../types";
import { logger } from "../lib/logger";
import { toast } from "react-hot-toast";

const ChangePasswordPage: React.FC = () => {
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
    const user = apiClient.getUser();
    setCurrentUser(user);

    if (!user) {
      router.push("/login");
    } else if (!user.must_change_password) {
      router.push("/dashboard");
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (!oldPassword.trim()) {
      setError("Please enter your current password");
      return;
    }

    if (!newPassword.trim()) {
      setError("Please enter a new password");
      return;
    }

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    if (oldPassword === newPassword) {
      setError("New password must be different from current password");
      return;
    }

    try {
      setLoading(true);
      logger.info("Submitting password change request");
      
      await apiClient.changePassword(oldPassword, newPassword);
      
      // Refresh user data to update must_change_password status
      try {
        const updatedUser = await apiClient.getCurrentUser();
        logger.info("User data refreshed after password change", { 
          mustChangePassword: updatedUser.must_change_password 
        });
      } catch (refreshError) {
        logger.warn("Failed to refresh user data after password change", { error: refreshError });
        // Continue anyway since password was changed successfully
      }
      
      toast.success("Password changed successfully!");
      logger.info("Password change successful, redirecting to dashboard");
      router.push("/dashboard");
    } catch (err: any) {
      logger.error("Password change failed", { error: err });
      
      let errorMessage = "Failed to change password";
      
      if (err?.response?.status === 400) {
        const detail = err.response?.data?.detail;
        if (detail?.includes("current password") || detail?.includes("incorrect")) {
          errorMessage = "Current password is incorrect";
        } else if (detail?.includes("password")) {
          errorMessage = detail;
        }
      } else if (err?.response?.status === 401) {
        errorMessage = "Current password is incorrect";
      } else if (err?.response?.data?.detail) {
        const detail = err.response.data.detail;
        // Handle FastAPI validation errors (array of objects)
        if (Array.isArray(detail)) {
          errorMessage = detail.map((error: any) => {
            if (typeof error === 'string') return error;
            if (error.msg) return error.msg;
            if (error.message) return error.message;
            return 'Validation error';
          }).join('. ');
        } else if (typeof detail === 'string') {
          errorMessage = detail;
        } else {
          errorMessage = 'Validation error occurred';
        }
      }
      
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6">
        <h1 className="text-2xl font-bold mb-4 text-center">Change Password</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Hidden username field for accessibility/autocomplete */}
          {isClient && currentUser?.username && (
            <input
              type="text"
              name="username"
              autoComplete="username"
              value={currentUser.username}
              readOnly
              hidden
            />
          )}
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <div>
            <label
              htmlFor="current-password"
              className="block text-sm font-medium mb-1"
            >
              Current Password
            </label>
            <input
              id="current-password"
              name="current-password"
              type="password"
              autoComplete="current-password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              required
            />
          </div>
          <div>
            <label
              htmlFor="new-password"
              className="block text-sm font-medium mb-1"
            >
              New Password
            </label>
            <input
              id="new-password"
              name="new-password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              required
            />
          </div>
          <div>
            <label
              htmlFor="confirm-password"
              className="block text-sm font-medium mb-1"
            >
              Confirm New Password
            </label>
            <input
              id="confirm-password"
              name="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChangePasswordPage;
