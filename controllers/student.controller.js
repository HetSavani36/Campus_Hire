import { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import { generatePassword, hashPassword } from "../utils/password.util.js";
import { parseFileBuffer } from "../utils/csv_parsing.util.js";
import { emailOptions, emailQueue } from "../queues/email-queue.js";
import csv from "csv-parser";
import { redisConnection } from "../config/redis.js";
import { log } from "../utils/logger.js";
import { getPagination } from "../utils/pagination.js";


const prisma = new PrismaClient();

const uploadBulkStudents = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "uploadBulkStudents",
    actorId: req.user.id,
    role: req.user.role,
    ip: req.ip,
  });

  if (!req.file) throw new ApiError(400, "CSV file is required");

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select: { id: true },
  });
  if (!college) throw new ApiError(404, "College not found");

  log.info("bulkStudents.college.resolved", {
    collegeId: college.id,
  });

  const rows = await parseFileBuffer(req.file.buffer, req.file.originalname);
  if (!rows || rows.length === 0)
    throw new ApiError(400, "CSV file is empty or invalid");

  log.info("bulkStudents.file.parsed", {
    totalRows: rows.length,
    filename: req.file.originalname,
  });

  const createdStudents = [];
  const skippedStudents = [];

  for (const row of rows) {
    if (!row.email || !row.name) {
      skippedStudents.push({
        email: row.email || null,
        reason: "Missing required fields",
      });

      log.info("bulkStudents.row.skipped", {
        reason: "missing_fields",
        email: row.email || null,
      });

      continue;
    }

    const password = generatePassword(8);
    const hashedPassword = await hashPassword(password);

    try {
      const user = await prisma.user.create({
        data: {
          name: row.name,
          email: row.email,
          password: hashedPassword,
          role: "student",
          metadata: {
            collegeId: college.id,
            rollNo: row.rollNo || null,
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
        },
      });

      createdStudents.push({
        name: user.name,
        email: user.email,
        password,
        rollNo: row.rollNo || null,
      });

      log.info("bulkStudents.student.created", {
        userId: user.id,
        email: user.email,
      });
    } catch (err) {
      if (err.code === "P2002") {
        skippedStudents.push({
          email: row.email,
          reason: "User already exists",
        });

        log.info("bulkStudents.student.skipped", {
          email: row.email,
          reason: "already_exists",
        });

        continue;
      }

      log.warn("bulkStudents.student.create_failed", {
        email: row.email,
      });

      throw new ApiError(500, "failed to create student");
    }
  }

  for (const student of createdStudents) {
    await emailQueue.add(
      "student-credentials",
      {
        email: student.email,
        password: student.password,
        name: student.name,
        rollNo: student.rollNo,
      },
      emailOptions,
    );

    log.info("bulkStudents.email.queued", {
      email: student.email,
    });
  }

  log.info("request.success", {
    action: "uploadBulkStudents",
    createdCount: createdStudents.length,
    skippedCount: skippedStudents.length,
  });

  return res.json(
    new ApiResponse(
      201,
      {
        createdCount: createdStudents.length,
        skippedCount: skippedStudents.length,
        skippedStudents,
      },
      "Bulk student upload completed successfully",
    ),
  );
});


const createProfile = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "createProfile",
    actorId: req.user.id,
    role: req.user.role,
    ip: req.ip,
  });

  const { year, aboutMe, branch } = req.body;

  if (!year || !branch) {
    throw new ApiError(400, "year and branch are required");
  }

  if (!["1", "2", "3", "4"].includes(year)) {
    throw new ApiError(400, "invalid year");
  }

  log.info("createProfile.input.validated", {
    year,
    branch,
  });

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        metadata: true,
        hasCompletedProfile: true,
      },
    });

    if (!user) {
      log.warn("createProfile.user.not_found", {
        userId: req.user.id,
      });

      throw new ApiError(404, "user not found");
    }

    if (!user.metadata?.collegeId || !user.metadata?.rollNo) {
      log.warn("createProfile.metadata.missing", {
        userId: user.id,
        metadata: user.metadata,
      });

      throw new ApiError(403, "collegeId or rollNo missing");
    }

    const student = await tx.student.findUnique({
      where: { userId: user.id },
    });

    if (!student) {
      await tx.student.create({
        data: {
          userId: user.id,
          collegeId: user.metadata.collegeId,
          year: Number(year),
          branch,
          rollNo: user.metadata.rollNo,
          resume: null,
          aboutMe: aboutMe ?? null,
        },
      });

      log.info("createProfile.student.created", {
        userId: user.id,
        collegeId: user.metadata.collegeId,
      });
    }

    await tx.user.updateMany({
      where: { id: user.id, hasCompletedProfile: false },
      data: { hasCompletedProfile: true, metadata:"" },
    });

    log.info("createProfile.user.updated", {
      userId: user.id,
      hasCompletedProfile: true,
    });
  });

  // Re-fetch final state
  const finalUser = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      hasCompletedProfile: true,
      student: {
        select: {
          year: true,
          branch: true,
          rollNo: true,
          resume: true,
          aboutMe: true,
          college: {
            select: {
              email: true,
              name: true,
              address: true,
            },
          },
        },
      },
    },
  });

  log.info("request.success", {
    action: "createProfile",
    userId: req.user.id,
    hasCompletedProfile: finalUser?.hasCompletedProfile,
  });

  res.json(new ApiResponse(200, finalUser, "profile created successfully"));
});



