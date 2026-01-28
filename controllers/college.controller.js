import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import { PrismaClient } from "@prisma/client";
import { generatePassword, hashPassword } from "../utils/password.util.js";
import { emailOptions, emailQueue } from "../queues/email-queue.js";
import { canJobTransition } from "../domain/jobStateMachine.js";
import { canCollabTransition } from "../domain/collabStateMachine.js";
import { getPagination } from "../utils/pagination.js";
import { redisConnection } from "../config/redis.js";
import { log } from "../utils/logger.js";
const prisma = new PrismaClient();

const createMentor = asyncHandler(async (req, res) => {
  const { name, email } = req.body;

  if (!name || !email) {
    log.info("createMentor validation failed", {
      requestId: req.requestId,
      userId: req.user.id,
    });
    throw new ApiError(403, "please provide all details");
  }

  log.info("createMentor request received", {
    requestId: req.requestId,
    userId: req.user.id,
    mentorEmail: email,
  });

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select: {
      id: true,
      name: true,
    },
  });

  if (!college) {
    log.error("createMentor college not found", {
      requestId: req.requestId,
      userId: req.user.id,
    });
    throw new ApiError(404, "no such college found");
  }

  const password = generatePassword(8);
  let mentor = null;

  try {
    await prisma.$transaction(async (tx) => {
      const hashedPassword = await hashPassword(password);

      const user = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: "mentor",
        },
      });

      mentor = await tx.mentor.create({
        data: {
          userId: user.id,
          collegeId: college.id,
        },
        select: {
          id: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              createdAt: true,
            },
          },
          college: {
            select: {
              id: true,
              name: true,
              address: true,
              email: true,
              phone: true,
            },
          },
        },
      });
    });
  } catch (err) {
    if (err.code === "P2002") {
      log.info("createMentor duplicate user attempt", {
        requestId: req.requestId,
        mentorEmail: email,
        collegeId: college.id,
      });
      throw new ApiError(409, "user/mentor already exists");
    }

    log.error("createMentor transaction failed", {
      requestId: req.requestId,
      mentorEmail: email,
      error: err.message,
    });

    throw new ApiError(500, "failed to create mentors");
  }

  log.info("mentor created successfully", {
    requestId: req.requestId,
    mentorId: mentor.id,
    mentorEmail: mentor.user.email,
    collegeId: college.id,
  });

  await emailQueue.add(
    "mentor-credentials",
    {
      name,
      email,
      password,
      collegeName: college.name,
    },
    emailOptions,
  );

  log.info("mentor credentials email queued", {
    requestId: req.requestId,
    mentorEmail: email,
  });

  await redisConnection.incr(`college:${college.id}:mentors:version`);

  log.info("mentor cache invalidated", {
    requestId: req.requestId,
    collegeId: college.id,
  });

  res.json(new ApiResponse(201, mentor, "mentor created successfully"));
});


