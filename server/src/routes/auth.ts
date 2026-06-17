/**
 * Auth routes: register, login, me
 */

import { Router } from "express";
import bcrypt from "bcryptjs";
import { createUser, getUserByUsername, getUserById } from "../database.js";
import { signToken, requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();

// POST /api/auth/register
router.post("/api/auth/register", asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "用户名和密码不能为空" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "密码至少 6 位" });
    return;
  }

  const existing = getUserByUsername(username);
  if (existing) {
    res.status(409).json({ error: "用户名已存在" });
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  const userId = createUser(username, hash);
  const token = signToken({ userId, username });

  res.status(201).json({ token, user: { id: userId, username } });
}));

// POST /api/auth/login
router.post("/api/auth/login", asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: "用户名和密码不能为空" });
    return;
  }

  const user = getUserByUsername(username);
  if (!user) {
    res.status(401).json({ error: "用户名或密码错误" });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: "用户名或密码错误" });
    return;
  }

  const token = signToken({ userId: user.id, username: user.username });
  res.json({ token, user: { id: user.id, username: user.username } });
}));

// GET /api/auth/me
router.get("/api/auth/me", requireAuth, asyncHandler(async (req, res) => {
  const user = getUserById(req.user!.userId);
  if (!user) {
    res.status(404).json({ error: "用户不存在" });
    return;
  }
  res.json({ id: user.id, username: user.username, created_at: user.created_at });
}));

export default router;
