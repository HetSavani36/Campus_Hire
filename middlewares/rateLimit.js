import { redisConnection } from "../config/redis.js";
import ApiError from "../utils/ApiError.js";
import { verifyRefreshToken } from "../utils/jwt.util.js";

const rateLimit = async (req, res,key,capacity,refillRate,apiName) => {
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
};

const rateLimitLogin = async (req, res, next) => {
  const email = req.body?.email;
  const ip = req.ip;

  if (email) await rateLimit(req, res, `rl:login:email:${email}`, 5, 1/30, "login");
  await rateLimit(req, res, `rl:login:ip:${ip}`, 20, 1/10, "login");

  next();
};

const rateLimitRegisterCollege = async (req, res, next) => {
  const email = req.body?.email;
  const ip = req.ip;

  if (email) await rateLimit(req, res,  `rl:register:college:email:${email}`, 3, 1/120, "college registration");
  await rateLimit(req, res,  `rl:register:college:ip:${ip}`, 15, 1/30, "college registration");

  next();
};

const rateLimitRegisterCompany = async (req, res, next) => {
  const email = req.body?.email;
  const ip = req.ip;

  if (email) await rateLimit(req, res,  `rl:register:company:email:${email}`, 3, 1/120, "company registration");
  await rateLimit(req, res,  `rl:register:company:ip:${ip}`, 15, 1/30, "company registration");

  next();
};

const rateLimitLogout  = async (req, res, next) => {
  const userId = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:logout:user:${userId}`, 30, 1/2, "logout");
  await rateLimit(req, res,  `rl:logout:ip:${ip}`, 100, 1 / 1, "logout");

  next();
};

const rateLimitRefresh = async (req, res, next) => {
  const refreshToken = req.cookies?.refreshToken;
  const ip = req.ip;

  if (!refreshToken) throw new ApiError(401, "No refresh token");

  const decoded = verifyRefreshToken(refreshToken); // contains sessionId

  const sessionId = decoded.sessionId;

  await rateLimit(req, res,  `rl:refresh:session:${sessionId}`, 60, 1/2, "refresh token");
  await rateLimit(req, res,  `rl:refresh:ip:${ip}`, 120, 1/1, "refresh token");

  next();
};


const rateLimitMe  = async (req, res, next) => {
  const userId = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:me:user:${userId}`, 100, 1/1, "profile");
  await rateLimit(req, res,  `rl:me:ip:${ip}`, 200, 1 / 1, "profile");

  next();
};

const rateLimitCreateMentor=async(req,res,next)=>{
  const id = req.user.id
  const ip = req.ip;

  await rateLimit(req, res,  `rl:create:mentor:user:${id}`, 5, 1/30, "mentor creation");
  await rateLimit(req, res,  `rl:create:mentor:ip:${ip}`, 20, 1/10, "mentor creation");
  
  next();
}

const rateLimitCollabDecision=async(req,res,next)=>{
  const id = req.user.id
  const ip = req.ip;

  await rateLimit(req, res,  `rl:collab:decision:user:${id}`, 5, 1/30, "collab decision");
  await rateLimit(req, res,  `rl:collab:decision:ip:${ip}`, 20, 1/10, "collab decision");
  
  next();
}

const rateLimitCollegeResetPassword=async(req,res,next)=>{
  const id = req.user.id
  const ip = req.ip;

  await rateLimit(req, res,  `rl:college:reset:password:user:${id}`, 3, 1/120, "reset password");
  await rateLimit(req, res,  `rl:college:reset:password:ip:${ip}`, 10, 1/30, "reset password");
  
  next();
}

const rateLimitAssignMentor = async(req,res,next)=>{
  const id = req.user.id
  const ip = req.ip;

  await rateLimit(req, res,  `rl:assign:mentor:user:${id}`, 10, 1/30, "assign mentor");
  await rateLimit(req, res,  `rl:assign:mentor:ip:${ip}`, 30, 1/10, "assign mentor");
  
  next();
}

const rateLimitJobApprovalDecision=async(req,res,next)=>{
  const id = req.user.id
  const ip = req.ip;

  await rateLimit(req, res,  `rl:job:decision:user:${id}`, 5, 1/30, "job approval decision");
  await rateLimit(req, res,  `rl:job:decision:ip:${ip}`, 20, 1/10, "job approval decision");
  
  next();
}

const rateLimitCollegeMentors  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:college:mentors:user:${id}`, 60, 1/1, "college mentors");
  await rateLimit(req, res,  `rl:college:mentors:ip:${ip}`, 120, 1/1, "college mentors");

  next();
};

const rateLimitCollegeMentorDetails  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:college:mentor:details:user:${id}`, 60, 1/1, "college mentor details");
  await rateLimit(req, res,  `rl:college:mentor:details:ip:${ip}`, 120, 1/1, "college mentor details");

  next();
};

