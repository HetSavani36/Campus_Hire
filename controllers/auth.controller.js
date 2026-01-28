import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import { PrismaClient } from "@prisma/client";
import { comparePassword, hashPassword } from "../utils/password.util.js";
import {
  generateAccessToken,
  generateRefreshToken,
  options,
  verifyRefreshToken,
} from "../utils/jwt.util.js";
import { emailOptions, emailQueue } from "../queues/email-queue.js";
import crypto from "crypto"
import { redisConnection } from "../config/redis.js";

const prisma = new PrismaClient();

const registerCollege = asyncHandler(async (req, res) => {
  log.info("registerCollege request received", {
    requestId: req.requestId,
    email: req.body?.email,
    ip: req.ip,
  });

  const { name, address, email, phone, password, confirmPassword } = req.body;

  if (!name || !address || !email || !password || !confirmPassword) {
    log.warn("registerCollege validation failed: missing fields", {
      requestId: req.requestId,
      email,
    });
    throw new ApiError(400, "provide all fields");
  }

  if (password !== confirmPassword) {
    log.warn("registerCollege password mismatch", {
      requestId: req.requestId,
      email,
    });
    throw new ApiError(403, "password and confirm password must be same");
  }

  if (address.length < 2 || name.length < 2) {
    log.warn("registerCollege validation failed: name/address too short", {
      requestId: req.requestId,
      email,
    });
    throw new ApiError(403, "invalid name or address length");
  }

  let college = null;
  let collegeAdmin = null;

  try {
    const txStart = Date.now();

    await prisma.$transaction(async (tx) => {
      college = await tx.college.create({
        data: {
          name: name.toUpperCase(),
          address: address,
          email: email.toLowerCase(),
          phone: phone ?? "NA",
        },
      });

      const hashedPassword = await hashPassword(password);

      collegeAdmin = await tx.user.create({
        data: {
          name: name.toUpperCase(),
          email: email,
          password: hashedPassword,
          role: "collegeAdmin",
        },
      });

      collegeAdmin.password = undefined;
    });

    log.info("registerCollege DB transaction completed", {
      requestId: req.requestId,
      collegeId: college.id,
      adminId: collegeAdmin.id,
      durationMs: Date.now() - txStart,
    });
  } catch (err) {
    if (err.code === "P2002") {
      log.warn("registerCollege duplicate email attempt", {
        requestId: req.requestId,
        email,
      });
      throw new ApiError(409, "email is already registered");
    }

    log.error("registerCollege transaction failed", {
      requestId: req.requestId,
      email,
      error: err.message,
    });
    throw new ApiError(409, err);
  }

  await emailQueue.add(
    "register-college",
    {
      name: college.name,
      email: college.email,
    },
    emailOptions,
  );

  log.info("registerCollege email queued", {
    requestId: req.requestId,
    collegeId: college.id,
    email: college.email,
  });

  await redisConnection.incr("colleges:version");

  log.info("registerCollege cache invalidated", {
    requestId: req.requestId,
    key: "colleges:version",
  });

  res.json(
    new ApiResponse(
      201,
      { college: college, admin: collegeAdmin },
      "college registered successfully",
    ),
  );

  log.info("registerCollege completed successfully", {
    requestId: req.requestId,
    collegeId: college.id,
    adminId: collegeAdmin.id,
  });
});


const registerCompany = asyncHandler(async (req, res) => {
  log.info("registerCompany request received", {
    requestId: req.requestId,
    email: req.body?.email,
    ip: req.ip,
  });

  const {
    name,
    address,
    email,
    password,
    confirmPassword,
    registrationNo,
    contactNo,
  } = req.body;

  if (
    !name ||
    !address ||
    !email ||
    !password ||
    !confirmPassword ||
    !contactNo ||
    !registrationNo
  ) {
    log.warn("registerCompany validation failed: missing fields", {
      requestId: req.requestId,
      email,
    });
    throw new ApiError(403, "provide all fields");
  }

  if (password !== confirmPassword) {
    log.warn("registerCompany password mismatch", {
      requestId: req.requestId,
      email,
    });
    throw new ApiError(403, "password and confirm password must be same");
  }

  if (address.length < 2 || name.length < 2) {
    log.warn("registerCompany validation failed: name/address too short", {
      requestId: req.requestId,
      email,
    });
    throw new ApiError(403, "invalid name or address length");
  }

  let company = null;
  let companyAdmin = null;

  try {
    const txStart = Date.now();

    await prisma.$transaction(async (tx) => {
      company = await tx.company.create({
        data: {
          name: name.toUpperCase(),
          registrationNo: registrationNo,
          address: address,
          email: email,
          contactNo: contactNo,
        },
      });
    });

    const hashedPassword = await hashPassword(password);

    companyAdmin = await tx.user.create({
      data: {
        name: name.toUpperCase(),
        email: email,
        password: hashedPassword,
        role: "companyAdmin",
      },
    });

    companyAdmin.password = undefined;

    log.info("registerCompany DB transaction completed", {
      requestId: req.requestId,
      companyId: company.id,
      adminId: companyAdmin.id,
      durationMs: Date.now() - txStart,
    });
  } catch (err) {
    if (err.code === "P2002") {
      log.warn("registerCompany duplicate email attempt", {
        requestId: req.requestId,
        email,
      });
      throw new ApiError(409, "email is already registered");
    }

    log.error("registerCompany failed", {
      requestId: req.requestId,
      email,
      error: err.message,
    });

    throw new ApiError(409, err);
  }

  await emailQueue.add(
    "register-company",
    {
      name: company.name,
      email: company.email,
    },
    emailOptions,
  );

  log.info("registerCompany email queued", {
    requestId: req.requestId,
    companyId: company.id,
    email: company.email,
  });

  res.json(
    new ApiResponse(
      201,
      { company: company, admin: companyAdmin },
      "company registered successfully",
    ),
  );

  log.info("registerCompany completed successfully", {
    requestId: req.requestId,
    companyId: company.id,
    adminId: companyAdmin.id,
  });
});


