import type { AppProps } from "next/app";
import "../styles/globals.css";
import { Toaster } from "react-hot-toast";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      {/* Global toaster for displaying notifications */}
      <Toaster
        position="top-right"
        reverseOrder={false}
        toastOptions={{
          // Increase default duration so messages stay longer on screen
          duration: 5000,
          success: {
            duration: 5000,
          },
          error: {
            duration: 5000,
          },
        }}
      />
    </>
  );
}
