import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSocket } from "../contexts/SocketContext.jsx";
import { useAuth } from "../contexts/AuthContext.jsx";

// Keeps admin list views in sync with server-side changes without a manual
// page refresh. The backend emits `session:created`, `session:started`,
// `course:created`, and `user:created` to the `role:admin` room; on each we
// invalidate the matching react-query key so the list refetches once.
const EVENT_KEY_MAP = {
  "session:created": ["admin-sessions"],
  "session:started": ["admin-sessions"],
  "course:created": ["courses"],
  "user:created": ["users"],
};

export const useRealtimeInvalidation = () => {
  const { connected, on, joinRoom } = useSocket();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!connected || !user || user.role !== "admin") return;

    joinRoom("role:admin");

    const unsubs = Object.entries(EVENT_KEY_MAP).map(([event, keys]) =>
      on(event, () => {
        keys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }));
      })
    );

    return () => unsubs.forEach((off) => off());
  }, [connected, user, queryClient, on, joinRoom]);
};