const editProfile = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "editProfile",
    actorId: req.user.id,
    role: req.user.role,
    ip: req.ip,
  });

  const allowedUpdates = ["year", "resume", "aboutMe", "branch"];
  const update = {};

  allowedUpdates.forEach((field) => {
    if (req.body[field]) update[field] = req.body[field];
  });

  log.info("editProfile.update.fields", {
    userId: req.user.id,
    fields: Object.keys(update),
  });

  const user = await prisma.student.update({
    where: { userId: req.user.id },
    data: update,
    select: {
      id: true,
      year: true,
      branch: true,
      rollNo: true,
      resume: true,
      aboutMe: true,
      user: {
        select: {
          name: true,
          email: true,
          hasCompletedProfile: true,
        },
      },
      college: {
        select: {
          email: true,
          name: true,
          address: true,
        },
      },
    },
  });

  log.info("editProfile.updated", {
    studentId: user.id,
    userId: req.user.id,
  });

  log.info("request.success", {
    action: "editProfile",
    userId: req.user.id,
  });

  res.json(new ApiResponse(200, user, "profile updated succeessfully"));
});

const addSkill = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "addSkill",
    actorId: req.user.id,
    role: req.user.role,
    ip: req.ip,
  });

  const { name } = req.body;
  if (!name) throw new ApiError(400, "skill name is required");

  const student = await prisma.student.findUnique({
    where: { userId: req.user.id },
    select: { id: true },
  });
  if (!student) throw new ApiError(404, "student not found");

  log.info("student.resolved", {
    studentId: student.id,
  });

  const normalizedName = name.trim().toUpperCase();

  log.info("studentSkill.input.normalized", {
    skillName: normalizedName,
  });

  await prisma.$transaction(async (tx) => {
    let skill;

    try {
      skill = await tx.skill.create({
        data: { name: normalizedName },
        select: { id: true },
      });

      log.info("studentSkill.skill.created", {
        skillId: skill.id,
        skillName: normalizedName,
      });
    } catch (err) {
      if (err.code === "P2002") {
        skill = await tx.skill.findUnique({
          where: { name: normalizedName },
          select: { id: true },
        });

        log.info("studentSkill.skill.exists", {
          skillId: skill.id,
          skillName: normalizedName,
        });
      } else {
        throw err;
      }
    }

    await tx.studentSkill.createMany({
      data: {
        studentId: student.id,
        skillId: skill.id,
      },
      skipDuplicates: true,
    });

    log.info("studentSkill.mapped", {
      studentId: student.id,
      skillId: skill.id,
    });
  });

  log.info("request.success", {
    action: "addSkill",
    studentId: student.id,
    skillName: normalizedName,
  });

  res.json(new ApiResponse(201, normalizedName, "skill added successfully"));
});



