import { Router } from "express";
import trackerController from "../controllers/trackerController";
import { handleWebhook } from "../controllers/webhookController";

const router: Router = Router();

// Tracker routes

router.post("/trackers", trackerController.addTracker);
router.get("/trackers", trackerController.getAllTrackers);
router.post("/trackers/:id/start", trackerController.startTracker);
router.post("/trackers/:id/stop", trackerController.stopTracker);
router.post("/trackers/:id/archive", trackerController.archiveTracker);
router.post("/trackers/:id/unarchive", trackerController.unarchiveTracker);
router.delete("/trackers/:id", trackerController.deleteTracker);
router.get("/trackers/:id/sessions", trackerController.getSessions);
router.get("/trackers/:id/stats", trackerController.getWorkStats);

// Session routes
router.get("/sessions/:userId/active", trackerController.getAllActiveSessions);

// Daily totals routes
router.get("/users/:userId/daily-totals", trackerController.getDailyTotals);
router.get(
  "/users/:userId/daily-totals/:period",
  trackerController.getDailyTotalsForPeriod
);

// Total hours routes
router.get("/users/:userId/total-hours", trackerController.getTotalHours);
router.get(
  "/users/:userId/total-hours/:period",
  trackerController.getTotalHoursForPeriod
);

// Productivity trend routes
router.get(
  "/users/:userId/productivity-trend",
  trackerController.getProductivityTrend
);
router.get(
  "/users/:userId/productivity-trend/:period",
  trackerController.getProductivityTrendForPeriod
);

// Today stats route
router.get("/users/:userId/today", trackerController.getTodayStats);

router.post("/webhook", handleWebhook);

export default router;
