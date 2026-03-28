import { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler.js";
import { comparePassword, hashPassword } from "../utils/password.util.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import { emailOptions, emailQueue } from "../queues/email-queue.js";
import { log } from "../utils/logger.js";

const prisma=new PrismaClient()

const changePassword = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "changePassword",
    actorId: req.user.id,
    role: req.user.role,
    ip: req.ip,
  });

  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword)
    throw new ApiError(403, "please provide all details");

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      password: true,
      name: true,
      email: true,
    },
  });
  if (!user) throw new ApiError(404, "no such user found");

  log.info("changePassword.user.resolved", {
    userId: user.id,
  });

  const isPasswordCorrect = await comparePassword(oldPassword, user.password);
  if (!isPasswordCorrect) {
    log.warn("changePassword.invalid_old_password", {
      userId: user.id,
    });

    throw new ApiError(403, "old password not matches");
  }

  const hashedPassword = await hashPassword(newPassword);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
      select: { id: true },
    });

    await tx.session.updateMany({
      where: { userId: user.id },
      data: { revokedAt: new Date() },
    });

    log.info("changePassword.password.updated", {
      userId: user.id,
      sessionsRevoked: true,
    });
  });

  await emailQueue.add(
    "password-change",
    {
      name: user.name,
      email: user.email,
    },
    emailOptions,
  );

  log.info("changePassword.email.queued", {
    userId: user.id,
  });

  log.info("request.success", {
    action: "changePassword",
    userId: user.id,
  });

  res.json(new ApiResponse(200, {}, "password changed successfully"));
});


export {changePassword}