const apply = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "applyJob",
    actorId: req.user.id,
    role: req.user.role,
    ip: req.ip,
    jobId: req.params.jobId,
  });

  const { jobId } = req.params;

  const student = await prisma.student.findUnique({
    where: { userId: req.user.id },
    select: {
      id: true,
      resume: true,
      collegeId: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });
  if (!student) throw new ApiError(404, "no such student found");
  if (!student.resume)
    throw new ApiError(403, "please upload your resume first");

  log.info("applyJob.student.resolved", {
    studentId: student.id,
    collegeId: student.collegeId,
  });

  const idempotencyKey = req.headers["idempotency-key"];
  if (!idempotencyKey)
    throw new ApiError(403, "idempotency key header is required");

  log.info("applyJob.idempotency.received", {
    key: idempotencyKey,
  });

  let responseSnapshot = null;
  let occured = false;

  await prisma.$transaction(async (tx) => {
    const existingKey = await tx.idempotencyKey.findUnique({
      where: { key: idempotencyKey },
    });

    if (existingKey) {
      responseSnapshot = existingKey.response;
      occured = false;

      log.info("applyJob.idempotency.hit", {
        key: idempotencyKey,
      });

      return;
    }

    const job = await tx.job.findUnique({
      where: { id: jobId },
      select: {
        id: true,
        collegeId: true,
        status: true,
        isApproved: true,
        dueDate: true,
        mentorId: true,
        title: true,
      },
    });
    if (!job) throw new ApiError(404, "no such job found");

    log.info("applyJob.job.resolved", {
      jobId: job.id,
      collegeId: job.collegeId,
    });

    if (job.collegeId !== student.collegeId)
      throw new ApiError(403, "the job is not for your college");
    if (!job.isApproved)
      throw new ApiError(403, "cant apply to un-approved job");
    if (job.status === "closed")
      throw new ApiError(403, "job application is closed");
    if (job.dueDate < new Date())
      throw new ApiError(403, "the job application has expired");
    if (!job.mentorId) throw new ApiError(403, "cant apply without mentor");

    let application = null;

    const selectQuery = {
      id: true,
      status: true,
      appliedAt: true,
      job: {
        select: {
          id: true,
          title: true,
          company: {
            select: {
              email: true,
              contactNo: true,
              name: true,
              address: true,
            },
          },
        },
      },
      mentor: {
        select: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    };

    try {
      application = await tx.application.create({
        data: {
          studentId: student.id,
          jobId: job.id,
          mentorId: job.mentorId,
        },
        select: selectQuery,
      });

      occured = true;

      log.info("applyJob.application.created", {
        applicationId: application.id,
        jobId: job.id,
        studentId: student.id,
      });
    } catch (error) {
      if (error.code === "P2002") {
        application = await tx.application.findUnique({
          where: {
            studentId_jobId: {
              studentId: student.id,
              jobId: job.id,
            },
          },
          select: selectQuery,
        });

        occured = false;

        log.info("applyJob.application.exists", {
          applicationId: application.id,
          jobId: job.id,
          studentId: student.id,
        });
      } else {
        throw error;
      }
    }

    responseSnapshot = application;

    await tx.idempotencyKey.create({
      data: {
        key: idempotencyKey,
        userId: student.id,
        endpoint: "POST /api/job/:jobId/apply",
        response: responseSnapshot,
      },
    });

    log.info("applyJob.idempotency.stored", {
      key: idempotencyKey,
      applicationId: responseSnapshot.id,
    });
  });

  if (occured) {
    await emailQueue.add(
      "job-applied",
      {
        jobTitle: responseSnapshot.job.title,
        studentName: student.user.name,
        companyName: responseSnapshot.job.company.name,
        email: student.user.email,
      },
      emailOptions,
    );

    log.info("applyJob.email.queued", {
      jobId: responseSnapshot.job.id,
      studentId: student.id,
    });

    await redisConnection.incr(
      `company:job:${responseSnapshot.job.id}:version`,
    );
    await redisConnection.incr(`job:${responseSnapshot.job.id}:version`);

    log.info("applyJob.cache.invalidated", {
      jobId: responseSnapshot.job.id,
    });
  }

  log.info("request.success", {
    action: "applyJob",
    jobId,
    occured,
  });

  res.json(
    new ApiResponse(201, responseSnapshot, "your have applied to this job"),
  );
});

