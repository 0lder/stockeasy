import { Router } from "express";
import { getAlerts, createAlert, updateAlert, deleteAlert, updateAlertTriggered, getAllAlerts } from "../database.js";
import { fetchPrices } from "../services/price.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();

router.get("/api/alerts", requireAuth, asyncHandler(async (req, res) => {
  res.json(getAlerts(req.user!.userId));
}));

router.post("/api/alerts", requireAuth, asyncHandler(async (req, res) => {
  const { stock_code, stock_name, threshold_up, threshold_down } = req.body;
  if (!stock_code || !stock_name) { res.status(400).json({ error: "请提供股票代码和名称" }); return; }
  const id = createAlert(req.user!.userId, stock_code, stock_name, threshold_up, threshold_down);
  res.json({ success: true, id });
}));

router.put("/api/alerts/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "无效的告警 ID" }); return; }
  updateAlert(req.user!.userId, id, req.body);
  res.json({ success: true });
}));

router.delete("/api/alerts/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "无效的告警 ID" }); return; }
  deleteAlert(req.user!.userId, id);
  res.json({ success: true });
}));

router.post("/api/alerts/check", requireAuth, asyncHandler(async (req, res) => {
  const isCron = req.user!.userId === 0;
  const userId = req.user!.userId;
  const alerts = (isCron ? getAllAlerts() : getAlerts(userId)).filter((a: any) => a.enabled);
  if (!alerts.length) { res.json({ alerts: [], checked_at: new Date().toISOString() }); return; }

  const codes = alerts.map((a: any) => a.stock_code);
  const priceMap = await fetchPrices(codes);

  const results: any[] = [];
  const now = new Date().toISOString();
  for (const a of alerts) {
    const pd = priceMap.get(a.stock_code);
    if (!pd) { results.push({ id: a.id, stock: a.stock_name, code: a.stock_code, error: "查价失败" }); continue; }

    const price = pd.current;
    const chgPct = pd.yest > 0 ? ((price - pd.yest) / pd.yest * 100) : 0;
    let triggered = "";

    if (a.threshold_up && price >= a.threshold_up) {
      if (!a.last_triggered_up || Date.now() - new Date(a.last_triggered_up).getTime() > 86400000) {
        triggered = "up_breach";
        updateAlertTriggered(a.user_id, a.id, "up", now);
      }
    }
    if (a.threshold_down && price <= a.threshold_down) {
      if (!a.last_triggered_down || Date.now() - new Date(a.last_triggered_down).getTime() > 86400000) {
        triggered = triggered ? triggered + ",down_breach" : "down_breach";
        updateAlertTriggered(a.user_id, a.id, "down", now);
      }
    }

    results.push({
      id: a.id, stock: a.stock_name, code: a.stock_code,
      price, change_percent: parseFloat(chgPct.toFixed(2)),
      threshold_up: a.threshold_up, threshold_down: a.threshold_down,
      triggered: triggered || null,
    });
  }

  res.json({ alerts: results, checked_at: now });
}));

export default router;
