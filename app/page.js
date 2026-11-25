"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import Landing from "@/components/Landing";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  // Signed-in users go straight to their chats; everyone else sees the landing page.
  useEffect(() => {
    if (!loading && user) router.replace("/chat");
  }, [user, loading, router]);

  if (loading || user) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[var(--wa-panel-header)]">
        <div className="w-10 h-10 border-4 border-[var(--wa-green)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return <Landing />;
}
