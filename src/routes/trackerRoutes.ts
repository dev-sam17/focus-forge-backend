import { Router } from "express";
import trackerController from "../controllers/trackerController";
import { handleWebhook } from "../controllers/webhookController";
import { cacheMiddleware, invalidateAllCacheMiddleware } from "../middleware/cache";

const router: Router = Router();

// Tracker routes

router.post("/trackers", invalidateAllCacheMiddleware, trackerController.addTracker);
router.get("/trackers", trackerController.getAllTrackers);
router.post("/trackers/:id/start", invalidateAllCacheMiddleware, trackerController.startTracker);
router.post("/trackers/:id/stop", invalidateAllCacheMiddleware, trackerController.stopTracker);
router.post("/trackers/:id/archive", invalidateAllCacheMiddleware, trackerController.archiveTracker);
router.post("/trackers/:id/unarchive", invalidateAllCacheMiddleware, trackerController.unarchiveTracker);
router.delete("/trackers/:id", trackerController.deleteTracker);
router.get("/trackers/:id/sessions", trackerController.getSessions);
router.get("/trackers/:id/stats", trackerController.getWorkStats);

// Session routes
router.get("/sessions/:userId/active", cacheMiddleware, trackerController.getAllActiveSessions);

// Daily totals routes
router.get("/users/:userId/daily-totals", cacheMiddleware, trackerController.getDailyTotals);
router.get(
  "/users/:userId/daily-totals/:period",
  cacheMiddleware,
  trackerController.getDailyTotalsForPeriod
);

// Total hours routes
router.get("/users/:userId/total-hours", cacheMiddleware, trackerController.getTotalHours);
router.get(
  "/users/:userId/total-hours/:period",
  cacheMiddleware,
  trackerController.getTotalHoursForPeriod
);

// Productivity trend routes
router.get(
  "/users/:userId/productivity-trend",
  cacheMiddleware,
  trackerController.getProductivityTrend
);
router.get(
  "/users/:userId/productivity-trend/:period",
  cacheMiddleware,
  trackerController.getProductivityTrendForPeriod
);

// Today stats route
router.get("/users/:userId/today", cacheMiddleware, trackerController.getTodayStats);

router.post("/webhook", handleWebhook);

export default router;
