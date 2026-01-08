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

const prisma = new PrismaClient();

const registerCollege = asyncHandler(async (req, res) => {
  const { name, address, email, phone, password, confirmPassword } = req.body;
  
  if (!name || !address || !email || !password || !confirmPassword) throw new ApiError(400, "provide all fields");
  if (password !== confirmPassword) throw new ApiError(403, "password and confirm password must be same");
  if (address.length < 2) throw new ApiError(403, "address must be greater than 1 characters");
  if (name.length < 2) throw new ApiError(403, "name must be greater than 1 characters");

  let college=null
  let collegeAdmin=null

  try {
    await prisma.$transaction(async(tx)=>{
      college=await tx.college.create({
        data: {
          name: name.toUpperCase(),
          address: address,
          email: email.toLowerCase(),
          phone: phone ?? "NA",
        },
      })

      const hashedPassword = await hashPassword(password);
      
      collegeAdmin=await tx.user.create({
        data: {
          name: name.toUpperCase(),
          email: email,
          password: hashedPassword,
          role: "collegeAdmin",
        },
      })
      collegeAdmin.password = undefined;
    })
  } catch (err) {
    if (err.code === "P2002") throw new ApiError(409, "email is already registered");
    throw new ApiError(409,err)
  }

  await emailQueue.add(
    "register-college",
    {
      name: college.name,
      email: college.email
    },
    emailOptions
  );
  
  res.json(
    new ApiResponse(
      201,
      { college:college, admin:collegeAdmin },
      "college registered successfully"
    )
  );
});

const registerCompany = asyncHandler(async (req, res) => {
  const { name, address, email, password, confirmPassword, registrationNo, contactNo, } = req.body;
  if ( !name || !address || !email || !password || !confirmPassword || !contactNo || !registrationNo ) throw new ApiError(403, "provide all fields");
  if (password !== confirmPassword) throw new ApiError(403, "password and confirm password must be same");
  if (address.length < 2) throw new ApiError(403, "address must be greater than 1 characters");
  if (name.length < 2) throw new ApiError(403, "name must be greater than 1 characters");

  let company=null
  let companyAdmin=null

  try {
    await prisma.$transaction(async(tx)=>{
      company = await tx.company.create({
          data: {
            name: name.toUpperCase(),
            registrationNo: registrationNo,
            address: address,
            email: email,
            contactNo: contactNo,
          },
        });
      })

      const hashedPassword = await hashPassword(password);
      companyAdmin=await tx.user.create({
        data: {
          name: name.toUpperCase(),
          email: email,
          password: hashedPassword,
          role: "companyAdmin",
        },
      })
      companyAdmin.password = undefined;
  } 
  catch (err) {
    if (err.code === "P2002") throw new ApiError(409, "email is already registered");
    throw new ApiError(409, err);
  }

  await emailQueue.add(
    "register-company",
    {
      name: company.name,
      email: company.email,
    },
    emailOptions
  );

  res.json(
    new ApiResponse(
      201,
      { company:company, admin:companyAdmin },
      "company registered successfully"
    )
  );
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    throw new ApiError(403, "please provide all details");

  const user = await prisma.user.findUnique({ where: { email: email } });
  if (!user) throw new ApiError(404, "no such user found");

  const isPasswordCorrect = await comparePassword(password, user.password);
  if (!isPasswordCorrect) throw new ApiError(403, "incorrect password");
  
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
      expiresAt: new Date(Date.now() + 7*24*60*60*1000),
    },
  });
  
  const refreshToken=generateRefreshToken(
    {
      userId:user.id,
      sessionId:session.id
    }
  )
  
  const refreshTokenHash=crypto
    .createHash("sha256")
    .update(refreshToken)
    .digest("hex")

  await prisma.session.update({
    where:{id:session.id},
    data:{
      refreshTokenHash:refreshTokenHash
    }
  })

  await prisma.session.deleteMany({
    where: {
      userId: user.id,
      expiresAt: { lt: new Date() },
    },
  });


  user.password = undefined;
  
  const accessToken = generateAccessToken(user);

  res
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(new ApiResponse(200, user, `${user.role} logged in  successfully`));
});

const logout = asyncHandler(async (req, res) => {
  let decoded;
  try {
    decoded = verifyRefreshToken(req.cookies.refreshToken);
  } catch (err) {
    // ignore
  }

  if (decoded?.sessionId) {
    await prisma.session.updateMany({
      where: { id: decoded.sessionId },
      data: { revokedAt: new Date() },
    });
  }

  res
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "user logout successfully"));
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

  const incomingHash = crypto
    .createHash("sha256")
    .update(incomingRefreshToken)
    .digest("hex");

  if(incomingHash!==session.refreshTokenHash) throw new ApiError(401,"token mismatch")

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
