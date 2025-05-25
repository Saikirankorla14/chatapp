import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";

function App() {
  const socketRef = useRef(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState([]);
  const [currentRoom, setCurrentRoom] = useState("general");
  const [roomUsers, setRoomUsers] = useState([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const initializeSocket = (token) => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const socket = io("http://localhost:5000", {
      auth: { token, username },
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("Connected to server");
      socket.emit("join-room", currentRoom, (response) => {
        if (response.error) {
          console.error("Room join error:", response.error);
        }
      });
    });

    socket.on("new-message", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    socket.on("user-joined", (data) => {
      setMessages((prev) => [
        ...prev,
        {
          system: true,
          message: `${data.username} joined the room`,
          timestamp: data.timestamp,
        },
      ]);
    });

    socket.on("user-left", (data) => {
      setMessages((prev) => [
        ...prev,
        {
          system: true,
          message: `${data.username} left the room`,
          timestamp: data.timestamp,
        },
      ]);
    });

    socket.on("user-connected", (data) => {
      setMessages((prev) => [
        ...prev,
        {
          system: true,
          message: `✅ ${data.username} connected`,
          timestamp: data.timestamp,
        },
      ]);
    });

    socket.on("user-disconnected", (data) => {
      setMessages((prev) => [
        ...prev,
        {
          system: true,
          message: `❌ ${data.username} disconnected`,
          timestamp: data.timestamp,
        },
      ]);
    });

    socket.on("room-info", (data) => {
      setMessages(data.messages);
      setRoomUsers(data.users);
    });

    socket.on("connect_error", (err) => {
      console.error("Connection error:", err);
      if (err.message === "Authentication failed") {
        localStorage.removeItem("token");
        setIsAuthenticated(false);
        setError("Session expired. Please login again.");
      }
    });
  };

  const handleAuth = async (endpoint) => {
    setIsLoading(true);
    setError("");
    try {
      if (!username || !password) {
        throw new Error("Username and password are required");
      }

      const response = await fetch(`http://localhost:5000/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Authentication failed");
      }

      localStorage.setItem("token", data.token);
      setIsAuthenticated(true);
      initializeSocket(data.token);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = () => handleAuth("login");
  const handleRegister = () => handleAuth("register");

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token && !isAuthenticated) {
      setIsAuthenticated(true);
      initializeSocket(token);
    }
  }, []);

  const handleRoomChange = (newRoom) => {
    setCurrentRoom(newRoom);
    if (isAuthenticated && socketRef.current) {
      socketRef.current.emit("join-room", newRoom, (response) => {
        if (response.error) {
          console.error("Room change error:", response.error);
        }
      });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (message.trim() && isAuthenticated && socketRef.current) {
      socketRef.current.emit(
        "send-message",
        {
          room: currentRoom,
          message,
        },
        (response) => {
          if (response.error) {
            console.error("Message send error:", response.error);
          } else {
            setMessage("");
          }
        }
      );
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    setIsAuthenticated(false);
    setUsername("");
    setPassword("");
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  };

  const backgroundStyle = {
    backgroundImage: `url("/assets/chatbg.jpg")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    minHeight: "100vh",
    padding: "20px",
    color: "#000",
  };

  if (!isAuthenticated) {
    return (
      <div style={backgroundStyle}>
        <div
          style={{
            background: "rgba(255, 255, 255, 0.9)",
            padding: "20px",
            maxWidth: "400px",
            margin: "0 auto",
            borderRadius: "8px",
          }}
        >
          <h1>Chat Login</h1>
          {error && (
            <div style={{ color: "red", marginBottom: "10px" }}>{error}</div>
          )}
          <div style={{ marginBottom: "10px" }}>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              style={{ width: "100%", padding: "8px" }}
            />
          </div>
          <div style={{ marginBottom: "10px" }}>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%", padding: "8px" }}
            />
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
              onClick={handleLogin}
              disabled={isLoading}
              style={{ padding: "8px 16px" }}
            >
              {isLoading ? "Loading..." : "Login"}
            </button>
            <button
              onClick={handleRegister}
              disabled={isLoading}
              style={{ padding: "8px 16px" }}
            >
              {isLoading ? "Loading..." : "Register"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={backgroundStyle}>
      <div
        style={{
          background: "rgba(255, 255, 255, 0.9)",
          padding: "20px",
          maxWidth: "800px",
          margin: "0 auto",
          borderRadius: "8px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <h1>Real-Time Chat - {currentRoom}</h1>
          <button onClick={handleLogout} style={{ padding: "5px 10px" }}>
            Logout
          </button>
        </div>

        <div style={{ marginBottom: "10px" }}>
          <select
            value={currentRoom}
            onChange={(e) => handleRoomChange(e.target.value)}
            style={{ padding: "8px" }}
          >
            <option value="general">General</option>
            <option value="gaming">Gaming</option>
            <option value="tech">Tech</option>
          </select>
        </div>

        <div
          style={{
            height: "400px",
            overflowY: "scroll",
            border: "1px solid #ccc",
            padding: "10px",
            marginBottom: "10px",
            backgroundColor: "#f9f9f9",
          }}
        >
          {messages.map((msg, i) => (
            <div key={i} style={{ marginBottom: "8px" }}>
              {msg.system ? (
                <em style={{ color: "#666" }}>{msg.message}</em>
              ) : (
                <p>
                  <strong>{msg.username}:</strong> {msg.message}
                  {msg.timestamp && (
                    <small style={{ color: "#999", marginLeft: "10px" }}>
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </small>
                  )}
                </p>
              )}
            </div>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", gap: "10px" }}>
          <input
            type="text"
            placeholder="Type a message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{ flex: 1, padding: "8px" }}
          />
          <button type="submit" style={{ padding: "8px 16px" }}>
            Send
          </button>
        </form>

        <div style={{ marginTop: "20px" }}>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {roomUsers.map((user, i) => (
              <li key={i} style={{ padding: "4px 0" }}>
                {user.username}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default App;
