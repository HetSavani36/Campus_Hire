import { PrismaClient } from "@prisma/client";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { emailOptions, emailQueue } from "../queues/email-queue.js";
import { canJobTransition } from "../domain/jobStateMachine.js";
import { redisConnection } from "../config/redis.js";
import { log } from "../utils/logger.js";
import { getPagination } from "../utils/pagination.js";

const prisma=new PrismaClient()

const makeStudentApplicationDecision = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "makeStudentApplicationDecision",
    actorId: req.user.id,
    role: req.user.role,
    ip: req.ip,
    applicationId: req.params.applicationId,
  });

  const { applicationId } = req.params;
  const { result } = req.body
  if (!applicationId || !result)
    throw new ApiError(403, "please provide studentId and your decision");
  if (!["approved", "rejected"].includes(result))
    throw new ApiError(403, "please provide proper decision in either 0 or 1");

  const nextStatus = result ;
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
  log.info("request.start", {
    action: "getJobDetails",
    actorId: req.user.id,
    role: req.user.role,
    ip: req.ip,
    jobId: req.params.jobId,
  });

  const { jobId } = req.params;
  if (!jobId) throw new ApiError(403, "please provide job id");

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
          mentorApproval: true, // Add this to know if you already approved them
          student: {
            // Add this block to get student details
            select: {
              rollNo: true,
              branch: true,
              resume: true,
              user: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      },  
    },
  });

  if (!job) {
    log.warn("mentorJob.not_found", {
      jobId,
    });

    throw new ApiError(404, "no such job found");
  }

  if (job.collegeId !== mentor.collegeId) {
    log.warn("mentorJob.forbidden.college", {
      jobId,
      mentorCollegeId: mentor.collegeId,
      jobCollegeId: job.collegeId,
    });

    throw new ApiError(403, "job not belongs to your college");
  }

  if (job.mentorId !== mentor.id) {
    log.warn("mentorJob.forbidden.mentor", {
      jobId,
      mentorId: mentor.id,
      jobMentorId: job.mentorId,
    });

    throw new ApiError(403, "job is not under you");
  }

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

  log.info("mentorJob.applications.aggregated", {
    jobId,
    applicationCount,
  });

  const response = {
    ...job,
    applications: groupedApplications,
    applicationCount,
  };

  log.info("request.success", {
    action: "getJobDetails",
    jobId,
    mentorId: mentor.id,
  });

  res.json(new ApiResponse(200, response, "job details"));
});


const getStudentHistoryForMentor = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "getStudentHistoryForMentor",
    actorId: req.user.id,
    studentId: req.params.studentId,
  });

  const { studentId } = req.params;
  if (!studentId) throw new ApiError(400, "Please provide a student ID");

  // Fetch the student, their user details, skills, and application history
  const student = await prisma.student.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      rollNo: true,
      branch: true,
      year: true,
      resume: true,
      aboutMe: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
      skills: {
        select: {
          skill: {
            select: {
              name: true,
            },
          },
        },
      },
      // Deep fetch to get the application timeline
      applications: {
        select: {
          id: true,
          status: true, // Company decision
          mentorApproval: true, // Mentor decision
          appliedAt: true,
          job: {
            select: {
              title: true,
              company: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          appliedAt: "desc", // Show the most recent applications at the top
        },
      },
    },
  });

  if (!student) {
    log.warn("mentorStudentHistory.not_found", { studentId });
    throw new ApiError(404, "No such student found");
  }

  log.info("request.success", {
    action: "getStudentHistoryForMentor",
    studentId,
  });

  res.json(
    new ApiResponse(200, student, "Student history fetched successfully"),
  );
});

const getStudentsListForMentor = asyncHandler(async (req, res) => {
  log.info("request.start", { 
    action: "getStudentsListForMentor", 
    actorId: req.user.id 
  });

  // 1. Find the mentor and get their collegeId
  const mentor = await prisma.mentor.findUnique({
    where: { userId: req.user.id },
    select: { collegeId: true },
  });

  if (!mentor) {
    log.warn("mentorStudents.mentor_not_found", { userId: req.user.id });
    throw new ApiError(404, "Mentor profile not found");
  }

  // 2. Fetch all students that belong to the same college
  const students = await prisma.student.findMany({
    where: { collegeId: mentor.collegeId },
    select: {
      id: true,
      rollNo: true,
      branch: true,
      year: true,
      user: {
        select: { 
          name: true, 
          email: true 
        },
      },
    },
    orderBy: { 
      user: { name: "asc" } // Sort alphabetically by name
    }
  });

  log.info("request.success", { 
    action: "getStudentsListForMentor", 
    studentCount: students.length 
  });

  res.json(new ApiResponse(200, students, "College students fetched successfully"));
});

// --- Fetch jobs with application summaries for the dashboard ---
const getJobsWithApplicationSummary = asyncHandler(async (req, res) => {
  log.info("request.start", { 
    action: "getJobsWithApplicationSummary", 
    actorId: req.user.id 
  });

  // 1. Resolve mentor
  const mentor = await prisma.mentor.findUnique({
    where: { userId: req.user.id },
    select: { id: true }
  });

  if (!mentor) throw new ApiError(404, "Mentor not found");

  // 2. Fetch jobs and nest the applications to check approval status
  const jobs = await prisma.job.findMany({
    where: { mentorId: mentor.id },
    select: {
      id: true,
      title: true,
      dueDate: true,
      company: {
        select: { name: true }
      },
      applications: {
        select: {
          id: true,
          mentorApproval: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  log.info("request.success", { 
    action: "getJobsWithApplicationSummary", 
    count: jobs.length 
  });

  res.json(new ApiResponse(200, jobs, "Jobs with application summary fetched"));
});

export {
  makeStudentApplicationDecision,
  getAllJobs,
  getJobDetails,
  getStudentHistoryForMentor,
  getStudentsListForMentor,
  getJobsWithApplicationSummary,
};