"use client";

import { useEffect } from "react";
import { useConfigStore } from "@/lib/stores/configStore";
import { useSocket } from "@/lib/hooks/useSocket";

export function ConfigProvider({ children }: { children: React.ReactNode }) {
  const loadConfig = useConfigStore((s) => s.loadConfig);
  const updateConfigLocally = useConfigStore((s) => s.updateConfigLocally);

  useSocket(
    (event, data) => {
      if (event === "config_update") {
        console.log("🔊 Received instant configuration update:", data);
        updateConfigLocally(data as any);
      }
    }
  );

  useEffect(() => {
    loadConfig();
    
    const interval = setInterval(() => {
      loadConfig();
    }, 30000);
    
    return () => clearInterval(interval);
  }, [loadConfig]);

  return <>{children}</>;
}