const getJobsList = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "getJobsList",
    actorId: req.user.id,
    role: req.user.role,
    ip: req.ip,
  });

  const { filter = "current" } = req.query;
  const { page, limit, skip } = getPagination(req.query);

  const student = await prisma.student.findUnique({
    where: { userId: req.user.id },
    select: {
      id: true,
      collegeId: true,
    },
  });
  if (!student) throw new ApiError(404, "no such student found");

  log.info("student.resolved", {
    studentId: student.id,
    collegeId: student.collegeId,
  });

  const version =
    Number(await redisConnection.get(`college:${student.collegeId}:jobs:version`)) ||
    1;

  const cacheKey = `college:${student.collegeId}:jobs:v${version}:filter:${filter}:page:${page}:limit:${limit}`;
  const cached = await redisConnection.get(cacheKey);

  if (cached) {
    log.info("studentJobs.cache.hit", {
      collegeId: student.collegeId,
      filter,
      page,
      limit,
    });

    return res.json(
      new ApiResponse(200, JSON.parse(cached), "jobs list(cached)"),
    );
  }

  log.info("studentJobs.cache.miss", {
    collegeId: student.collegeId,
    filter,
    page,
    limit,
  });

  const now = new Date();

  const jobSelect = {
    id: true,
    title: true,
    salary: true,
    dueDate: true,
  };

  let jobs = [];
  let totalJobs = 0;

  /* --------------------------------------------------
     JOB-BASED FILTERS
  -------------------------------------------------- */
  if (["current", "past", "all"].includes(filter)) {
    log.info("studentJobs.filter.job_based", {
      filter,
    });

    const whereClause = {
      status: "active",
      collegeId: student.collegeId,
      isApproved: true,
      mentorId: { not: null },
      ...(filter === "current" && { dueDate: { gte: now } }),
      ...(filter === "past" && { dueDate: { lt: now } }),
    };

    const [rows, count] = await prisma.$transaction([
      prisma.job.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { dueDate: "asc" },
        select: jobSelect,
      }),
      prisma.job.count({ where: whereClause }),
    ]);

    jobs = rows;
    totalJobs = count;
  } else if (
    /* --------------------------------------------------
       APPLICATION-BASED FILTERS
    -------------------------------------------------- */
    [
      "pending",
      "rejected",
      "shortlisted",
      "hired",
      "mentor_approval_pending",
      "mentor_approval_approved",
      "mentor_approval_rejected",
    ].includes(filter)
  ) {
    log.info("studentJobs.filter.application_based", {
      filter,
    });

    const whereClause = {
      studentId: student.id,
      ...(filter === "pending" && { status: "pending" }),
      ...(filter === "rejected" && { status: "rejected" }),
      ...(filter === "shortlisted" && { status: "shortlisted" }),
      ...(filter === "hired" && { status: "hired" }),
      ...(filter === "mentor_approval_pending" && {
        mentorApproval: "pending",
      }),
      ...(filter === "mentor_approval_approved" && {
        mentorApproval: "approved",
      }),
      ...(filter === "mentor_approval_rejected" && {
        mentorApproval: "rejected",
      }),
    };

    const [rows, count] = await prisma.$transaction([
      prisma.application.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { appliedAt: "desc" },
        select: {
          job: { select: jobSelect },
        },
      }),
      prisma.application.count({ where: whereClause }),
    ]);

    jobs = rows.map((r) => r.job);
    totalJobs = count;
  } else if (filter === "not_applied") {
    /* --------------------------------------------------
       NOT APPLIED
    -------------------------------------------------- */
    log.info("studentJobs.filter.not_applied");

    const whereClause = {
      status: "active",
      collegeId: student.collegeId,
      isApproved: true,
      mentorId: { not: null },
      applications: {
        none: {
          studentId: student.id,
        },
      },
    };

    const [rows, count] = await prisma.$transaction([
      prisma.job.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { dueDate: "asc" },
        select: jobSelect,
      }),
      prisma.job.count({ where: whereClause }),
    ]);

    jobs = rows;
    totalJobs = count;
  } else {
    log.warn("studentJobs.filter.invalid", {
      filter,
    });

    throw new ApiError(400, "invalid filter");
  }

  log.info("studentJobs.query.executed", {
    collegeId: student.collegeId,
    filter,
    returnedCount: jobs.length,
    totalJobs,
  });

  const responsePayLoad = {
    jobs,
    pagination: {
      page,
      limit,
      totalJobs,
      totalPages: Math.ceil(totalJobs / limit),
      hasPrevPage: page > 1,
      hasNextPage: skip + jobs.length < totalJobs,
    },
  };

  await redisConnection.setex(cacheKey, 60, JSON.stringify(responsePayLoad));

  log.info("studentJobs.cache.set", {
    collegeId: student.collegeId,
    filter,
    page,
    limit,
    ttl: 60,
  });

  log.info("request.success", {
    action: "getJobsList",
    studentId: student.id,
    filter,
    returnedCount: jobs.length,
  });

  res.json(new ApiResponse(200, responsePayLoad, "student jobs"));
});