const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  log.info("login request received", {
    requestId: req.requestId,
    email,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  if (!email || !password) {
    log.warn("login validation failed: missing credentials", {
      requestId: req.requestId,
      email,
    });
    throw new ApiError(403, "please provide all details");
  }

  const user = await prisma.user.findUnique({ where: { email: email } });
  if (!user) {
    log.warn("login failed: user not found", {
      requestId: req.requestId,
      email,
    });
    throw new ApiError(404, "no such user found");
  }

  const isPasswordCorrect = await comparePassword(password, user.password);
  if (!isPasswordCorrect) {
    log.warn("login failed: incorrect password", {
      requestId: req.requestId,
      userId: user.id,
      email,
    });
    throw new ApiError(403, "incorrect password");
  }

  const sessionStart = Date.now();

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const refreshToken = generateRefreshToken({
    userId: user.id,
    sessionId: session.id,
  });

  const refreshTokenHash = crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex");

  await prisma.session.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: refreshTokenHash,
    },
  });

  log.info("login session created", {
    requestId: req.requestId,
    userId: user.id,
    sessionId: session.id,
    durationMs: Date.now() - sessionStart,
  });

  user.password = undefined;
  const accessToken = generateAccessToken(user);

  res
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(new ApiResponse(200, user, `${user.role} logged in successfully`));

  log.info("login completed successfully", {
    requestId: req.requestId,
    userId: user.id,
    role: user.role,
  });
});


const logout = asyncHandler(async (req, res) => {
  let decoded;

  log.info("logout request received", {
    requestId: req.requestId,
    ip: req.ip,
    userAgent: req.headers["user-agent"],
  });

  try {
    decoded = verifyRefreshToken(req.cookies.refreshToken);
  } catch (err) {
    log.warn("logout called with invalid or missing refresh token", {
      requestId: req.requestId,
      ip: req.ip,
    });
    // ignore (as per original logic)
  }

  if (decoded?.sessionId) {
    const result = await prisma.session.updateMany({
      where: { id: decoded.sessionId },
      data: { revokedAt: new Date() },
    });

    log.info("logout session revoked", {
      requestId: req.requestId,
      sessionId: decoded.sessionId,
      affectedRows: result.count,
    });
  } else {
    log.info("logout completed without active session", {
      requestId: req.requestId,
    });
  }

  res
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "user logout successfully"));

  log.info("logout completed successfully", {
    requestId: req.requestId,
  });
});


const refreshController = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies?.refreshToken;
  if (!incomingRefreshToken) throw new ApiError(401, "no refresh token provided");

  const incomingRefreshTokenHash=crypto
    .createHash("sha256")
    .update(incomingRefreshToken)
    .digest("hex")

  const decoded = verifyRefreshToken(incomingRefreshToken);
  if (decoded.type !== "refresh") throw new ApiError(403, "invalid token type");

  const session=await prisma.session.findUnique({
    where:{id:decoded.sessionId}
  })
  if(!session) throw new ApiError(404,"no such session found")
  if (!session.refreshTokenHash) throw new ApiError(403, "session not initialized");
  if (session.revokedAt) throw new ApiError(403, "session revoked");
  if(session.expiresAt<new Date()) throw new ApiError(403,"session expires")
  if (incomingRefreshTokenHash !== session.refreshTokenHash) {
    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    throw new ApiError(401, "token mismatch");
  }

  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
  });
  if (!user) throw new ApiError(404, "user not found");

  
  const newRefreshToken = generateRefreshToken({ userId:user.id, sessionId:session.id });
  const newHash=crypto
    .createHash("sha256")
    .update(newRefreshToken)
    .digest("hex")
    
  await prisma.session.update({
    where: { id: session.id },
    data: {
      refreshTokenHash: newHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  
  const accessToken = generateAccessToken(user);
  res
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", newRefreshToken, options)
    .json(new ApiResponse(200, {}, "refreshed token successfully"));
});

const getMe = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select:{
      createdAt:true,
      email:true,
      id:true,
      name:true,
      role:true,
      hasCompletedProfile:true
    }
  });
  if (!user) throw new ApiError(404, "user not found");

  res.json(new ApiResponse(200, user, "user profile"));
});

export {
  registerCollege,
  registerCompany,
  login,
  logout,
  refreshController,
  getMe,
};
