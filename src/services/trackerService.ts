import prisma from "../models/prisma";
import logger from "../utils/logger";

// Define types
interface TrackerInput {
  userId: string;
  trackerName: string;
  targetHours: number;
  description: string;
  workDays?: string; // Optional, will use default from schema if not provided
}

// Tracker Service
export default {
  // Add a new tracker
  async addTracker(data: TrackerInput) {
    try {
      const tracker = await prisma.tracker.create({
        data: {
          trackerName: data.trackerName,
          targetHours: data.targetHours,
          description: data.description,
          workDays: data.workDays || "1,2,3,4,5", // Use default if not provided
          user: {
            connect: {
              userId: data.userId,
            },
          },
        },
      });

      logger.info(
        `Added tracker with ID: ${tracker.id} for user: ${data.userId}`
      );
      return { success: true, message: "Tracker added.", data: tracker };
    } catch (err) {
      logger.error(`Error adding tracker: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  },

  // Start tracking time for a tracker
  async startTracker(trackerId: string) {
    try {
      // Check if tracker exists and update its updatedAt timestamp
      const tracker = await prisma.tracker.update({
        where: { id: trackerId },
        data: { updatedAt: new Date() },
      });

      if (!tracker) {
        return { success: false, error: "Tracker not found." };
      }

      // Check if there's already an active session
      const existing = await prisma.activeSession.findUnique({
        where: { trackerId },
      });

      if (!existing) {
        // Create a new active session
        await prisma.activeSession.create({
          data: {
            trackerId,
            startTime: new Date(),
          },
        });
      }

      return { success: true, message: "Tracker started." };
    } catch (err) {
      logger.error(`Error starting tracker: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  },

  // Stop tracking time for a tracker
  async stopTracker(trackerId: string) {
    try {
      // Find the active session
      const activeSession = await prisma.activeSession.findUnique({
        where: { trackerId },
      });

      if (!activeSession) {
        return { success: false, error: "No active session found." };
      }

      const endTime = new Date();
      const durationMinutes = Math.floor(
        (endTime.getTime() - activeSession.startTime.getTime()) / 60000
      );

      // Update tracker's updatedAt timestamp and create session in a transaction
      await prisma.$transaction([
        prisma.tracker.update({
          where: { id: trackerId },
          data: { updatedAt: endTime },
        }),
        prisma.session.create({
          data: {
            trackerId,
            startTime: activeSession.startTime,
            endTime,
            durationMinutes,
          },
        }),
        prisma.activeSession.delete({
          where: { trackerId },
        }),
      ]);

      return {
        success: true,
        message: "Tracker stopped and session recorded.",
      };
    } catch (err) {
      logger.error(`Error stopping tracker: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  },

  // Archive a tracker
  async archiveTracker(trackerId: string) {
    try {
      await prisma.tracker.update({
        where: { id: trackerId },
        data: { archived: true },
      });

      return { success: true, message: "Tracker archived." };
    } catch (err) {
      logger.error(`Error archiving tracker: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  },

  // Unarchive a tracker
  async unarchiveTracker(trackerId: string) {
    try {
      await prisma.tracker.update({
        where: { id: trackerId },
        data: { archived: false },
      });

      return { success: true, message: "Tracker unarchived." };
    } catch (err) {
      logger.error(`Error unarchiving tracker: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  },

  // Delete a tracker
  async deleteTracker(trackerId: string) {
    try {
      // Delete related sessions first (should be handled by cascade, but being explicit)
      await prisma.session.deleteMany({
        where: { trackerId },
      });

      // Delete active session if exists
      await prisma.activeSession.deleteMany({
        where: { trackerId },
      });

      // Delete the tracker
      await prisma.tracker.delete({
        where: { id: trackerId },
      });

      return { success: true, message: "Tracker deleted." };
    } catch (err) {
      logger.error(`Error deleting tracker: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  },

  // Get all trackers for a user
  async getAllTrackers(userId: string) {
    try {
      const trackers = await prisma.tracker.findMany({
        where: { userId },
        orderBy: {
          updatedAt: "desc",
        },
      });
      return { success: true, data: trackers };
    } catch (err) {
      logger.error(`Error getting trackers: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  },

  // Get all active sessions
  async getAllActiveSessions(userId: string) {
    try {
      const activeSessions = await prisma.activeSession.findMany({
        where: {
          tracker: {
            userId: userId,
          },
        },
        include: {
          tracker: true,
        },
      });
      return { success: true, data: activeSessions };
    } catch (err) {
      logger.error(`Error getting active sessions: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  },

  // Get all sessions for a tracker
  async getSessions(trackerId: string) {
    try {
      const sessions = await this.getAllSessionsForTracker(trackerId);
      return { success: true, data: sessions };
    } catch (err) {
      logger.error(`Error getting sessions: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  },

  // Get all sessions within a date range
  async getSessionsByDateRange(
    trackerId: string,
    startDate: Date,
    endDate: Date
  ) {
    try {
      const sessions = await prisma.session.findMany({
        where: {
          trackerId,
          startTime: {
            gte: startDate,
            lte: endDate,
          },
        },
      });
      return { success: true, data: sessions };
    } catch (err) {
      logger.error(`Error getting sessions: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  },

  // Compute work stats by tracker ID
  async computeWorkStatsByTrackerId(trackerId: string) {
    try {
      // Get the tracker
      const tracker = await prisma.tracker.findUnique({
        where: { id: trackerId },
      });

      if (!tracker) {
        return { success: false, error: "Tracker not found." };
      }

      // Get all sessions for this tracker using helper function
      const sessions = await this.getAllSessionsForTracker(trackerId);

      // Calculate daily totals from sessions using helper function
      const dailyTotals = this.getDailyTotals(sessions, this.getDateStr);

      // Get work days configuration
      const workDays = new Set(tracker.workDays.split(",").map(Number));

      // Calculate all work days from first session to today
      let totalWorkDays = 0;
      let totalWorkHours = 0;

      if (sessions.length > 0) {
        const firstSessionDate = new Date(sessions[0].startTime);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let currentDate = new Date(firstSessionDate);
        currentDate.setHours(0, 0, 0, 0);

        while (currentDate <= today) {
          const dateStr = this.getDateStr(currentDate);
          const dayOfWeek = currentDate.getDay();

          const minutesWorked = dailyTotals[dateStr] || 0;
          totalWorkHours += minutesWorked / 60;

          if (workDays.has(dayOfWeek)) {
            totalWorkDays++;
          }

          currentDate.setDate(currentDate.getDate() + 1);
        }
      }

      const targetWorkHours = totalWorkDays * tracker.targetHours;
      let workDebt = 0;
      let workAdvance = 0;

      if (targetWorkHours > totalWorkHours) {
        workDebt = targetWorkHours - totalWorkHours;
      } else {
        workAdvance = totalWorkHours - targetWorkHours;
      }

      const result = {
        workDebt: parseFloat(workDebt.toFixed(2)),
        workAdvance: parseFloat(workAdvance.toFixed(2)),
        totalWorkDays,
        totalWorkHours: parseFloat(totalWorkHours.toFixed(2)),
        targetWorkHours: parseFloat(targetWorkHours.toFixed(2)),
      };

      return { success: true, data: result };
    } catch (err) {
      logger.error(`Error computing work stats: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  },

  // create function to calculate and send daily totals for a user to graph it for a week , a month or a year
  async getDailyTotalsForUser(
    userId: string,
    startDate: Date,
    endDate: Date,
    trackerId?: string
  ) {
    try {
      // Build where clause conditionally based on trackerId
      const whereClause: any = {
        tracker: {
          userId: userId,
        },
        startTime: {
          gte: startDate,
          lte: endDate,
        },
      };

      // If trackerId is provided, add it to the filter
      if (trackerId) {
        whereClause.trackerId = trackerId;
      }

      // Get all sessions for the user within the date range
      const sessions = await prisma.session.findMany({
        where: whereClause,
        include: {
          tracker: {
            select: {
              id: true,
              trackerName: true,
            },
          },
        },
        orderBy: {
          startTime: "asc",
        },
      });

      // Calculate daily totals using helper function
      const dailyTotals = this.getDailyTotals(sessions, this.getDateStr);

      // Create array of dates in range with totals
      const result: Array<{
        date: string;
        totalMinutes: number;
        totalHours: number;
        sessionCount: number;
      }> = [];

      let currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateStr = this.getDateStr(currentDate);
        const totalMinutes = dailyTotals[dateStr] || 0;
        const sessionsForDate = sessions.filter(
          (session) => this.getDateStr(session.startTime) === dateStr
        );

        result.push({
          date: dateStr,
          totalMinutes,
          totalHours: parseFloat((totalMinutes / 60).toFixed(2)),
          sessionCount: sessionsForDate.length,
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return { success: true, data: result };
    } catch (err) {
      logger.error(
        `Error getting daily totals for user: ${(err as Error).message}`
      );
      return { success: false, error: (err as Error).message };
    }
  },

  // Get daily totals for predefined periods
  async getDailyTotalsForPeriod(
    userId: string,
    period: "week" | "month" | "year",
    trackerId?: string
  ) {
    try {
      const { startDate, endDate } = this.getDateRange(period);
      return await this.getDailyTotalsForUser(
        userId,
        startDate,
        endDate,
        trackerId
      );
    } catch (err) {
      logger.error(
        `Error getting daily totals for period: ${(err as Error).message}`
      );
      return { success: false, error: (err as Error).message };
    }
  },

  // Get total hours worked and target hours for a user
  async getTotalHoursForUser(
    userId: string,
    startDate: Date,
    endDate: Date,
    trackerId?: string
  ) {
    try {
      // Build where clause conditionally based on trackerId
      const whereClause: any = {
        tracker: {
          userId: userId,
          archived: false,
        },
        startTime: {
          gte: startDate,
          lte: endDate,
        },
      };

      // If trackerId is provided, add it to the filter
      if (trackerId) {
        whereClause.trackerId = trackerId;
      }

      // Get all sessions for the user within the date range
      const sessions = await prisma.session.findMany({
        where: whereClause,
        include: {
          tracker: {
            select: {
              id: true,
              trackerName: true,
              targetHours: true,
              workDays: true,
            },
          },
        },
      });

      // Calculate total hours worked
      const totalMinutesWorked = sessions.reduce((total, session) => {
        return total + session.durationMinutes;
      }, 0);
      const totalHoursWorked = parseFloat((totalMinutesWorked / 60).toFixed(2));

      // Calculate target hours for the period
      let totalTargetHours = 0;

      if (trackerId) {
        // For specific tracker, get its configuration
        const tracker = await prisma.tracker.findUnique({
          where: { id: trackerId },
        });

        if (tracker) {
          const workDays = new Set(tracker.workDays.split(",").map(Number));
          let workDaysCount = 0;

          let currentDate = new Date(startDate);
          while (currentDate <= endDate) {
            const dayOfWeek = currentDate.getDay();
            if (workDays.has(dayOfWeek)) {
              workDaysCount++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
          }

          totalTargetHours = workDaysCount * tracker.targetHours;
        }
      } else {
        // Get all active trackers for the user
        const activeTrackers = await prisma.tracker.findMany({
          where: { userId, archived: false },
        });

        for (const tracker of activeTrackers) {
          const workDays = new Set(tracker.workDays.split(",").map(Number));
          let workDaysCount = 0;

          let currentDate = new Date(startDate);
          while (currentDate <= endDate) {
            const dayOfWeek = currentDate.getDay();
            if (workDays.has(dayOfWeek)) {
              workDaysCount++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
          }

          totalTargetHours += workDaysCount * tracker.targetHours;
        }
      }

      totalTargetHours = parseFloat(totalTargetHours.toFixed(2));

      // Calculate difference
      const hoursDifference = parseFloat(
        (totalHoursWorked - totalTargetHours).toFixed(2)
      );
      const isAhead = hoursDifference >= 0;

      const result = {
        totalHoursWorked,
        totalTargetHours,
        hoursDifference: Math.abs(hoursDifference),
        isAhead,
        status: isAhead ? "ahead" : "behind",
        sessionCount: sessions.length,
        period: {
          startDate: this.getDateStr(startDate),
          endDate: this.getDateStr(endDate),
        },
      };

      return { success: true, data: result };
    } catch (err) {
      logger.error(
        `Error getting total hours for user: ${(err as Error).message}`
      );
      return { success: false, error: (err as Error).message };
    }
  },

  // Get total hours for predefined periods
  async getTotalHoursForPeriod(
    userId: string,
    period: "week" | "month" | "year",
    trackerId?: string
  ) {
    try {
      const { startDate, endDate } = this.getDateRange(period);
      return await this.getTotalHoursForUser(
        userId,
        startDate,
        endDate,
        trackerId
      );
    } catch (err) {
      logger.error(
        `Error getting total hours for period: ${(err as Error).message}`
      );
      return { success: false, error: (err as Error).message };
    }
  },

  // Productivity Trend
  async getProductivityTrendForUser(
    userId: string,
    startDate: Date,
    endDate: Date,
    trackerId?: string
  ) {
    try {
      // Build where clause conditionally based on trackerId
      const whereClause: any = {
        tracker: {
          userId: userId,
          archived: false,
        },
        startTime: {
          gte: startDate,
          lte: endDate,
        },
      };

      // If trackerId is provided, add it to the filter
      if (trackerId) {
        whereClause.trackerId = trackerId;
      }

      // Get all sessions for the user within the date range
      const sessions = await prisma.session.findMany({
        where: whereClause,
        include: {
          tracker: {
            select: {
              id: true,
              trackerName: true,
              targetHours: true,
              workDays: true,
            },
          },
        },
        orderBy: {
          startTime: "asc",
        },
      });

      // Calculate daily totals using helper function
      const dailyTotals = this.getDailyTotals(sessions, this.getDateStr);

      // Get tracker configurations
      let trackerConfigs: Map<string, any> = new Map();

      if (trackerId) {
        // For specific tracker
        const tracker = await prisma.tracker.findUnique({
          where: { id: trackerId },
        });
        if (tracker) {
          trackerConfigs.set(tracker.id, tracker);
        }
      } else {
        // For all trackers, get unique trackers from sessions
        const trackers = await prisma.tracker.findMany({
          where: {
            userId: userId,
            archived: false,
          },
        });
        trackers.forEach((tracker) => {
          trackerConfigs.set(tracker.id, tracker);
        });
      }

      // Calculate productivity scores for each day
      const result: Array<{
        date: string;
        score: number;
        hoursWorked: number;
        hoursTarget: number;
      }> = [];

      let score = 0;
      let currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateStr = this.getDateStr(currentDate);
        const dayOfWeek = currentDate.getDay();

        let totalHoursWorked = 0;
        let totalTargetHours = 0;
        let isWorkingDay = false;

        if (trackerId) {
          // For specific tracker
          const tracker = trackerConfigs.get(trackerId);
          if (tracker) {
            const workDays = new Set(tracker.workDays.split(",").map(Number));
            if (workDays.has(dayOfWeek)) {
              isWorkingDay = true;
              totalTargetHours = tracker.targetHours;
              totalHoursWorked = (dailyTotals[dateStr] || 0) / 60; // Convert minutes to hours
            }
          }
        } else {
          // For all trackers
          for (const [trackerId, tracker] of trackerConfigs) {
            const workDays = new Set(tracker.workDays.split(",").map(Number));
            if (workDays.has(dayOfWeek)) {
              isWorkingDay = true;
              totalTargetHours += tracker.targetHours;
            }
          }
          if (isWorkingDay) {
            totalHoursWorked = (dailyTotals[dateStr] || 0) / 60; // Convert minutes to hours
          }
        }

        // Only calculate score for working days
        if (isWorkingDay && totalTargetHours > 0) {
          score = Math.round((totalHoursWorked / totalTargetHours) * 100);
          result.push({
            date: dateStr,
            score: score,
            hoursWorked: parseFloat(totalHoursWorked.toFixed(2)),
            hoursTarget: parseFloat(totalTargetHours.toFixed(2)),
          });
        } else if (!isWorkingDay) {
          if (score !== 0) {
            score =
              totalHoursWorked > 0
                ? Math.round((totalHoursWorked / totalTargetHours) * 100) + 100
                : 100;
          }
          result.push({
            date: dateStr,
            score: score,
            hoursWorked: parseFloat(totalHoursWorked.toFixed(2)),
            hoursTarget: parseFloat(totalTargetHours.toFixed(2)),
          });
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return { success: true, data: result };
    } catch (err) {
      logger.error(
        `Error getting productivity trend for user: ${(err as Error).message}`
      );
      return { success: false, error: (err as Error).message };
    }
  },

  // Get productivity trend for predefined periods
  async getProductivityTrendForPeriod(
    userId: string,
    period: "week" | "month" | "year",
    trackerId?: string
  ) {
    try {
      const { startDate, endDate } = this.getDateRange(period);
      return await this.getProductivityTrendForUser(
        userId,
        startDate,
        endDate,
        trackerId
      );
    } catch (err) {
      logger.error(
        `Error getting productivity trend for period: ${(err as Error).message}`
      );
      return { success: false, error: (err as Error).message };
    }
  },

  // Get today's stats - hours worked and target hours
  async getTodayStats(userId: string, trackerId?: string) {
    try {
      const today = new Date();
      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      // Build where clause conditionally based on trackerId
      const whereClause: any = {
        tracker: {
          userId: userId,
          archived: false,
        },
        startTime: {
          gte: startOfDay,
          lte: endOfDay,
        },
      };

      // If trackerId is provided, add it to the filter
      if (trackerId) {
        whereClause.trackerId = trackerId;
      }

      // Get all sessions for today
      const sessions = await prisma.session.findMany({
        where: whereClause,
        include: {
          tracker: {
            select: {
              id: true,
              trackerName: true,
              targetHours: true,
              workDays: true,
            },
          },
        },
      });

      // Calculate total hours worked today
      const totalMinutesWorked = sessions.reduce((total, session) => {
        return total + session.durationMinutes;
      }, 0);
      const hoursWorked = parseFloat((totalMinutesWorked / 60).toFixed(2));

      // Calculate target hours for today
      let targetHours = 0;
      const dayOfWeek = today.getDay();

      if (trackerId) {
        // For specific tracker
        const tracker = await prisma.tracker.findUnique({
          where: { id: trackerId },
        });

        if (tracker) {
          const workDays = new Set(tracker.workDays.split(",").map(Number));
          if (workDays.has(dayOfWeek)) {
            targetHours = tracker.targetHours;
          }
        }
      } else {
        // For all active trackers
        const activeTrackers = await prisma.tracker.findMany({
          where: { userId, archived: false },
        });

        for (const tracker of activeTrackers) {
          const workDays = new Set(tracker.workDays.split(",").map(Number));
          if (workDays.has(dayOfWeek)) {
            targetHours += tracker.targetHours;
          }
        }
      }

      targetHours = parseFloat(targetHours.toFixed(2));

      // Calculate progress percentage
      const progressPercentage =
        targetHours > 0 ? Math.round((hoursWorked / targetHours) * 100) : 0;

      // Determine if today is a working day
      const isWorkingDay = targetHours > 0;

      const result = {
        date: this.getDateStr(today),
        hoursWorked,
        targetHours,
        progressPercentage,
        isWorkingDay,
        remainingHours: Math.max(
          0,
          parseFloat((targetHours - hoursWorked).toFixed(2))
        ),
        sessionCount: sessions.length,
        status: hoursWorked >= targetHours ? "completed" : "in_progress",
      };

      return { success: true, data: result };
    } catch (err) {
      logger.error(`Error getting today stats: ${(err as Error).message}`);
      return { success: false, error: (err as Error).message };
    }
  },

  // Helper function to get date string
  getDateStr(date: Date): string {
    return date.toISOString().split("T")[0];
  },

  // Helper function to get all sessions for a tracker
  async getAllSessionsForTracker(trackerId: string) {
    return await prisma.session.findMany({
      where: { trackerId },
      orderBy: { startTime: "asc" },
    });
  },

  // Helper function to calculate daily totals from sessions
  getDailyTotals(
    sessions: any[],
    getDateStr: (date: Date) => string
  ): Record<string, number> {
    const dailyTotals: Record<string, number> = {};
    for (const session of sessions) {
      const date = getDateStr(session.startTime);
      dailyTotals[date] = (dailyTotals[date] || 0) + session.durationMinutes;
    }
    return dailyTotals;
  },

  // Helper function to get predefined date ranges
  getDateRange(period: "week" | "month" | "year"): {
    startDate: Date;
    endDate: Date;
  } {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);

    let startDate: Date;

    switch (period) {
      case "week":
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 6); // Last 7 days
        break;
      case "month":
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 29); // Last 30 days
        break;
      case "year":
        startDate = new Date(today);
        startDate.setFullYear(today.getFullYear() - 1); // Last 365 days
        break;
      default:
        startDate = new Date(today);
        startDate.setDate(today.getDate() - 6);
    }

    startDate.setHours(0, 0, 0, 0);
    return { startDate, endDate };
  },
};
