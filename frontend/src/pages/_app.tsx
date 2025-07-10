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
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      const reason: any = event.reason;
      if (
        reason?.isAxiosError &&
        reason?.response?.status >= 400 &&
        reason?.response?.status < 500
      ) {
        event.preventDefault(); // Suppress Next.js overlay
        // Already logged in interceptor; nothing else to do.
      }
    };

    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
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
