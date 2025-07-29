import type { AppProps } from "next/app";
import "../styles/globals.css";
import { Toaster } from "react-hot-toast";
import { useRouter } from "next/router";
import apiClient from "../lib/api";
import { useEffect } from "react";

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();

  // Redirect to change-password page if flag is still true
  useEffect(() => {
    const user = apiClient.getUser();
    if (
      user &&
      user.must_change_password &&
      router.pathname !== "/change-password"
    ) {
      router.push("/change-password");
    }
  }, [router]);
  // Global auth guard – if no token, redirect to login before any data fetches
  useEffect(() => {
    const guard = () => {
      if (!apiClient.isAuthenticated() && router.pathname !== "/login" && router.pathname !== "/change-password") {
        router.replace("/login");
      }
    };

    guard(); // Run on mount
    router.events.on("routeChangeStart", guard);
    return () => {
      router.events.off("routeChangeStart", guard);
    };
  }, [router]);
  useEffect(() => {
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const reason: any = event.reason;
      if (
        reason?.isAxiosError &&
        reason?.response?.status >= 400 &&
        reason?.response?.status < 500
      ) {
        event.preventDefault(); // Suppress Next.js overlay for handled Axios errors
      }
    };

    const errorHandler = (event: ErrorEvent) => {
      // Some browsers may surface Axios errors via the generic `error` event instead
      const err: any = event.error;
      if (
        err?.isAxiosError &&
        err?.response?.status >= 400 &&
        err?.response?.status < 500
      ) {
        event.preventDefault(); // Suppress Next.js overlay for handled Axios errors
      }
    };

    window.addEventListener("unhandledrejection", rejectionHandler);
    window.addEventListener("error", errorHandler);
    return () => {
      window.removeEventListener("unhandledrejection", rejectionHandler);
      window.removeEventListener("error", errorHandler);
    };
  }, []);

  return (
    <>
      <Component {...pageProps} />
      {/* Global toaster for displaying notifications */}
      <Toaster
        position="top-right"
        reverseOrder={false}
        toastOptions={{
          duration: 5000,
          success: { duration: 5000 },
          error: { duration: 5000 },
        }}
      />
    </>
  );
}
