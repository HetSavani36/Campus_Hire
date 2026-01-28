import { PrismaClient } from "@prisma/client";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { emailOptions, emailQueue } from "../queues/email-queue.js";
import { canJobTransition } from "../domain/jobStateMachine.js";
import { redisConnection } from "../config/redis.js";
const prisma=new PrismaClient()

const makeStudentApplicationDecision = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "makeStudentApplicationDecision",
    actorId: req.user.id,
    role: req.user.role,
    ip: req.ip,
    applicationId: req.params.applicationId,
  });

  const { applicationId, result } = req.params;
  if (!applicationId || !result)
    throw new ApiError(403, "please provide studentId and your decision");
  if (!["1", "0"].includes(result))
    throw new ApiError(403, "please provide proper decision in either 0 or 1");

  const nextStatus = result === "1" ? "approved" : "rejected";
  let applicationSnapshot = null;
  let occured = false;

  log.info("mentorDecision.input.validated", {
    applicationId,
    nextStatus,
  });

  await prisma.$transaction(async (tx) => {
    const selectQuery = {
      status: true,
      mentorApproval: true,
      id: true,
      student: {
        select: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      mentor: {
        select: {
          user: {
            select: {
              name: true,
              id: true,
            },
          },
        },
      },
      job: {
        select: {
          id: true,
          title: true,
          company: {
            select: {
              name: true,
            },
          },
        },
      },
    };

    const application = await tx.application.findFirst({
      where: {
        id: applicationId,
        mentorId: { not: null },
        status: "shortlisted",
      },
      select: selectQuery,
    });

    if (!application) {
      log.warn("mentorDecision.not_found", {
        applicationId,
      });

      throw new ApiError(404, "no such application found");
    }

    if (application.mentor.user.id !== req.user.id) {
      log.warn("mentorDecision.forbidden", {
        applicationId,
        mentorId: application.mentor.user.id,
        actorId: req.user.id,
      });

      throw new ApiError(
        403,
        "you dont have privilage to approve/reject this application",
      );
    }

    const currentStatus = application.mentorApproval;

    if (!canJobTransition(currentStatus, nextStatus)) {
      if (currentStatus === nextStatus) {
        applicationSnapshot = application;

        log.info("mentorDecision.noop", {
          applicationId,
          status: currentStatus,
        });

        return;
      }

      log.warn("mentorDecision.invalid_transition", {
        applicationId,
        fromStatus: currentStatus,
        toStatus: nextStatus,
      });

      throw new ApiError(
        409,
        `cant transit from ${currentStatus} to ${nextStatus}`,
      );
    }

    const updated = await tx.application.updateMany({
      where: { id: application.id, mentorApproval: currentStatus },
      data: { mentorApproval: nextStatus },
    });

    if (updated.count === 1) {
      applicationSnapshot = {
        ...application,
        mentorApproval: nextStatus,
      };
      occured = true;

      log.info("mentorDecision.status.updated", {
        applicationId,
        fromStatus: currentStatus,
        toStatus: nextStatus,
      });
    }
  });

  if (occured) {
    await emailQueue.add(
      "mentor-decision",
      {
        studentName: applicationSnapshot.student.user.name,
        mentorName: applicationSnapshot.mentor.user.name,
        companyName: applicationSnapshot.job.company.name,
        jobTitle: applicationSnapshot.job.title,
        status: nextStatus,
        studentEmail: applicationSnapshot.student.user.email,
      },
      emailOptions,
    );

    log.info("mentorDecision.email.queued", {
      applicationId,
      jobId: applicationSnapshot.job.id,
      status: nextStatus,
    });

    await redisConnection.incr(
      `company:job:${applicationSnapshot.job.id}:version`,
    );

    log.info("mentorDecision.cache.invalidated", {
      jobId: applicationSnapshot.job.id,
    });
  }

  log.info("request.success", {
    action: "makeStudentApplicationDecision",
    applicationId,
    occured,
    finalStatus: nextStatus,
  });

  res.json(
    new ApiResponse(
      200,
      applicationSnapshot,
      `the student application has been ${nextStatus} by mentor`,
    ),
  );
});


const getAllJobs = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "getAllJobs",
    actorId: req.user.id,
    role: req.user.role,
    ip: req.ip,
  });

  const { filter = "current" } = req.query;
  const { page, limit, skip } = getPagination(req.query);

  const mentor = await prisma.mentor.findUnique({
    where: { userId: req.user.id },
    select: {
      id: true,
      collegeId: true,
    },
  });
  if (!mentor) throw new ApiError(404, "no such mentor found");

  log.info("mentor.resolved", {
    mentorId: mentor.id,
    collegeId: mentor.collegeId,
  });

  let whereClause = {
    collegeId: mentor.collegeId,
    mentorId: mentor.id,
  };

  if (filter === "past") whereClause.dueDate = { lt: new Date() };
  if (filter === "current") whereClause.dueDate = { gte: new Date() };

  log.info("mentorJobs.filter.applied", {
    mentorId: mentor.id,
    filter,
  });

  const [jobs, totalJobs] = await prisma.$transaction([
    prisma.job.findMany({
      where: whereClause,
      skip: skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        salary: true,
        dueDate: true,
        company: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    }),

    prisma.job.count({ where: whereClause }),
  ]);

  log.info("mentorJobs.query.executed", {
    mentorId: mentor.id,
    returnedCount: jobs.length,
    totalJobs,
  });

  log.info("request.success", {
    action: "getAllJobs",
    mentorId: mentor.id,
    filter,
    returnedCount: jobs.length,
  });

  res.json(
    new ApiResponse(
      200,
      {
        jobs,
        pagination: {
          page,
          limit,
          totalJobs,
          totalPages: Math.ceil(totalJobs / limit),
          hasPrevPage: page > 1,
          hasNextPage: skip + jobs.length < totalJobs,
        },
      },
      "jobs under mentor",
    ),
  );
});



const getJobDetails = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  if (!jobId) throw new ApiError(403, "please provide job id");

  const mentor = await prisma.mentor.findUnique({
    where: { userId: req.user.id },
    select:{
      id:true,
      collegeId:true
    }
  });
  if (!mentor) throw new ApiError(404, "no such mentor found");

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
      mentorId: true,

      company: {
        select: {
          id: true,
          name: true,
          address: true,
          email: true,
          contactNo: true,
        },
      },

      applications: {
        select: {
          id: true,
          studentId: true,
          status: true,
        },
      },
    },
  });

  if (!job) throw new ApiError(404, "no such job found");
  if (job.collegeId !== mentor.collegeId)
    throw new ApiError(403, "job not belongs to your college");
  if (job.mentorId !== mentor.id)
    throw new ApiError(403, "job is not under you");

  // -------- Group applications --------
  const groupedApplications = {
    shortlisted: [],
    rejected: [],
    hired: [],
    pending: [],
  };

  job.applications.forEach((app) => {
    groupedApplications[app.status]?.push(app);
  });

  // -------- Counts --------
  const applicationCount = {
    total: job.applications.length,
    shortlisted: groupedApplications.shortlisted.length,
    rejected: groupedApplications.rejected.length,
    hired: groupedApplications.hired.length,
    pending: groupedApplications.pending.length,
  };

  const response = {
    ...job,
    applications: groupedApplications,
    applicationCount,
  };

  res.json(new ApiResponse(200, response, "job details"));
});


export {
    makeStudentApplicationDecision,
    getAllJobs,
    getJobDetails
}