const rateLimitCollabRequests  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:collab:requests:user:${id}`, 60, 1/1, "collab requests");
  await rateLimit(req, res,  `rl:collab:requests:ip:${ip}`, 120, 1/1, "collab requests");

  next();
};

const rateLimitCompanyDetailsForCollege  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:college:company:details:user:${id}`, 60, 1/1, "company details");
  await rateLimit(req, res,  `rl:college:company:details:ip:${ip}`, 120, 1/1, "company details");

  next();
};


const rateLimitJobRequestsForCollege  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:college:job:requests:user:${id}`, 60, 1/1, "job requests");
  await rateLimit(req, res,  `rl:college:job:requests:ip:${ip}`, 120, 1/1, "job requests");

  next();
};

const rateLimitJobDetailsForCollege  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:college:job:detail:user:${id}`, 60, 1/1, "job details");
  await rateLimit(req, res,  `rl:college:job:detail:ip:${ip}`, 120, 1/1, "job details");

  next();
};

const rateLimitExportMentors  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,   `rl:export:mentors:user:${id}`, 3, 1/30, "export mentors");
  await rateLimit(req, res,  `rl:export:mentors:ip:${ip}`, 10, 1/20, "export mentors");

  next();
};

const rateLimitExportEmployees  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:export:employees:user:${id}`, 3, 1/30, "export employees");
  await rateLimit(req, res,  `rl:export:employees:ip:${ip}`, 10, 1/20, "export employees");

  next();
};

const rateLimitEmployeesForCompany  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:company:employees:user:${id}`, 60, 1/1, "company employees");
  await rateLimit(req, res,  `rl:company:employees:ip:${ip}`, 120, 1/1, "company employees");

  next();
};

const rateLimitEmployeeDetailsForCompany  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:company:employee:details:user:${id}`, 60, 1/1, "employee details");
  await rateLimit(req, res,  `rl:company:employee:details:ip:${ip}`, 120, 1/1, "employee details");

  next();
};

const rateLimitCollegesForCompany  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:company:colleges:user:${id}`, 60, 1/1, "colleges");
  await rateLimit(req, res,  `rl:company:colleges:ip:${ip}`, 120, 1/1, "colleges");

  next();
};

const rateLimitCollegeDetailsForCompany  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:company:college:details:user:${id}`, 60, 1/1, "college details");
  await rateLimit(req, res,  `rl:company:college:details:ip:${ip}`, 120, 1/1, "college details");

  next();
};

const rateLimitSkillsForCompany  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:company:skills:user:${id}`, 60, 1/1, "skills");
  await rateLimit(req, res,  `rl:company:skills:ip:${ip}`, 120, 1/1, "skills");

  next();
};

const rateLimitJobsForCompany  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:company:jobs:user:${id}`, 60, 1/1, "jobs");
  await rateLimit(req, res,  `rl:company:jobs:ip:${ip}`, 120, 1/1, "jobs");

  next();
};

const rateLimitJobDetailsForCompany  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:company:job:details:user:${id}`, 60, 1/1, "job details");
  await rateLimit(req, res,  `rl:company:job:details:ip:${ip}`, 120, 1/1, "job details");

  next();
};


const rateLimitCreateEmployee=async(req,res,next)=>{
  const id = req.user.id
  const ip = req.ip;

  await rateLimit(req, res,  `rl:create:employee:user:${id}`, 5, 1/30, "employee creation");
  await rateLimit(req, res,  `rl:create:employee:ip:${ip}`, 20, 1/10, "employee creation");
  
  next();
}

const rateLimitCollabRequest=async(req,res,next)=>{
  const id = req.user.id
  const ip = req.ip;

  await rateLimit(req, res,  `rl:collab:request:user:${id}`, 10, 1/20, "collab request");
  await rateLimit(req, res,  `rl:collab:request:ip:${ip}`, 30, 1/10, "collab request");
  
  next();
}

const rateLimitCompanyResetPassword=async(req,res,next)=>{
  const id = req.user.id
  const ip = req.ip;

  await rateLimit(req, res,  `rl:company:reset:password:user:${id}`, 3, 1/120, "reset password");
  await rateLimit(req, res,  `rl:company:reset:password:ip:${ip}`, 10, 1/30, "reset password");
  
  next();
}

const rateLimitPostJob = async(req,res,next)=>{
  const id = req.user.id
  const ip = req.ip;

  await rateLimit(req, res,  `rl:post:job:user:${id}`, 3, 1/120, "post job");
  await rateLimit(req, res,  `rl:post:job:ip:${ip}`, 10, 1/30, "post job");
  
  next();
}

