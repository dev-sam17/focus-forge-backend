import { Request, Response, NextFunction } from "express";
import redisClient from "../models/redis";
import logger from "../utils/logger";

// Cache TTL in seconds (5 minutes)
const CACHE_TTL = 5 * 60;

// Generate cache key based on request
const generateCacheKey = (req: Request): string => {
  const userId = req.params.userId || (req.query.userId as string);
  const { period, trackerId, startDate, endDate } = req.query;

  // Create a unique key based on route and parameters
  let key = `cache:${req.route?.path || req.path}:${userId}`;

  if (period) key += `:${period}`;
  if (trackerId) key += `:tracker:${trackerId}`;
  if (startDate && endDate) key += `:${startDate}:${endDate}`;

  return key;
};

// Cache middleware
export const cacheMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Skip caching for non-GET requests
  if (req.method !== "GET") {
    return next();
  }

  const cacheKey = generateCacheKey(req);

  redisClient
    .get(cacheKey)
    .then((cachedData) => {
      if (cachedData) {
        logger.info(`Cache hit for key: ${cacheKey}`);
        return res.json(JSON.parse(cachedData));
      }

      // Cache miss - continue to controller
      logger.info(`Cache miss for key: ${cacheKey}`);

      // Store original res.json method
      const originalJson = res.json.bind(res);

      // Override res.json to cache the response
      res.json = function (data: any) {
        // Only cache successful responses
        if (data && data.success) {
          redisClient
            .setex(cacheKey, CACHE_TTL, JSON.stringify(data))
            .then(() => {
              logger.info(
                `Cached data for key: ${cacheKey} with TTL: ${CACHE_TTL}s`
              );
            })
            .catch((err) => {
              logger.error(`Failed to cache data for key: ${cacheKey}`, err);
            });
        }

        // Call original json method
        return originalJson(data);
      };

      next();
    })
    .catch((err) => {
      logger.error(`Redis error for key: ${cacheKey}`, err);
      // Continue without caching on Redis error
      next();
    });
};

// Cache invalidation helper
export const invalidateUserCache = async (userId: string, pattern?: string) => {
  try {
    const searchPattern = pattern || `cache:*:${userId}*`;
    const keys = await redisClient.keys(searchPattern);

    if (keys.length > 0) {
      await redisClient.del(...keys);
      logger.info(
        `Invalidated ${keys.length} cache entries for user: ${userId}`
      );
    }
  } catch (err) {
    logger.error(`Failed to invalidate cache for user: ${userId}`, err);
  }
};

// Cache invalidation for specific tracker
export const invalidateTrackerCache = async (
  userId: string,
  trackerId: string
) => {
  await invalidateUserCache(userId, `cache:*:${userId}*tracker:${trackerId}*`);
};

// Middleware to invalidate user cache after POST/PUT operations
export const invalidateAllCacheMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Store original res.json method
  const originalJson = res.json.bind(res);

  // Override res.json to invalidate cache after successful operations
  res.json = function (data: any) {
    // Only invalidate cache for successful POST/PUT operations
    if (
      (req.method === "POST" || req.method === "PUT") &&
      data &&
      data.success
    ) {
      // Get userId from params, query, or response data
      const userId =
        req.params.userId || (req.query.userId as string) || data.data?.userId;

      if (userId) {
        // Invalidate cache entries for this specific user
        invalidateUserCache(userId)
          .then(() => {
            logger.info(
              `User cache invalidated for userId: ${userId} after successful ${req.method} operation`
            );
          })
          .catch((err) => {
            logger.error(
              `Failed to invalidate user cache for userId: ${userId}:`,
              err
            );
          });
      }
    }

    // Call original json method
    return originalJson(data);
  };

  next();
};