const collabDecision = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { result } = req.body;

  if (!companyId || !result) {
    log.info("collabDecision validation failed", {
      requestId: req.requestId,
      userId: req.user.id,
    });
    throw new ApiError(403, "please provide all details");
  }

  if (!["1", "0"].includes(result)) {
    log.info("collabDecision invalid result value", {
      requestId: req.requestId,
      result,
    });
    throw new ApiError(403, "provide proper result value");
  }

  const nextStatus = result === "1" ? "accepted" : "rejected";

  log.info("collabDecision request received", {
    requestId: req.requestId,
    userId: req.user.id,
    companyId,
    decision: nextStatus,
  });

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select: {
      id: true,
      name: true,
    },
  });

  if (!college) {
    log.error("collabDecision college not found", {
      requestId: req.requestId,
      userId: req.user.id,
    });
    throw new ApiError(404, "no such college found");
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      name: true,
      email: true,
    },
  });

  if (!company) {
    log.error("collabDecision company not found", {
      requestId: req.requestId,
      companyId,
    });
    throw new ApiError(404, "no such company found");
  }

  let occured = false;

  await prisma.$transaction(async (tx) => {
    const collabRequest = await tx.collab.findUnique({
      where: {
        collegeId_companyId: {
          collegeId: college.id,
          companyId,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!collabRequest) {
      log.info("collabDecision collab request not found", {
        requestId: req.requestId,
        collegeId: college.id,
        companyId,
      });
      throw new ApiError(404, "no such collab request found");
    }

    const currentStatus = collabRequest.status;

    if (!canCollabTransition(currentStatus, nextStatus)) {
      log.info("collabDecision invalid state transition", {
        requestId: req.requestId,
        collabId: collabRequest.id,
        from: currentStatus,
        to: nextStatus,
      });
      return;
    }

    const updated = await tx.collab.updateMany({
      where: {
        id: collabRequest.id,
        status: currentStatus,
      },
      data: {
        status: nextStatus,
      },
    });

    if (updated.count === 1) {
      occured = true;
    }
  });

  if (occured) {
    log.info("collabDecision status updated", {
      requestId: req.requestId,
      collegeId: college.id,
      companyId,
      status: nextStatus,
    });

    await emailQueue.add(
      "collab-decision",
      {
        companyName: company.name,
        collegeName: college.name,
        status: nextStatus,
        companyEmail: company.email,
      },
      emailOptions,
    );

    log.info("collabDecision email queued", {
      requestId: req.requestId,
      companyEmail: company.email,
      status: nextStatus,
    });

    await redisConnection.incr(`company:${companyId}:version`);
    await redisConnection.incr(`colleges:version`);
    await redisConnection.incr(`college:${college.id}:collab:requests:version`);
    await redisConnection.incr(`college:${college.id}:version`);

    log.info("collabDecision cache invalidated", {
      requestId: req.requestId,
      collegeId: college.id,
      companyId,
    });
  }

  res.json(
    new ApiResponse(200, nextStatus, `the collab request is ${nextStatus}`),
  );
});


const resetPassword = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  log.info("resetPassword request received", {
    requestId: req.requestId,
    adminId: req.user.id,
    targetUserId: userId,
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      password: true,
      role: true,
      mentor: {
        select: {
          collegeId: true,
        },
      },
      student: {
        select: {
          collegeId: true,
        },
      },
    },
  });

  if (!user) {
    log.info("resetPassword target user not found", {
      requestId: req.requestId,
      targetUserId: userId,
    });
    throw new ApiError(404, "no such user found");
  }

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select: { id: true },
  });

  if (!college) {
    log.error("resetPassword college not found for admin", {
      requestId: req.requestId,
      adminId: req.user.id,
    });
    throw new ApiError(404, "no such college found");
  }

  if (!user.mentor && !user.student) {
    log.info("resetPassword invalid target role", {
      requestId: req.requestId,
      targetUserId: user.id,
      role: user.role,
    });
    throw new ApiError(403, "you can only reset password of student/mentor");
  }

  if (
    (user.mentor && user.mentor.collegeId !== college.id) ||
    (user.student && user.student.collegeId !== college.id)
  ) {
    log.warn("resetPassword cross-organization attempt blocked", {
      requestId: req.requestId,
      adminCollegeId: college.id,
      targetUserId: user.id,
      targetRole: user.role,
    });
    throw new ApiError(
      403,
      "you cant reset password of user outside your organization",
    );
  }

  const password = generatePassword(8);
  const hashedPassword = await hashPassword(password);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
    },
  });

  log.info("resetPassword password updated", {
    requestId: req.requestId,
    targetUserId: user.id,
    role: user.role,
  });

  await prisma.session.updateMany({
    where: { userId: user.id },
    data: { revokedAt: new Date() },
  });

  log.info("resetPassword sessions revoked", {
    requestId: req.requestId,
    targetUserId: user.id,
  });

  await emailQueue.add(
    "reset-password",
    {
      name: user.name,
      email: user.email,
      role: user.role,
      password: password,
    },
    emailOptions,
  );

  log.info("resetPassword email queued", {
    requestId: req.requestId,
    targetUserId: user.id,
    email: user.email,
  });

  res.json(new ApiResponse(200, {}, "password reset successfully"));
});




