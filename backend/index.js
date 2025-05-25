const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Message = require("./models/Message");
const User = require("./models/User");

const app = express();
app.use(cors({ origin: "http://localhost:3000", credentials: true }));
app.use(express.json());

// MongoDB
mongoose
  .connect("mongodb://localhost:27017/chat-app", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB error:", err));

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",
    credentials: true,
  },
});

// Track users per room
const activeUsers = new Map();

User.prototype.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Auth middleware
io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("No token provided"));

  try {
    const decoded = jwt.verify(token, "my_super_secret_key_123");
    const user = await User.findById(decoded.userId);
    if (!user) return next(new Error("User not found"));

    socket.user = { id: user._id.toString(), username: user.username };
    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  console.log(`🔌 ${socket.user.username} connected`);

  socket.on("join-room", async (room, callback) => {
    try {
      if (typeof room !== "string" || room.length > 20) {
        return callback({ error: "Invalid room name" });
      }

      // Leave previous rooms (except own room)
      for (const r of socket.rooms) {
        if (r !== socket.id) {
          socket.leave(r);
          if (activeUsers.has(r)) {
            const users = activeUsers.get(r);
            users.delete(socket.user.id);
            io.to(r).emit("user-left", { username: socket.user.username });
            if (users.size === 0) activeUsers.delete(r);
          }
        }
      }

      // Join new room
      socket.join(room);
      if (!activeUsers.has(room)) {
        activeUsers.set(room, new Map());
      }
      activeUsers.get(room).set(socket.user.id, socket.user.username);

      // Fetch previous messages
      const messages = await Message.find({ room })
        .sort({ timestamp: 1 })
        .limit(50)
        .lean();

      // Notify others in room
      socket.to(room).emit("user-joined", {
        username: socket.user.username,
        timestamp: new Date(),
      });

      // Send response to the joining user
      const usersList = Array.from(activeUsers.get(room).entries()).map(
        ([id, username]) => ({ id, username })
      );
      callback({ status: "success", room, messages, users: usersList });
    } catch (err) {
      console.error("Join room error:", err);
      callback({ error: "Failed to join room" });
    }
  });

  socket.on("send-message", async ({ room, message }, callback) => {
    if (!message || typeof message !== "string" || message.length > 500) {
      return callback({ error: "Invalid message" });
    }

    try {
      const newMessage = new Message({
        room,
        message,
        username: socket.user.username,
        userId: socket.user.id,
        timestamp: new Date(),
      });
      await newMessage.save();

      io.to(room).emit("new-message", {
        id: newMessage._id,
        username: socket.user.username,
        message,
        timestamp: newMessage.timestamp,
      });

      callback({ status: "success" });
    } catch (err) {
      console.error("Message send error:", err);
      callback({ error: "Failed to send message" });
    }
  });

  socket.on("disconnect", () => {
    activeUsers.forEach((users, room) => {
      if (users.has(socket.user.id)) {
        users.delete(socket.user.id);
        io.to(room).emit("user-left", {
          username: socket.user.username,
          timestamp: new Date(),
        });
        if (users.size === 0) {
          activeUsers.delete(room);
        }
      }
    });
    console.log(`❌ ${socket.user.username} disconnected`);
  });
});

// Register
app.post("/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password || username.length < 3 || password.length < 6) {
      return res.status(400).json({ error: "Invalid username or password" });
    }

    const existingUser = await User.findOne({
      username: { $regex: new RegExp(`^${username.trim()}$`, "i") },
    });
    if (existingUser) return res.status(400).json({ error: "Username taken" });

    const user = new User({ username: username.trim(), password });
    await user.save();

    const token = jwt.sign({ userId: user._id }, "my_super_secret_key_123", {
      expiresIn: "7d",
    });
    res.json({ token, user: { id: user._id, username: user.username } });
  } catch (err) {
    res.status(500).json({ error: "Registration failed" });
  }
});

// Login
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({
      username: { $regex: new RegExp(`^${username.trim()}$`, "i") },
    });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign({ userId: user._id }, "my_super_secret_key_123", {
      expiresIn: "7d",
    });
    res.json({ token, user: { id: user._id, username: user.username } });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server at http://localhost:${PORT}`));
