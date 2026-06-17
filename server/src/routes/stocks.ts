import { Router } from "express";
import { searchStocks } from "../stock_index.js";
import { getSetting, setSetting } from "../database.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();

router.get("/api/stocks/search", asyncHandler(async (req, res) => {
  const q = (req.query.q as string || "").trim();
  if (!q || q.length < 1) { res.json([]); return; }
  res.json(await searchStocks(q));
}));

// AI Config (per-user)
router.get("/api/config/ai", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const apiKey = getSetting(userId, "ai_api_key") || "";
  const baseUrl = getSetting(userId, "ai_base_url") || "https://api.openai.com/v1";
  const model = getSetting(userId, "ai_model") || "gpt-4o-mini";
  res.json({ apiKey: apiKey ? "***已设置***" : "", baseUrl, model, hasKey: !!apiKey });
}));

router.put("/api/config/ai", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const { apiKey, baseUrl, model } = req.body;
  if (apiKey !== undefined && apiKey !== "***已设置***") setSetting(userId, "ai_api_key", apiKey);
  if (baseUrl) setSetting(userId, "ai_base_url", baseUrl);
  if (model) setSetting(userId, "ai_model", model);
  res.json({ success: true });
}));

export default router;
