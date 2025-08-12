import React, { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useForm } from "react-hook-form";
import { toast } from "react-hot-toast";
import apiClient from "../lib/api";
import { LoginFormData } from "../types";
import { logger } from "../lib/logger";

const LoginPage: React.FC = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [authMode, setAuthMode] = useState<"form" | "saml">("form");

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>();

  useEffect(() => {
    if (apiClient.isAuthenticated()) {
      router.push("/dashboard");
      return;
    }

    const getAuthMode = async () => {
      try {
        const mode = await apiClient.getAuthMode();
        setAuthMode(mode as "form" | "saml");
      } catch (error) {
        logger.error("Error getting auth mode", { error });
      }
    };

    getAuthMode();
  }, [router]);

  const onSubmit = async (data: LoginFormData) => {
    setLoading(true);
    
    // Much shorter timeout for better UX - 8 seconds max
    const loadingTimeout = setTimeout(() => {
      setLoading(false);
      toast.error("Login is taking too long. Please try again.");
      logger.warn("Login timeout - request took too long");
    }, 8000);

    try {
      await apiClient.login(data);
      clearTimeout(loadingTimeout);
      // Login successful - user will see dashboard page as confirmation
      router.push("/dashboard");
    } catch (error: unknown) {
      clearTimeout(loadingTimeout);
      setLoading(false); // Immediately stop loading on error
      
      logger.error("Login error", { error, username: data?.username });
      
      let errMessage = "Invalid username or password";
      
      if (error && typeof error === "object" && "response" in error) {
        const responseError = error as { response?: { data?: { detail?: string, message?: string } } };
        // Handle different error response formats
        errMessage = responseError.response?.data?.detail || 
                    responseError.response?.data?.message || 
                    errMessage;
      } else if (error instanceof Error) {
        if (error.message.includes("timeout")) {
          errMessage = "Connection timed out. Please check your internet connection.";
        } else if (error.message.includes("Network Error")) {
          errMessage = "Cannot connect to server. Please check if the server is running.";
        } else if (error.message.includes("429")) {
          errMessage = "Too many login attempts. Please wait a few minutes and try again.";
        }
      }
      
      // Show error immediately
      toast.error(errMessage, { duration: 4000 });
      return; // Exit early, don't execute finally block
    }
    
    // Only clear loading if we got here successfully
    clearTimeout(loadingTimeout);
    setLoading(false);
  };

  const handleSamlLogin = () => {
    // Redirect to SAML login endpoint
    window.location.href = `${process.env.NEXT_PUBLIC_API_URL}/auth/saml/login`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="mx-auto h-12 w-12 flex items-center justify-center rounded-full bg-primary-500">
            <svg
              className="h-6 w-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Data Analytics Platform
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to access your dashboard
          </p>
        </div>

        {authMode === "form" ? (
          <form className="mt-8 space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <div className="rounded-md shadow-sm -space-y-px">
              <div>
                <label htmlFor="username" className="sr-only">
                  Username
                </label>
                <input
                  {...register("username", {
                    required: "Username is required",
                  })}
                  type="text"
                  autoComplete="username"
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                  placeholder="Username"
                />
                {errors.username && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.username.message}
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="password" className="sr-only">
                  Password
                </label>
                <input
                  {...register("password", {
                    required: "Password is required",
                  })}
                  type="password"
                  autoComplete="current-password"
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-primary-500 focus:border-primary-500 focus:z-10 sm:text-sm"
                  placeholder="Password"
                />
                {errors.password && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.password.message}
                  </p>
                )}
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <svg
                    className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                ) : null}
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </div>

            <div className="text-center">
              <p className="text-sm text-gray-600">
                Default credentials: admin / admin123
              </p>
            </div>
          </form>
        ) : (
          <div className="mt-8">
            <button
              onClick={handleSamlLogin}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            >
              Sign in with SAML
            </button>
          </div>
        )}

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            Powered by Oracle Database & FastAPI
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
