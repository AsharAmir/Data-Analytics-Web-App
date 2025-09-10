import type { AppProps } from "next/app";
import "../styles/globals.css";
import { Toaster } from "react-hot-toast";
import { useRouter } from "next/router";
import apiClient from "../lib/api";
import { useEffect, useState, useCallback } from "react";
import { securityManager } from "../lib/security";
import { logger } from "../lib/logger";
import { toast } from "react-hot-toast";

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [isAuthorizing, setIsAuthorizing] = useState(true);
  const [lastToastMessage, setLastToastMessage] = useState<string>("");
  const [lastToastTime, setLastToastTime] = useState<number>(0);

  // Function to show toast only if it hasn't been shown recently (within 3 seconds)
  const showDedupedToast = useCallback((message: string) => {
    const now = Date.now();
    const timeSinceLastToast = now - lastToastTime;
    const isDuplicateMessage = lastToastMessage === message;
    
    // Only show toast if it's a different message OR it's been more than 3 seconds
    if (!isDuplicateMessage || timeSinceLastToast > 3000) {
      toast.error(message);
      setLastToastMessage(message);
      setLastToastTime(now);
    }
  }, [lastToastMessage, lastToastTime]);

  useEffect(() => {
    const enhancedSecurityGuard = async (url: string) => {
      try {
        setIsAuthorizing(true);
        
        // Parse URL to get pathname and query
        const [pathname, queryString] = url.split("?");
        const urlParams = new URLSearchParams(queryString || "");
        const query = Object.fromEntries(urlParams.entries());

        const publicRoutes = ["/login", "/change-password"];
        if (publicRoutes.includes(pathname)) {
          setIsAuthorizing(false);
          return;
        }

        // Handle token-only sessions (e.g., SAML success page) by fetching user
        const hasToken = apiClient.isAuthenticated();
        let user = apiClient.getUser();
        if (hasToken && !user) {
          try {
            user = await apiClient.getCurrentUser();
            securityManager.setUser(user);
          } catch (e) {
            logger.warn("Token present but failed to load user; redirecting to login", { error: e });
            router.replace("/login");
            return;
          }
        }
        
        if (!hasToken || !user) {
          logger.warn("Unauthenticated access attempt", { 
            pathname, 
            query, 
            userAgent: navigator.userAgent 
          });
          router.replace("/login");
          return;
        }

        // Update in-memory user + activity
        securityManager.setUser(user);
        apiClient.updateActivity();

        // Force password change if required
        if (user?.must_change_password && pathname !== "/change-password") {
          logger.info("Redirecting user to change password", { username: user.username });
          router.push("/change-password");
          return;
        }

        const canAccess = await securityManager.canAccessRoute(pathname, query);
        if (!canAccess) {
          logger.warn("Access denied to route", { 
            pathname, 
            query, 
            username: user?.username, 
            role: user?.role 
          });
          
          // Show appropriate error message (with deduplication)
          if (pathname.startsWith("/report/")) {
            showDedupedToast("Access denied: You don't have permission to view this report");
          } else if (pathname.startsWith("/admin")) {
            showDedupedToast("Access denied: Admin privileges required");
          } else {
            showDedupedToast("Access denied: Insufficient permissions");
          }
          
          securityManager.handleUnauthorizedAccess(router, pathname);
          return;
        }

        setIsAuthorizing(false);
      } catch (error) {
        logger.error("Security guard error", { error, url });
        setIsAuthorizing(false);
        // On error, redirect to login for safety
        router.replace("/login");
      }
    };

    enhancedSecurityGuard(router.asPath);

    const handleRouteChangeStart = (url: string) => {
      // Log navigation to file
      logger.navigation(router.asPath || 'unknown', url, {
        userAgent: typeof window !== 'undefined' ? navigator.userAgent : undefined,
      });
      
      enhancedSecurityGuard(url);
    };

    router.events.on("routeChangeStart", handleRouteChangeStart);
    return () => {
      router.events.off("routeChangeStart", handleRouteChangeStart);
    };
  }, [router, showDedupedToast]);
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

  if (isAuthorizing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-6"></div>
          <p className="text-lg text-gray-700 font-medium">Verifying access permissions...</p>
          <p className="text-sm text-gray-500 mt-2">Please wait while we check your authorization</p>
        </div>
      </div>
    );
  }

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