const getJobDetail = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "getJobDetail",
    actorId: req.user.id,
    role: req.user.role,
    ip: req.ip,
    jobId: req.params.jobId,
  });

  const { jobId } = req.params;
  if (!jobId) throw new ApiError(403, "please provide job id");

  const student = await prisma.student.findUnique({
    where: { userId: req.user.id },
    select: { collegeId: true },
  });
  if (!student) throw new ApiError(404, "no such student found");

  log.info("student.resolved", {
    collegeId: student.collegeId,
  });

  const version =
    Number(await redisConnection.get(`company:job:${jobId}:version`)) || 1;

  const cacheKey = `company:job:${jobId}}:v${version}`;
  const cached = await redisConnection.get(cacheKey);

  if (cached) {
    log.info("studentJob.cache.hit", {
      jobId,
      collegeId: student.collegeId,
    });

    return res.json(
      new ApiResponse(200, JSON.parse(cached), "job requests(cached)"),
    );
  }

  log.info("studentJob.cache.miss", {
    jobId,
    collegeId: student.collegeId,
  });

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      title: true,
      salary: true,
      tenure: true,
      address: true,
      dueDate: true,
      collegeId: true,
      createdAt: true,
      mentorId: true,
      status: true,
      company: {
        select: {
          name: true,
          address: true,
          email: true,
          contactNo: true,
        },
      },
      mentor: {
        select: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!job) {
    log.warn("studentJob.not_found", {
      jobId,
    });

    throw new ApiError(404, "no such job found");
  }

  if (job.collegeId !== student.collegeId) {
    log.warn("studentJob.forbidden.college", {
      jobId,
      studentCollegeId: student.collegeId,
      jobCollegeId: job.collegeId,
    });

    throw new ApiError(403, "you cant apply to another college job");
  }

  if (job.status !== "active") {
    log.warn("studentJob.inactive", {
      jobId,
      status: job.status,
    });

    throw new ApiError(403, "the job is currently not active");
  }

  if (job.isApproved === false) {
    log.warn("studentJob.not_approved", {
      jobId,
    });

    throw new ApiError(403, "the job is not approved by your college yet");
  }

  if (!job.mentorId) {
    log.warn("studentJob.mentor.missing", {
      jobId,
    });

    throw new ApiError(403, "your college has not yet assigned a mentor");
  }

  job.mentor = {
    name: job.mentor.user.name,
    email: job.mentor.user.email,
  };

  await redisConnection.setex(cacheKey, 60, JSON.stringify(job));

  log.info("studentJob.cache.set", {
    jobId,
    ttl: 60,
  });

  log.info("request.success", {
    action: "getJobDetail",
    jobId,
  });

  res.json(new ApiResponse(200, job, "job details"));
});


const getStudentList = asyncHandler(async (req, res) => {
  let { filter, sortBy = "name", sortOrder = 1 } = req.query;

  if (!["branch", "status"].includes(filter)) filter = "";
  if (!["name", "email", "branch"].includes(sortBy)) sortBy = "name";

  sortOrder = Number(sortOrder) === -1 ? -1 : 1;

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select: { id: true },
  });

  if (!college) throw new ApiError(404, "College not found");

  /* ---------- COMPLETED STUDENTS ---------- */

  let completedStudents = await prisma.student.findMany({
    where: {
      collegeId: college.id,
    },
    select: {
      rollNo: true,
      branch: true,
      skills: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });

  completedStudents = completedStudents.map((student) => ({
    rollNo: student.rollNo,
    id: student.user.id,
    name: student.user.name,
    email: student.user.email,
    branch: student.branch,
    skills: student.skills,
    status: "completed",
  }));

  /* ---------- PENDING STUDENTS ---------- */

  let pendingStudents = await prisma.user.findMany({
    where: {
      metadata: {
        path: ["collegeId"],
        equals: college.id,
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      metadata: true,
    },
  });

  pendingStudents = pendingStudents.map((student) => ({
    id: student.id,
    name: student.name,
    email: student.email,
    skills: [],
    status: "pending",
  }));

  /* ---------- MERGE ---------- */

  let students = [...completedStudents, ...pendingStudents];

  /* ---------- FILTER ---------- */

  if (filter === "branch") {
    const branch = req.query.branch;
    students = students.filter((s) => s.branch === branch);
  }

  if (filter === "status") {
    const status = req.query.status;
    students = students.filter((s) => s.status === status);
  }

  /* ---------- SORT ---------- */

  students = students.sort((a, b) => {
    const valA = (a[sortBy] || "").toString().toLowerCase();
    const valB = (b[sortBy] || "").toString().toLowerCase();

    if (valA < valB) return -1 * sortOrder;
    if (valA > valB) return 1 * sortOrder;
    return 0;
  });

  res.json(new ApiResponse(200, students, "students fetched!"));
});

export {
  uploadBulkStudents,
  createProfile,
  editProfile,
  addSkill,
  apply,
  getJobsList,
  getJobDetail,
  getStudentList
};
