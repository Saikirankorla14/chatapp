const express = require("express");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const user = new User(req.body);
    await user.save();
    res.status(201).send({ message: "User created" });
  } catch (error) {
    res.status(400).send(error);
  }
});

router.post("/login", async (req, res) => {
  const user = await User.findOne({ username: req.body.username });
  if (!user) {
    return res.status(401).send({ error: "Invalid credentials" });
  }

  const isMatch = await user.comparePassword(req.body.password);
  if (!isMatch) {
    return res.status(401).send({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ userId: user._id }, "my_super_secret_key_123");
  res.send({ token });
});

module.exports = router;