const jobApprovalDecision = asyncHandler(async (req, res) => {
  const { jobId, result } = req.params;

  log.info("jobApprovalDecision request received", {
    requestId: req.requestId,
    adminId: req.user.id,
    jobId,
    rawResult: result,
  });

  if (!jobId || !result) throw new ApiError(403, "please provide all details");
  if (!["1", "0"].includes(result))
    throw new ApiError(403, "please provide correct decision");

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select: {
      id: true,
      name: true,
    },
  });

  if (!college) {
    log.error("jobApprovalDecision college not found", {
      requestId: req.requestId,
      adminId: req.user.id,
    });
    throw new ApiError(404, "no such college found");
  }

  const nextStatus = result === "1" ? "approved" : "rejected";
  let transitionOccurred = false;
  let jobSnapshot;

  await prisma.$transaction(async (tx) => {
    const job = await tx.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        title: true,
        dueDate: true,
        isApproved: true,
        collegeId: true,
        company: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!job) {
      log.info("jobApprovalDecision job not found", {
        requestId: req.requestId,
        jobId,
      });
      throw new ApiError(404, "no such job found");
    }

    if (job.collegeId !== college.id) {
      log.warn("jobApprovalDecision cross-college access blocked", {
        requestId: req.requestId,
        jobId,
        adminCollegeId: college.id,
        jobCollegeId: job.collegeId,
      });
      throw new ApiError(
        403,
        "cant make decision for job request for another colleges",
      );
    }

    if (job.dueDate < new Date()) {
      log.info("jobApprovalDecision job expired", {
        requestId: req.requestId,
        jobId,
        dueDate: job.dueDate,
      });
      throw new ApiError(403, "job expired");
    }

    const currentStatus = job.isApproved ? "approved" : "pending";

    if (!canJobTransition(currentStatus, nextStatus)) {
      if (currentStatus === nextStatus) {
        log.info("jobApprovalDecision idempotent decision detected", {
          requestId: req.requestId,
          jobId,
          status: currentStatus,
        });
        jobSnapshot = job;
        return;
      }

      log.warn("jobApprovalDecision invalid transition attempted", {
        requestId: req.requestId,
        jobId,
        from: currentStatus,
        to: nextStatus,
      });

      throw new ApiError(
        409,
        `Invalid job transition from ${currentStatus} to ${nextStatus}`,
      );
    }

    if (nextStatus === "approved") {
      await tx.job.update({
        where: { id: job.id },
        data: { isApproved: true },
      });

      log.info("jobApprovalDecision job approved", {
        requestId: req.requestId,
        jobId,
      });
    } else {
      await tx.jobSkill.deleteMany({
        where: { jobId: job.id },
      });

      await tx.application.deleteMany({
        where: { jobId: job.id },
      });

      await tx.job.delete({
        where: { id: job.id },
      });

      log.info("jobApprovalDecision job rejected and cleaned up", {
        requestId: req.requestId,
        jobId,
      });
    }

    transitionOccurred = true;
    jobSnapshot = job;
  });

  if (transitionOccurred) {
    await emailQueue.add(
      "job-decision",
      {
        companyName: jobSnapshot.company.name,
        collegeName: college.name,
        jobTitle: jobSnapshot.title,
        status: nextStatus,
        companyEmail: jobSnapshot.company.email,
      },
      emailOptions,
    );

    log.info("jobApprovalDecision company notified", {
      requestId: req.requestId,
      jobId,
      companyId: jobSnapshot.company.id,
      status: nextStatus,
    });

    if (nextStatus === "approved") {
      const students = await prisma.student.findMany({
        where: { collegeId: college.id },
        select: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      for (const student of students) {
        await emailQueue.add(
          "job-notification",
          {
            studentName: student.user.name,
            email: student.user.email,
            companyName: jobSnapshot.company.name,
            jobTitle: jobSnapshot.title,
          },
          emailOptions,
        );
      }

      log.info("jobApprovalDecision students notified", {
        requestId: req.requestId,
        jobId,
        notifiedCount: students.length,
      });
    }

    await redisConnection.incr(`company:job:${jobId}:version`);
    await redisConnection.incr(
      `company:${jobSnapshot.company.id}:jobs:version`,
    );
    await redisConnection.incr(`college:${college.id}:job:requests:version`);
    await redisConnection.incr(`college:${college.id}:mentors:version`);
    await redisConnection.incr(`college:${college.id}:jobs:version`);

    log.info("jobApprovalDecision cache invalidated", {
      requestId: req.requestId,
      jobId,
      companyId: jobSnapshot.company.id,
      collegeId: college.id,
    });
  }

  res.json(
    new ApiResponse(200, { status: nextStatus }, `the job is ${nextStatus}`),
  );
});


