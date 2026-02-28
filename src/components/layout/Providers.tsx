"use client";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "react-hot-toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "#1c1c1c",
            color: "#ececec",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "10px",
            fontFamily: "Geist,sans-serif",
            fontSize: "13px",
          },
          success: { iconTheme: { primary: "#e8a045", secondary: "#1c1c1c" } },
          error: { iconTheme: { primary: "#e05c5c", secondary: "#1c1c1c" } },
        }}
      />
    </SessionProvider>
  );
}
