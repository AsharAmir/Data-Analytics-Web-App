import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import apiClient from "../lib/api";
import { User } from "../types";

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
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }
    try {
      setLoading(true);
      await apiClient.changePassword(oldPassword, newPassword);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to change password");
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
            <label htmlFor="current-password" className="block text-sm font-medium mb-1">
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
            <label htmlFor="new-password" className="block text-sm font-medium mb-1">
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
            <label htmlFor="confirm-password" className="block text-sm font-medium mb-1">
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