const assignMentor = asyncHandler(async (req, res) => {
  const { mentorId } = req.body;
  const { jobId } = req.params;

  if (!mentorId || !jobId) {
    log.info("assignMentor validation failed", {
      requestId: req.requestId,
      userId: req.user.id,
    });
    throw new ApiError(403, "please provide all details");
  }

  log.info("assignMentor request received", {
    requestId: req.requestId,
    userId: req.user.id,
    mentorId,
    jobId,
  });

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select: { id: true },
  });
  if (!college) {
    log.error("college not found during assignMentor", {
      requestId: req.requestId,
      userId: req.user.id,
    });
    throw new ApiError(404, "no such college found");
  }

  const mentor = await prisma.mentor.findUnique({
    where: { id: mentorId },
    select: {
      id: true,
      collegeId: true,
      user: { select: { name: true, email: true } },
    },
  });
  if (!mentor) {
    log.error("mentor not found", {
      requestId: req.requestId,
      mentorId,
    });
    throw new ApiError(404, "no such mentor found");
  }

  if (mentor.collegeId !== college.id) {
    log.error("mentor belongs to another college", {
      requestId: req.requestId,
      mentorCollegeId: mentor.collegeId,
      collegeId: college.id,
    });
    throw new ApiError(403, "mentor does not belong to your college");
  }

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      collegeId: true,
      dueDate: true,
      status: true,
      isApproved: true,
      title: true,
      company: { select: { name: true } },
    },
  });
  if (!job) {
    log.error("job not found", {
      requestId: req.requestId,
      jobId,
    });
    throw new ApiError(404, "no such job found");
  }

  if (job.collegeId !== college.id) {
    log.error("job belongs to another college", {
      requestId: req.requestId,
      jobCollegeId: job.collegeId,
      collegeId: college.id,
    });
    throw new ApiError(403, "cannot assign mentor outside your college");
  }

  if (job.status === "closed" || job.dueDate < new Date()) {
    log.info("assignMentor rejected due to job state", {
      requestId: req.requestId,
      jobStatus: job.status,
      dueDate: job.dueDate,
    });
    throw new ApiError(403, "job is closed or expired");
  }

  let assigned = false;

  await prisma.$transaction(async (tx) => {
    if (!job.isApproved) {
      log.info("assignMentor rejected: job not approved", {
        requestId: req.requestId,
        jobId,
      });
      throw new ApiError(403, "job is not approved");
    }

    const result = await tx.job.updateMany({
      where: {
        id: jobId,
        mentorId: null,
        isApproved: true,
      },
      data: { mentorId },
    });

    if (result.count === 1) {
      assigned = true;
    }
  });

  if (!assigned) {
    log.info("assignMentor no-op (already assigned)", {
      requestId: req.requestId,
      jobId,
    });
  }

  if (assigned) {
    log.info("mentor assigned successfully", {
      requestId: req.requestId,
      jobId,
      mentorId,
    });

    // cache invalidation
    await redisConnection.incr(
      `college:${college.id}:mentor:${mentor.id}:version`,
    );
    await redisConnection.incr(`college:${college.id}:job:requests:version`);

    await emailQueue.add(
      "assign-mentor",
      {
        mentorName: mentor.user.name,
        jobTitle: job.title,
        companyName: job.company.name,
        mentorEmail: mentor.user.email,
      },
      emailOptions,
    );
  }

  res.json(
    new ApiResponse(
      200,
      { mentorId, jobId, assigned },
      assigned ? "mentor assigned successfully" : "mentor already assigned",
    ),
  );
});


