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

const rateLimitLogin = async(req,res,next)=>{
  const email = req.body?.email || req.ip;
  if (!email) return next();

  const key = `rl:login:${email}`;
  await rateLimit(req,res,next,key,5,1/30,"login")
}

export {rateLimitLogin}