import { Router } from "express";
import { searchStocks } from "../stock_index.js";
import { getSetting, setSetting } from "../database.js";

const router = Router();

router.get("/api/stocks/search", async (req, res) => {
  try {
    const q = (req.query.q as string || "").trim();
    if (!q || q.length < 1) return res.json([]);
    res.json(await searchStocks(q));
  } catch (error: any) {
    console.error("[stock search]", error.message);
    res.json([]);
  }
});

// AI Config
router.get("/api/config/ai", (_req, res) => {
  try {
    const apiKey = getSetting("ai_api_key") || "";
    const baseUrl = getSetting("ai_base_url") || "https://api.openai.com/v1";
    const model = getSetting("ai_model") || "gpt-4o-mini";
    res.json({ apiKey: apiKey ? "***已设置***" : "", baseUrl, model, hasKey: !!apiKey });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/config/ai", (req, res) => {
  try {
    const { apiKey, baseUrl, model } = req.body;
    if (apiKey !== undefined && apiKey !== "***已设置***") setSetting("ai_api_key", apiKey);
    if (baseUrl) setSetting("ai_base_url", baseUrl);
    if (model) setSetting("ai_model", model);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