const getMentorsList = asyncHandler(async (req, res) => {
  const { filter = "all" } = req.query;
  const { page, limit, skip } = getPagination(req.query);

  log.info("getMentorsList request received", {
    requestId: req.requestId,
    adminId: req.user.id,
    filter,
    page,
    limit,
  });

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select: { id: true },
  });

  if (!college) {
    log.error("getMentorsList college not found", {
      requestId: req.requestId,
      adminId: req.user.id,
    });
    throw new ApiError(404, "no such college found");
  }

  const version =
    (await redisConnection.get(`college:${college.id}:mentors:version`)) || 1;

  const cacheKey = `college:${college.id}:mentors:v${version}:filter:${filter}:page:${page}:limit:${limit}`;

  const cached = await redisConnection.get(cacheKey);
  if (cached) {
    log.info("getMentorsList cache hit", {
      requestId: req.requestId,
      collegeId: college.id,
      cacheKey,
    });

    return res.json(
      new ApiResponse(
        200,
        JSON.parse(cached),
        "mentors fetched successfully (cached)",
      ),
    );
  }

  log.info("getMentorsList cache miss", {
    requestId: req.requestId,
    collegeId: college.id,
    cacheKey,
  });

  const now = new Date();

  const activeJobCondition = {
    isApproved: true,
    status: "active",
    mentorId: { not: null },
  };

  const mentorWhere = {
    collegeId: college.id,
  };

  if (filter === "available") {
    mentorWhere.jobs = {
      none: {
        ...activeJobCondition,
        dueDate: { gte: now },
      },
    };
  }

  if (filter === "allocated_current") {
    mentorWhere.jobs = {
      some: {
        ...activeJobCondition,
        dueDate: { gte: now },
      },
    };
  }

  if (filter === "allocated_past") {
    mentorWhere.jobs = {
      some: {
        ...activeJobCondition,
        dueDate: { lt: now },
      },
    };
  }

  const queryStart = Date.now();

  const [mentors, totalMentors] = await prisma.$transaction([
    prisma.mentor.findMany({
      where: mentorWhere,
      skip,
      take: limit,
      orderBy: { id: "desc" },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        jobs: {
          where:
            filter === "allocated_past"
              ? { ...activeJobCondition, dueDate: { lt: now } }
              : { ...activeJobCondition, dueDate: { gte: now } },
          select: {
            id: true,
            title: true,
            dueDate: true,
          },
        },
      },
    }),
    prisma.mentor.count({
      where: mentorWhere,
    }),
  ]);

  log.info("getMentorsList DB query completed", {
    requestId: req.requestId,
    collegeId: college.id,
    durationMs: Date.now() - queryStart,
    returnedMentors: mentors.length,
    totalMentors,
  });

  const formattedMentors = mentors.map((mentor) => ({
    id: mentor.id,
    userId: mentor.user.id,
    name: mentor.user.name,
    email: mentor.user.email,
    jobs: mentor.jobs,
  }));

  const responsePayLoad = {
    mentors: formattedMentors,
    pagination: {
      page,
      limit,
      totalMentors,
      totalPages: Math.ceil(totalMentors / limit),
      hasPrevPage: page > 1,
      hasNextPage: skip + formattedMentors.length < totalMentors,
    },
  };

  await redisConnection.setex(cacheKey, 60, JSON.stringify(responsePayLoad));

  log.info("getMentorsList cache populated", {
    requestId: req.requestId,
    collegeId: college.id,
    cacheKey,
    ttl: 60,
  });

  res.json(
    new ApiResponse(200, responsePayLoad, "mentors fetched successfully"),
  );
});


const mentorDetails = asyncHandler(async (req, res) => {
  const { filter } = req.query;
  const { mentorId } = req.params;

  log.info("mentorDetails request received", {
    requestId: req.requestId,
    adminId: req.user.id,
    mentorId,
    filter,
  });

  if (!mentorId) throw new ApiError(403, "please provide mentor id");

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select: { id: true },
  });

  if (!college) {
    log.error("mentorDetails college not found", {
      requestId: req.requestId,
      adminId: req.user.id,
    });
    throw new ApiError(404, "no such college found");
  }

  const version =
    (await redisConnection.get(`mentor:${mentorId}:version`)) || 1;

  const cacheKey = `mentor:${mentorId}:v${version}:filter:${filter}`;

  const cached = await redisConnection.get(cacheKey);
  if (cached) {
    log.info("mentorDetails cache hit", {
      requestId: req.requestId,
      mentorId,
      cacheKey,
    });

    return res.json(
      new ApiResponse(200, JSON.parse(cached), "mentor detail (cached)"),
    );
  }

  log.info("mentorDetails cache miss", {
    requestId: req.requestId,
    mentorId,
    cacheKey,
  });

  let whereClause = {
    collegeId: college.id,
    isApproved: true,
  };

  if (filter === "jobs_current") whereClause.dueDate = { gte: new Date() };
  if (filter === "jobs_past") whereClause.dueDate = { lt: new Date() };

  const queryStart = Date.now();

  let mentor = await prisma.mentor.findUnique({
    where: { id: mentorId },
    select: {
      id: true,
      collegeId: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      jobs: {
        where: whereClause,
        select: {
          id: true,
          title: true,
        },
      },
    },
  });

  log.info("mentorDetails DB query completed", {
    requestId: req.requestId,
    mentorId,
    durationMs: Date.now() - queryStart,
    jobsReturned: mentor?.jobs?.length ?? 0,
  });

  if (!mentor) {
    log.warn("mentorDetails mentor not found", {
      requestId: req.requestId,
      mentorId,
    });
    throw new ApiError(404, "no such employee found");
  }

  if (mentor.collegeId !== college.id) {
    log.warn("mentorDetails cross-college access blocked", {
      requestId: req.requestId,
      mentorId,
      adminCollegeId: college.id,
      mentorCollegeId: mentor.collegeId,
    });

    throw new ApiError(
      403,
      "you cant access mentor details of another college",
    );
  }

  mentor = {
    name: mentor.user.name,
    ...mentor,
    email: mentor.user.email,
    userId: mentor.user.id,
  };
  mentor.collegeId = undefined;
  mentor.user = undefined;

  await redisConnection.setex(cacheKey, 30, JSON.stringify(mentor));

  log.info("mentorDetails cache populated", {
    requestId: req.requestId,
    mentorId,
    cacheKey,
    ttl: 30,
  });

  res.json(new ApiResponse(200, mentor, "mentor detail"));
});


