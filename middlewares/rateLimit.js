import { redisConnection } from "../config/redis";
import ApiError from "../utils/ApiError.js";

const rateLimit = async (req, res, next,key,capacity,refillRate,apiName) => {
  const now = Date.now();

  const data = await redisConnection.hgetall(key);

  let tokens = data.tokens ? parseFloat(data.tokens) : capacity;
  let lastRefill = data.lastRefill ? parseInt(data.lastRefill) : now;

  const elapsed = (now - lastRefill) / 1000;
  const refill = elapsed * refillRate;

  tokens = Math.min(capacity, tokens + refill);

  if (tokens < 1) {
    const retryAfter = Math.ceil((1 - tokens) / refillRate);
    res.setHeader("Retry-After", retryAfter);
    throw new ApiError(429,`Too many ${apiName} attempts. Try again in ${retryAfter}s`);
  }

  tokens -= 1;

  await redisConnection.hset(key, {
    tokens,
    lastRefill: now,
  });

  await redisConnection.expire(key, 24 * 60 * 60); // auto cleanup

  next();
};

const rateLimitLogin = async (req, res, next) => {
  const email = req.body?.email;
  const ip = req.ip;

  if (email) await rateLimit(req, res, next, `rl:login:email:${email}`, 5, 1/30, "login");
  await rateLimit(req, res, next, `rl:login:ip:${ip}`, 20, 1/10, "login");

  next();
};

const rateLimitRegisterCollege = async (req, res, next) => {
  const email = req.body?.email;
  const ip = req.ip;

  if (email) await rateLimit(req, res, next, `rl:register:college:email:${email}`, 3, 1/120, "college registration");
  await rateLimit(req, res, next, `rl:register:college:ip:${ip}`, 15, 1/30, "college registration");

  next();
};

const rateLimitRegisterCompany = async (req, res, next) => {
  const email = req.body?.email;
  const ip = req.ip;

  if (email) await rateLimit(req, res, next, `rl:register:company:email:${email}`, 3, 1/120, "company registration");
  await rateLimit(req, res, next, `rl:register:company:ip:${ip}`, 15, 1/30, "company registration");

  next();
};

const rateLimitLogout  = async (req, res, next) => {
  const userId = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res, next, `rl:logout:user:${userId}`, 30, 1/2, "logout");
  await rateLimit(req, res, next, `rl:logout:ip:${ip}`, 100, 1 / 1, "logout");

  next();
};

const rateLimitRefresh = async (req, res, next) => {
  const refreshToken = req.cookies?.refreshToken;
  const ip = req.ip;

  if (!refreshToken) throw new ApiError(401, "No refresh token");

  const decoded = verifyRefreshToken(refreshToken); // contains sessionId

  const sessionId = decoded.sessionId;

  await rateLimit(req, res, next, `rl:refresh:session:${sessionId}`, 60, 1/2, "refresh token");
  await rateLimit(req, res, next, `rl:refresh:ip:${ip}`, 120, 1/1, "refresh token");

  next();
};


const rateLimitMe  = async (req, res, next) => {
  const userId = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res, next, `rl:me:user:${userId}`, 100, 1/1, "profile");
  await rateLimit(req, res, next, `rl:me:ip:${ip}`, 200, 1 / 1, "profile");

  next();
};

export {
  rateLimitLogin,
  rateLimitRegisterCollege,
  rateLimitRegisterCompany,
  rateLimitLogout,
  rateLimitRefresh,
  rateLimitMe
};