import { redisConnection } from "../config/redis";
import ApiError from "../utils/ApiError.js";
import { verifyRefreshToken } from "../utils/jwt.util.js";

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

const rateLimitCreateMentor=async(req,res,next)=>{
  const id = req.user.id
  const ip = req.ip;

  await rateLimit(req, res, next, `rl:create:mentor:user:${id}`, 5, 1/30, "mentor creation");
  await rateLimit(req, res, next, `rl:create:mentor:ip:${ip}`, 20, 1/10, "mentor creation");
  
  next();
}

const rateLimitCollabDecision=async(req,res,next)=>{
  const id = req.user.id
  const ip = req.ip;

  await rateLimit(req, res, next, `rl:collab:decision:user:${id}`, 5, 1/30, "collab decision");
  await rateLimit(req, res, next, `rl:collab:decision:ip:${ip}`, 20, 1/10, "collab decision");
  
  next();
}

const rateLimitCollegeResetPassword=async(req,res,next)=>{
  const id = req.user.id
  const ip = req.ip;

  await rateLimit(req, res, next, `rl:college:reset:password:user:${id}`, 3, 1/120, "reset password");
  await rateLimit(req, res, next, `rl:college:reset:password:ip:${ip}`, 10, 1/30, "reset password");
  
  next();
}

const rateLimitAssignMentor = async(req,res,next)=>{
  const id = req.user.id
  const ip = req.ip;

  await rateLimit(req, res, next, `rl:assign:mentor:user:${id}`, 10, 1/30, "assign mentor");
  await rateLimit(req, res, next, `rl:assign:mentor:ip:${ip}`, 30, 1/10, "assign mentor");
  
  next();
}

const rateLimitJobApprovalDecision=async(req,res,next)=>{
  const id = req.user.id
  const ip = req.ip;

  await rateLimit(req, res, next, `rl:job:decision:user:${id}`, 5, 1/30, "job approval decision");
  await rateLimit(req, res, next, `rl:job:decision:ip:${ip}`, 20, 1/10, "job approval decision");
  
  next();
}

const rateLimitCollegeMentors  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res, next, `rl:college:mentors:user:${id}`, 60, 1/1, "college mentors");
  await rateLimit(req, res, next, `rl:college:mentors:ip:${ip}`, 120, 1/1, "college mentors");

  next();
};

const rateLimitCollegeMentorDetails  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res, next, `rl:college:mentor:details:user:${id}`, 60, 1/1, "college mentor details");
  await rateLimit(req, res, next, `rl:college:mentor:details:ip:${ip}`, 120, 1/1, "college mentor details");

  next();
};

const rateLimitCollabRequests  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res, next, `rl:collab:requests:user:${id}`, 60, 1/1, "collab requests");
  await rateLimit(req, res, next, `rl:collab:requests:ip:${ip}`, 120, 1/1, "collab requests");

  next();
};

const rateLimitCompanyDetailsForCollege  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res, next, `rl:college:company:details:user:${id}`, 60, 1/1, "company details");
  await rateLimit(req, res, next, `rl:college:company:details:ip:${ip}`, 120, 1/1, "company details");

  next();
};


const rateLimitJobRequestsForCollege  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res, next, `rl:college:job:requests:user:${id}`, 60, 1/1, "job requests");
  await rateLimit(req, res, next, `rl:college:job:requests:ip:${ip}`, 120, 1/1, "job requests");

  next();
};

const rateLimitJobDetailsForCollege  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res, next, `rl:college:job:detail:user:${id}`, 60, 1/1, "job details");
  await rateLimit(req, res, next, `rl:college:job:detail:ip:${ip}`, 120, 1/1, "job details");

  next();
};

const rateLimitExportMentors  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res, next, `rl:export:mentors:user:${id}`, 3, 1/30, "export mentors");
  await rateLimit(req, res, next, `rl:export:mentors:ip:${ip}`, 10, 1/20, "export mentors");

  next();
};

export {
  rateLimitLogin,
  rateLimitRegisterCollege,
  rateLimitRegisterCompany,
  rateLimitLogout,
  rateLimitRefresh,
  rateLimitMe,
  rateLimitCreateMentor,
  rateLimitCollabDecision,
  rateLimitCollegeResetPassword,
  rateLimitAssignMentor,
  rateLimitJobApprovalDecision,
  rateLimitCollegeMentors,
  rateLimitCollegeMentorDetails,
  rateLimitCollabRequests,
  rateLimitCompanyDetailsForCollege,
  rateLimitJobRequestsForCollege,
  rateLimitJobDetailsForCollege,
  rateLimitExportMentors
};