const getAllCollabRequests = asyncHandler(async (req, res) => {
  const allowedStatus = ["accepted", "rejected", "pending"];
  let { status = "pending" } = req.query;
  if (!allowedStatus.includes(status)) status = "pending";

  const { page, limit, skip } = getPagination(req.query);

  log.info("getAllCollabRequests request received", {
    requestId: req.requestId,
    adminId: req.user.id,
    status,
    page,
    limit,
  });

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select: { id: true },
  });

  if (!college) {
    log.error("getAllCollabRequests college not found", {
      requestId: req.requestId,
      adminId: req.user.id,
    });
    throw new ApiError(404, "no such college found");
  }

  const version =
    (await redisConnection.get(
      `college:${college.id}:collab:requests:version`,
    )) || 1;

  const cacheKey = `college:${college.id}:collab:requests:v${version}:status:${status}:page:${page}:limit:${limit}`;

  const cached = await redisConnection.get(cacheKey);
  if (cached) {
    log.info("getAllCollabRequests cache hit", {
      requestId: req.requestId,
      collegeId: college.id,
      cacheKey,
    });

    return res.json(
      new ApiResponse(200, JSON.parse(cached), "collab requests (cached)"),
    );
  }

  log.info("getAllCollabRequests cache miss", {
    requestId: req.requestId,
    collegeId: college.id,
    cacheKey,
  });

  const queryStart = Date.now();

  let [collabRequests, totalRequests] = await prisma.$transaction([
    prisma.collab.findMany({
      where: {
        collegeId: college.id,
        status: status,
      },
      skip: skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        company: {
          select: {
            id: true,
            name: true,
            address: true,
          },
        },
      },
    }),

    prisma.collab.count({
      where: { collegeId: college.id, status: status },
    }),
  ]);

  log.info("getAllCollabRequests DB query completed", {
    requestId: req.requestId,
    collegeId: college.id,
    durationMs: Date.now() - queryStart,
    returned: collabRequests.length,
    totalRequests,
  });

  collabRequests = collabRequests.map((request) => ({
    ...request,
    status: status,
  }));

  const responsePayLoad = {
    collabRequests,
    pagination: {
      page,
      limit,
      totalRequests,
      totalPages: Math.ceil(totalRequests / limit),
      hasPrevPage: page > 1,
      hasNextPage: skip + collabRequests.length < totalRequests,
    },
  };

  await redisConnection.setex(cacheKey, 60, JSON.stringify(responsePayLoad));

  log.info("getAllCollabRequests cache populated", {
    requestId: req.requestId,
    collegeId: college.id,
    cacheKey,
    ttl: 60,
  });

  res.json(new ApiResponse(200, responsePayLoad, "collab requests"));
});


const getCompanyDetails = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  if (!companyId) throw new ApiError(403, "please provide company id");

  log.info("getCompanyDetails request received", {
    requestId: req.requestId,
    companyId,
    requesterId: req.user?.id,
  });

  const version =
    (await redisConnection.get(`company:${companyId}:version`)) || 1;

  const cacheKey = `company:${companyId}:v${version}`;

  const cached = await redisConnection.get(cacheKey);
  if (cached) {
    log.info("getCompanyDetails cache hit", {
      requestId: req.requestId,
      companyId,
      cacheKey,
    });

    return res.json(
      new ApiResponse(200, JSON.parse(cached), "company details(cached)"),
    );
  }

  log.info("getCompanyDetails cache miss", {
    requestId: req.requestId,
    companyId,
    cacheKey,
  });

  const dbStart = Date.now();

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      address: true,
      email: true,
      contactNo: true,
      collabs: {
        where: { status: "accepted" },
        select: { id: true },
      },
    },
  });

  log.info("getCompanyDetails DB query completed", {
    requestId: req.requestId,
    companyId,
    durationMs: Date.now() - dbStart,
  });

  if (!company) {
    log.warn("getCompanyDetails company not found", {
      requestId: req.requestId,
      companyId,
    });
    throw new ApiError(403, "no such company found");
  }

  const formattedCompany = {
    id: company.id,
    name: company.name,
    address: company.address,
    email: company.email,
    contactNo: company.contactNo,
    collaboratedCount: company.collabs.length,
  };

  await redisConnection.setex(cacheKey, 120, JSON.stringify(formattedCompany));

  log.info("getCompanyDetails cache populated", {
    requestId: req.requestId,
    companyId,
    cacheKey,
    ttl: 120,
  });

  res.json(new ApiResponse(200, formattedCompany, "company details"));
});


