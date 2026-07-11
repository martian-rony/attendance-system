import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { io } from "socket.io-client";
import { SOCKET_URL } from "../config.js";
import { useAuth } from "./AuthContext.jsx";

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const listenersRef = useRef(new Map());

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const token = localStorage.getItem("accessToken");
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", (err) => {
      console.error("Socket connection error:", err.message);
    });

    // Replay registered listeners
    listenersRef.current.forEach((callbacks, event) => {
      callbacks.forEach((cb) => socket.on(event, cb));
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [isAuthenticated, user]);

  const on = useCallback((event, callback) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event).add(callback);
    if (socketRef.current) {
      socketRef.current.on(event, callback);
    }
    return () => {
      listenersRef.current.get(event)?.delete(callback);
      socketRef.current?.off(event, callback);
    };
  }, []);

  const emit = useCallback((event, data) => {
    socketRef.current?.emit(event, data);
  }, []);

  const joinRoom = useCallback((room) => {
    socketRef.current?.emit("join", room);
  }, []);

  const value = {
    socket: socketRef.current,
    connected,
    on,
    emit,
    joinRoom,
  };

  return (
    <SocketContext.Provider value={value}>{children}</SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within SocketProvider");
  }
  return context;
};
