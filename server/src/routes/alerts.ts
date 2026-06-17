import { Router } from "express";
import { getAlerts, createAlert, updateAlert, deleteAlert, updateAlertTriggered } from "../database.js";
import { fetchPrices } from "../services/price.js";

const router = Router();

router.get("/api/alerts", (_req, res) => {
  try { res.json(getAlerts()); }
  catch (e: any) { res.status(500).json({ error: "获取告警失败", detail: e.message }); }
});

router.post("/api/alerts", (req, res) => {
  try {
    const { stock_code, stock_name, threshold_up, threshold_down } = req.body;
    if (!stock_code || !stock_name) return res.status(400).json({ error: "请提供股票代码和名称" });
    const id = createAlert(stock_code, stock_name, threshold_up, threshold_down);
    res.json({ success: true, id });
  } catch (e: any) { res.status(500).json({ error: "创建告警失败", detail: e.message }); }
});

router.put("/api/alerts/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "无效的告警 ID" });
    updateAlert(id, req.body);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: "更新告警失败", detail: e.message }); }
});

router.delete("/api/alerts/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "无效的告警 ID" });
    deleteAlert(id);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: "删除告警失败", detail: e.message }); }
});

router.post("/api/alerts/check", async (_req, res) => {
  try {
    const alerts = getAlerts().filter((a: any) => a.enabled);
    if (alerts.length === 0) {
      return res.json({ alerts: [], checked_at: new Date().toISOString() });
    }

    const codes = alerts.map((a: any) => a.stock_code);
    const priceMap = await fetchPrices(codes);

    const results: any[] = [];
    for (const a of alerts) {
      const pd = priceMap.get(a.stock_code);
      if (!pd) {
        results.push({ id: a.id, stock: a.stock_name, code: a.stock_code, error: "查价失败" });
        continue;
      }

      const price = pd.current;
      const chgPct = pd.yest > 0 ? ((price - pd.yest) / pd.yest * 100) : 0;
      let triggered = "", triggeredUp = a.last_triggered_up, triggeredDown = a.last_triggered_down;

      if (a.threshold_up && price >= a.threshold_up) {
        if (!a.last_triggered_up || Date.now() - new Date(a.last_triggered_up).getTime() > 86400000) {
          triggered = "up_breach"; triggeredUp = new Date().toISOString();
          updateAlertTriggered(a.id, "up", triggeredUp);
        }
      }
      if (a.threshold_down && price <= a.threshold_down) {
        if (!a.last_triggered_down || Date.now() - new Date(a.last_triggered_down).getTime() > 86400000) {
          triggered = triggered ? triggered + ",down_breach" : "down_breach";
          triggeredDown = new Date().toISOString();
          updateAlertTriggered(a.id, "down", triggeredDown);
        }
      }

      results.push({
        id: a.id,
        stock: a.stock_name,
        code: a.stock_code,
        price: Math.round(price * 100) / 100,
        chgPct: Math.round(chgPct * 100) / 100,
        triggered: triggered || "ok",
      });
    }

    const triggered = results.filter((r: any) => r.triggered !== "ok");
    res.json({
      alerts: results,
      triggered: triggered.length > 0 ? triggered : null,
      checked_at: new Date().toISOString(),
    });
  } catch (e: any) {
    res.status(500).json({ error: "告警检查失败", detail: e.message });
  }
});

export default router;