const getAllJobRequests = asyncHandler(async (req, res) => {
  let { filter = "PENDING" } = req.query;
  const { page, limit, skip } = getPagination(req.query);

  log.info("getAllJobRequests request received", {
    requestId: req.requestId,
    filter,
    page,
    limit,
    requesterId: req.user?.id,
  });

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select: { id: true },
  });
  if (!college) {
    log.warn("getAllJobRequests college not found", {
      requestId: req.requestId,
      email: req.user.email,
    });
    throw new ApiError(404, "no such college found");
  }

  const version =
    (await redisConnection.get(`college:${college.id}:job:requests:version`)) ||
    1;

  const cacheKey = `college:${college.id}:job:requests:v${version}:filter:${filter}:page:${page}:limit:${limit}`;

  const cached = await redisConnection.get(cacheKey);
  if (cached) {
    log.info("getAllJobRequests cache hit", {
      requestId: req.requestId,
      collegeId: college.id,
      cacheKey,
    });

    return res.json(
      new ApiResponse(200, JSON.parse(cached), "job requests(cached)"),
    );
  }

  log.info("getAllJobRequests cache miss", {
    requestId: req.requestId,
    collegeId: college.id,
    cacheKey,
  });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const whereClause = {
    collegeId: college.id,
    status: "active",
  };

  if (filter === "PENDING") {
    whereClause.isApproved = false;
    whereClause.dueDate = { gte: startOfToday };
  } else if (filter === "CURRENT") {
    whereClause.isApproved = true;
    whereClause.dueDate = { gte: startOfToday };
    whereClause.mentor = { isNot: null };
  } else if (filter === "PAST") {
    whereClause.isApproved = true;
    whereClause.dueDate = { lt: startOfToday };
    whereClause.mentor = { isNot: null };
  } else if (filter === "ASSIGN_MENTOR") {
    whereClause.isApproved = true;
    whereClause.dueDate = { gte: startOfToday };
    whereClause.mentor = { is: null };
  } else {
    log.warn("getAllJobRequests invalid filter", {
      requestId: req.requestId,
      filter,
    });
    throw new ApiError(400, "invalid filter");
  }

  const dbStart = Date.now();

  let [jobRequests, totalRequests] = await prisma.$transaction([
    prisma.job.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        salary: true,
        dueDate: true,
        isApproved: true,
        createdAt: true,
        company: {
          select: { name: true },
        },
        mentor: {
          select: {
            user: {
              select: { name: true },
            },
          },
        },
      },
    }),

    prisma.job.count({
      where: whereClause,
    }),
  ]);

  log.info("getAllJobRequests DB query completed", {
    requestId: req.requestId,
    collegeId: college.id,
    filter,
    resultCount: jobRequests.length,
    totalRequests,
    durationMs: Date.now() - dbStart,
  });

  jobRequests = jobRequests.map((job) => ({
    id: job.id,
    title: job.title,
    salary: job.salary,
    deadline: job.dueDate,
    companyName: job.company.name,
    mentorName: job.mentor?.user?.name ?? null,
    status: filter,
  }));

  const responsePayLoad = {
    jobRequests,
    pagination: {
      page,
      limit,
      totalRequests,
      totalPages: Math.ceil(totalRequests / limit),
      hasPrevPage: page > 1,
      hasNextPage: skip + jobRequests.length < totalRequests,
    },
  };

  const ttlMap = {
    PENDING: 30,
    CURRENT: 60,
    ASSIGN_MENTOR: 30,
    PAST: 300,
  };

  await redisConnection.setex(
    cacheKey,
    ttlMap[filter] ?? 60,
    JSON.stringify(responsePayLoad),
  );

  log.info("getAllJobRequests cache populated", {
    requestId: req.requestId,
    collegeId: college.id,
    cacheKey,
    ttl: ttlMap[filter] ?? 60,
  });

  res.json(new ApiResponse(200, responsePayLoad, "job requests"));
});



