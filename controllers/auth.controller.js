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
const prisma = new PrismaClient();

const registerCollege = asyncHandler(async (req, res) => {
  const { name, address, email, phone, password, confirmPassword } = req.body;
  if (!name || !address || !email || !password || !confirmPassword)
    throw new ApiError(403, "provide all fields");

  if (password.toUpperCase() !== confirmPassword.toUpperCase())
    throw new ApiError(403, "password and confirm password must be same");

  if (address.length < 2)
    throw new ApiError(403, "address must be greater than 1 characters");
  if (name.length < 2)
    throw new ApiError(403, "name must be greater than 1 characters");

  let exists = await prisma.college.findFirst({
    where: {
      OR: [{ name: name }, { email: email }],
    },
  });
  if (exists) throw new ApiError(403, "this college already exists");

  exists = await prisma.user.findFirst({
    where: {
      OR: [{ name: name }, { email: email }],
    },
  });
  if (exists) throw new ApiError(403, "this user already exists");

  const hashedPassword = await hashPassword(password);

  const [college, collegeAdmin] = await prisma.$transaction([
    prisma.college.create({
      data: {
        name: name.toUpperCase(),
        address: address,
        email: email,
        phone: phone ?? "NA",
      },
    }),

    prisma.user.create({
      data: {
        name: name.toUpperCase(),
        email: email,
        password: hashedPassword,
        role: "collegeAdmin",
      },
    }),
  ]);

  const refreshToken = generateRefreshToken(collegeAdmin);

  await prisma.user.update({
    where: { id: collegeAdmin.id },
    data: { refreshToken: refreshToken },
  });

  collegeAdmin.password = undefined;
  collegeAdmin.refreshToken = undefined;

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
      { college, collegeAdmin },
      "college registered successfully"
    )
  );
});

const registerCompany = asyncHandler(async (req, res) => {
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
  )
    throw new ApiError(403, "provide all fields");

  if (password.toUpperCase() !== confirmPassword.toUpperCase())
    throw new ApiError(403, "password and confirm password must be same");

  if (address.length < 2)
    throw new ApiError(403, "address must be greater than 1 characters");
  if (name.length < 2)
    throw new ApiError(403, "name must be greater than 1 characters");

  let exists = await prisma.company.findFirst({
    where: {
      OR: [
        { name: name },
        { email: email },
        { registrationNo: registrationNo },
      ],
    },
  });
  if (exists) throw new ApiError(403, "this company already exists");

  exists = await prisma.user.findFirst({
    where: {
      OR: [{ name: name }, { email: email }],
    },
  });
  if (exists) throw new ApiError(403, "this user already exists");

  const hashedPassword = await hashPassword(password);

  const [company, companyAdmin] = await prisma.$transaction([
    prisma.company.create({
      data: {
        name: name.toUpperCase(),
        registrationNo: registrationNo,
        address: address,
        email: email,
        contactNo: contactNo,
      },
    }),

    prisma.user.create({
      data: {
        name: name.toUpperCase(),
        email: email,
        password: hashedPassword,
        role: "companyAdmin",
      },
    }),
  ]);

  const refreshToken = generateRefreshToken(companyAdmin);

  await prisma.user.update({
    where: { id: companyAdmin.id },
    data: { refreshToken: refreshToken },
  });

  companyAdmin.password = undefined;
  companyAdmin.refreshToken = undefined;

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
      { company, companyAdmin },
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

  const refreshToken = generateRefreshToken(user);
  const accessToken = generateAccessToken(user);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: refreshToken },
  });

  user.password = undefined;
  user.refreshToken = undefined;

  res
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(new ApiResponse(200, user, `${user.role} logged in  successfully`));
});

const logout = asyncHandler(async (req, res) => {
  await prisma.user.update({
    where: { id: req.user.id },
    data: { refreshToken: "" },
  });

  console.log("logout");

  res
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "user logout successfully"));
});

const refreshController = asyncHandler(async (req, res) => {
  const incomingRefreshToken = req.cookies?.refreshToken;
  if (!incomingRefreshToken)
    throw new ApiError(401, "no refresh token provided");

  const decoded = verifyRefreshToken(incomingRefreshToken);
  if (!decoded?.id) throw new ApiError(403, "invalid refresh token");

  const user = await prisma.user.findUnique({
    where: { id: decoded.id },
  });
  if (!user) throw new ApiError(404, "user not found");

  if (!user.refreshToken) throw new ApiError(403, "refresh token not found");
  if (incomingRefreshToken !== user.refreshToken)
    throw new ApiError(403, "refresh token mismatch");

  const refreshToken = generateRefreshToken(user);
  const accessToken = generateAccessToken(user);

  await prisma.user.update({
    where: { id: user.id },
    data: { refreshToken: refreshToken },
  });

  user.password = undefined;
  user.refreshToken = undefined;

  res
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(new ApiResponse(200, {}, "refreshed token successfully"));
});

const getMe = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
  });
  if (!user) throw new ApiError(404, "user not found");

  user.password = undefined;
  user.refreshToken = undefined;

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