const rateLimitAddSkillForCompany = async(req,res,next)=>{
  const id = req.user.id
  const ip = req.ip;

  await rateLimit(req, res,  `rl:company:add:skill:user:${id}`, 10, 1/20, "add skill");
  await rateLimit(req, res,  `rl:company:add:skill:ip:${ip}`, 30, 1/10, "add skill");
  
  next();
}

const rateLimitStudentApplicationDecisionForCompany = async(req,res,next)=>{
  const id = req.user.id
  const ip = req.ip;

  await rateLimit(req, res,  `rl:company:student:application:decision:user:${id}`, 5, 1/45, "application decision");
  await rateLimit(req, res,  `rl:company:student:application:decision:ip:${ip}`, 30, 1/15, "application decision");
  
  next();
}

const rateLimitStudentApplicationDecisionForMentor = async(req,res,next)=>{
  const id = req.user.id
  const ip = req.ip;

  await rateLimit(req, res,  `rl:mentor:student:application:decision:user:${id}`, 5, 1/45, "application decision");
  await rateLimit(req, res,  `rl:mentor:student:application:decision:ip:${ip}`, 30, 1/15, "application decision");
  
  next();
}

const rateLimitChangePassword=async(req,res,next)=>{
  const id = req.user.id
  const ip = req.ip;

  await rateLimit(req, res,  `rl:change:password:user:${id}`, 3, 1/120, "change password");
  await rateLimit(req, res,  `rl:change:password:ip:${ip}`, 10, 1/30, "change password");
  
  next();
}

const rateLimitJobsForStudent  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:student:jobs:user:${id}`, 60, 1/1, "jobs");
  await rateLimit(req, res,  `rl:student:jobs:ip:${ip}`, 120, 1/1, "jobs");

  next();
};


const rateLimitJobDetailsForStudent  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:student:job:details:user:${id}`, 60, 1/1, "job details");
  await rateLimit(req, res,  `rl:student:job:details:ip:${ip}`, 120, 1/1, "job details");

  next();
};

const rateLimitUploadBulkStudents  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:upload:bulk:students:user:${id}`, 3, 1/120, "bulk students uploadation");
  await rateLimit(req, res,  `rl:upload:bulk:students:ip:${ip}`, 7, 1/60, "bulk students uploadation");

  next();
};

const rateLimitCreateStudentProfile  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:student:create:profile:user:${id}`, 3, 1/60, "create student profile");
  await rateLimit(req, res,  `rl:student:create:profile:ip:${ip}`, 30, 1/20, "create student profile");

  next();
};

const rateLimitEditStudentProfile  = async (req, res, next) => {
  const id = req.user.id;
  const ip = req.ip;

  await rateLimit(req, res,  `rl:student:edit:profile:user:${id}`, 5, 1/30, "edit student profile");
  await rateLimit(req, res,  `rl:student:edit:profile:ip:${ip}`, 20, 1/20, "edit student profile");

  next();
};

const rateLimitAddSkillForStudent = async(req,res,next)=>{
  const id = req.user.id
  const ip = req.ip;

  await rateLimit(req, res,  `rl:student:add:skill:user:${id}`, 10, 1/20, "add skill");
  await rateLimit(req, res,  `rl:student:add:skill:ip:${ip}`, 30, 1/10, "add skill");
  
  next();
}

const rateLimitApplyInJob = async(req,res,next)=>{
  const id = req.user.id
  const ip = req.ip;

  await rateLimit(req, res,  `rl:apply:job:user:${id}`, 5, 1/30, "apply job");
  await rateLimit(req, res,  `rl:apply:job:ip:${ip}`, 30, 1/20, "apply job");
  
  next();
}

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
  rateLimitExportMentors,
  rateLimitExportEmployees,
  rateLimitEmployeesForCompany,
  rateLimitEmployeeDetailsForCompany,
  rateLimitCollegesForCompany,
  rateLimitCollegeDetailsForCompany,
  rateLimitSkillsForCompany,
  rateLimitJobsForCompany,
  rateLimitJobDetailsForCompany,
  rateLimitCreateEmployee,
  rateLimitCollabRequest,
  rateLimitCompanyResetPassword,
  rateLimitPostJob,
  rateLimitAddSkillForCompany,
  rateLimitStudentApplicationDecisionForCompany,
  rateLimitStudentApplicationDecisionForMentor,
  rateLimitChangePassword,
  rateLimitJobsForStudent,
  rateLimitJobDetailsForStudent,
  rateLimitUploadBulkStudents,
  rateLimitCreateStudentProfile,
  rateLimitEditStudentProfile,
  rateLimitAddSkillForStudent,
  rateLimitApplyInJob
};