const getJobDetails = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  if (!jobId) throw new ApiError(403, "please provide job id");

  log.info("getJobDetails request received", {
    requestId: req.requestId,
    jobId,
    requesterId: req.user?.id,
  });

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select: { id: true },
  });
  if (!college) {
    log.warn("getJobDetails college not found", {
      requestId: req.requestId,
      email: req.user.email,
    });
    throw new ApiError(404, "no such college found");
  }

  const version = (await redisConnection.get(`job:${jobId}:version`)) || 1;

  const cacheKey = `job:${jobId}:v${version}`;
  const cached = await redisConnection.get(cacheKey);

  if (cached) {
    log.info("getJobDetails cache hit", {
      requestId: req.requestId,
      jobId,
      cacheKey,
    });

    return res.json(
      new ApiResponse(200, JSON.parse(cached), "job detail(cached)"),
    );
  }

  log.info("getJobDetails cache miss", {
    requestId: req.requestId,
    jobId,
    cacheKey,
  });

  const dbStart = Date.now();

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      title: true,
      salary: true,
      tenure: true,
      address: true,
      status: true,
      dueDate: true,
      collegeId: true,
      isApproved: true,
      createdAt: true,
      mentor: {
        select: {
          id: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      company: {
        select: {
          name: true,
          registrationNo: true,
          address: true,
          email: true,
          contactNo: true,
          status: true,
        },
      },
      jobSkills: {
        select: {
          skill: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  log.info("getJobDetails DB query completed", {
    requestId: req.requestId,
    jobId,
    durationMs: Date.now() - dbStart,
    found: !!job,
  });

  if (!job) {
    log.warn("getJobDetails job not found", {
      requestId: req.requestId,
      jobId,
    });
    throw new ApiError(404, "no such job found");
  }

  if (job.collegeId !== college.id) {
    log.warn("getJobDetails unauthorized college access", {
      requestId: req.requestId,
      jobId,
      collegeId: college.id,
      jobCollegeId: job.collegeId,
    });
    throw new ApiError(403, "you cant see another college job details");
  }

  const formattedJob = {
    id: job.id,
    title: job.title,
    salary: job.salary,
    tenure: job.tenure,
    status: job.status,
    dueDate: job.dueDate,
    isApproved: job.isApproved,
    createdAt: job.createdAt,
    mentor: job.mentor
      ? {
          id: job.mentor.id,
          name: job.mentor.user.name,
          email: job.mentor.user.email,
        }
      : null,
    company: job.company,
    jobSkills: job.jobSkills.reduce((arr, skill) => {
      arr.push(skill.skill.name);
      return arr;
    }, []),
  };

  await redisConnection.setex(cacheKey, 120, JSON.stringify(formattedJob));

  log.info("getJobDetails cache populated", {
    requestId: req.requestId,
    jobId,
    cacheKey,
    ttl: 120,
  });

  res.json(new ApiResponse(200, formattedJob, "job detail"));
});



const exportMentors = asyncHandler(async (req, res) => {
  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select: { id: true },
  });
  if (!college) throw new ApiError(404, "no such college found");

  const mentors = await prisma.mentor.findMany({
    where: { collegeId: college.id },
    select: {
      id: true,
      user: {
        select: {
          name: true,
          email: true,
          createdAt: true,
        },
      },
    },
  });

  const data = [
    ["ID", "NAME", "EMAIL", "HIRE DATE"],
    ...mentors.map((e) => [
      e.id,
      e.user.name,
      e.user.email,
      e.user.createdAt.toISOString(), // IMPORTANT
    ]),
  ];

  const csv = data.map((row) => row.join(",")).join("\n");

  res
    .setHeader("Content-Type", "text/csv; charset=utf-8")
    .setHeader("Content-Disposition", "attachment; filename=mentors.csv")
    .setHeader("Cache-Control", "no-store")
    .send("\uFEFF" + csv);
});

export {
  createMentor,
  collabDecision,
  resetPassword,
  jobApprovalDecision,
  assignMentor,
  getMentorsList,
  mentorDetails,
  getAllCollabRequests,
  getCompanyDetails,
  getAllJobRequests,
  getJobDetails,
  exportMentors,
};
