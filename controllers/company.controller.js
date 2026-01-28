import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";

import { PrismaClient } from "@prisma/client";
import { generatePassword, hashPassword } from "../utils/password.util.js";
import { emailOptions, emailQueue } from "../queues/email-queue.js";

const prisma = new PrismaClient();
import crypto from "crypto";
import { canStudentApplicationTransition } from "../domain/studentApplicationStateMachine.js";
import { redisConnection } from "../config/redis.js";
import { log } from "../utils/logger.js";

function createJobHash(data) {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        title: data.title,
        salary: data.salary,
        tenure: data.tenure,
        address: data.address,
        dueDate: data.dueDate.toISOString(),
        companyId: data.companyId,
        collegeId: data.collegeId,
      })
    )
    .digest("hex");
}

const createEmployee = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "createEmployee",
    actorId: req.user.id,
    role: req.user.role,
    ip: req.ip,
  });

  const { name, email, hireDate } = req.body;
  if (!name || !email) throw new ApiError(403, "please provide all details");

  const company = await prisma.company.findUnique({
    where: { email: req.user.email },
    select: { id: true, name: true },
  });
  if (!company) throw new ApiError(404, "no company found for this user");

  const password = generatePassword(8);
  let employee = null;

  try {
    await prisma.$transaction(async (tx) => {
      const hashedPassword = await hashPassword(password);

      const user = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: "employee",
          createdAt: hireDate ? new Date(hireDate) : new Date(),
        },
        select: { id: true },
      });

      employee = await tx.employee.create({
        data: {
          userId: user.id,
          companyId: company.id,
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
          company: {
            select: {
              id: true,
              name: true,
              address: true,
              email: true,
              contactNo: true,
            },
          },
        },
      });
    });
  } catch (err) {
    if (err.code === "P2002") {
      log.warn("employee.create.conflict", {
        email,
        companyId: company.id,
      });
      throw new ApiError(409, "user/employee already exists");
    }

    log.error("employee.create.failed", {
      error: err.message,
      companyId: company.id,
    });
    throw new ApiError(500, "failed to create employee");
  }

  await emailQueue.add(
    "employee-credentials",
    {
      name,
      email,
      password,
      companyName: company.name,
    },
    emailOptions,
  );

  log.info("side_effect.email_enqueued", {
    action: "createEmployee",
    queue: "employee-credentials",
    email,
  });

  await redisConnection.incr(`company:${company.id}:employees:version`);

  log.info("side_effect.cache_invalidated", {
    key: `company:${company.id}:employees:version`,
  });

  log.info("request.success", {
    action: "createEmployee",
    employeeId: employee.id,
    companyId: company.id,
  });

  res.json(new ApiResponse(201, employee, "employee created successfully"));
});


const collabWithCollege = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "collabWithCollege",
    actorId: req.user.id,
    role: req.user.role,
    collegeId: req.params.collegeId,
    ip: req.ip,
  });

  const { collegeId } = req.params;
  if (!collegeId) throw new ApiError(400, "please provide college id");

  const company = await prisma.company.findUnique({
    where: { email: req.user.email },
    select: { id: true, name: true },
  });
  if (!company) throw new ApiError(404, "no such company found");

  const college = await prisma.college.findUnique({
    where: { id: collegeId },
    select: { id: true, name: true, email: true },
  });
  if (!college) throw new ApiError(404, "no such college found");

  let collabRequest;
  let created = false;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.collab.findUnique({
      where: {
        collegeId_companyId: {
          collegeId,
          companyId: company.id,
        },
      },
      select: {
        id: true,
        createdAt: true,
        collegeId: true,
        companyId: true,
        status: true,
      },
    });

    if (existing) {
      collabRequest = existing;

      log.info("collab.already_exists", {
        companyId: company.id,
        collegeId,
        collabId: existing.id,
        status: existing.status,
      });

      return;
    }

    collabRequest = await tx.collab.create({
      data: {
        collegeId,
        companyId: company.id,
      },
      select: {
        id: true,
        createdAt: true,
        collegeId: true,
        companyId: true,
        status: true,
      },
    });

    created = true;

    log.info("collab.created", {
      collabId: collabRequest.id,
      companyId: company.id,
      collegeId,
    });
  });

  if (created) {
    await emailQueue.add(
      "collab-request",
      {
        collegeEmail: college.email,
        collegeName: college.name,
        companyName: company.name,
      },
      emailOptions,
    );

    log.info("side_effect.email_enqueued", {
      action: "collabWithCollege",
      queue: "collab-request",
      collegeEmail: college.email,
    });

    await redisConnection.incr(`college:${college.id}:collab:requests:version`);
    await redisConnection.incr(`colleges:version`);

    log.info("side_effect.cache_invalidated", {
      keys: [
        `college:${college.id}:collab:requests:version`,
        `colleges:version`,
      ],
    });
  }

  log.info("request.success", {
    action: "collabWithCollege",
    created,
    collabId: collabRequest.id,
    companyId: company.id,
    collegeId,
  });

  res.json(
    new ApiResponse(
      201,
      collabRequest,
      created
        ? "collaboration request sent successfully"
        : "collaboration request already exists",
    ),
  );
});



const resetPassword = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "resetPassword",
    actorId: req.user.id,
    role: req.user.role,
    targetUserId: req.params.userId,
    ip: req.ip,
  });

  const { userId } = req.params;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      employee: {
        select: {
          companyId: true,
        },
      },
    },
  });
  if (!user) throw new ApiError(404, "no such user found");

  const company = await prisma.company.findUnique({
    where: { email: req.user.email },
    select: { id: true, name: true },
  });
  if (!company) throw new ApiError(404, "no such company found");

  if (!user.employee)
    throw new ApiError(403, "you can only reset password of employee");

  if (user.employee.companyId !== company.id)
    throw new ApiError(
      403,
      "you cant reset password of user outside your organization",
    );

  log.info("authz.passed", {
    action: "resetPassword",
    companyId: company.id,
    targetUserId: user.id,
  });

  const password = generatePassword(8);
  const hashedPassword = await hashPassword(password);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    await tx.session.updateMany({
      where: { userId: user.id },
      data: { revokedAt: new Date() },
    });
  });

  log.warn("security.password_reset", {
    targetUserId: user.id,
    companyId: company.id,
    sessionsRevoked: true,
  });

  await emailQueue.add(
    "reset-password",
    {
      name: user.name,
      email: user.email,
      role: "employee",
    },
    emailOptions,
  );

  log.info("side_effect.email_enqueued", {
    action: "resetPassword",
    queue: "reset-password",
    targetUserEmail: user.email,
  });

  log.info("request.success", {
    action: "resetPassword",
    targetUserId: user.id,
    companyId: company.id,
  });

  res.json(new ApiResponse(200, {}, "password reset successfully"));
});


const addSkill = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "addSkill",
    actorId: req.user.id,
    role: req.user.role,
    ip: req.ip,
  });

  const { name } = req.body;
  if (!name) throw new ApiError(400, "please provide skill name");

  const skillName = name.toUpperCase();
  let occured = false;
  let skill = null;

  await prisma.$transaction(async (tx) => {
    const exists = await tx.skill.findUnique({
      where: { name: skillName },
    });

    if (exists) {
      skill = exists;

      log.info("skill.exists", {
        action: "addSkill",
        skillName,
        skillId: exists.id,
      });

      return;
    }

    skill = await tx.skill.create({
      data: {
        name: skillName,
      },
    });

    occured = true;

    log.info("skill.created", {
      action: "addSkill",
      skillName,
      skillId: skill.id,
    });
  });

  await redisConnection.incr(`company:skills:version`);

  log.info("cache.invalidated", {
    action: "addSkill",
    key: "company:skills:version",
  });

  log.info("request.success", {
    action: "addSkill",
    skillId: skill.id,
    occured,
  });

  res.json(
    new ApiResponse(
      201,
      skill,
      occured ? "new skill added" : "skill already exists",
    ),
  );
});


const postJob = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "postJob",
    actorId: req.user.id,
    role: req.user.role,
    ip: req.ip,
  });

  const { title, salary, tenure, address, dueDate } = req.body;
  let { skills, collegeIds } = req.body;

  if (!title || !Array.isArray(collegeIds) || collegeIds.length === 0) {
    throw new ApiError(400, "title and at least one college is required");
  }
  if (!Array.isArray(skills) || skills.length === 0) {
    throw new ApiError(400, "at least one skill is required");
  }

  collegeIds = [...new Set(collegeIds)];
  skills = [...new Set(skills)];

  log.info("postJob.input.validated", {
    title,
    collegeCount: collegeIds.length,
    skillCount: skills.length,
  });

  const company = await prisma.company.findUnique({
    where: { email: req.user.email },
    select: { id: true, name: true, address: true },
  });
  if (!company) throw new ApiError(404, "no such company found");

  log.info("postJob.company.resolved", {
    companyId: company.id,
    companyName: company.name,
  });

  const colleges = await prisma.college.findMany({
    where: { id: { in: collegeIds } },
    select: { id: true, name: true, email: true },
  });
  if (colleges.length !== collegeIds.length) {
    throw new ApiError(400, "one or more colleges are invalid");
  }

  const skillRecords = await prisma.skill.findMany({
    where: { id: { in: skills } },
    select: { id: true },
  });
  if (skillRecords.length !== skills.length) {
    throw new ApiError(400, "one or more skills are invalid");
  }

  const collabs = await prisma.collab.findMany({
    where: {
      companyId: company.id,
      collegeId: { in: collegeIds },
      status: "accepted",
    },
    select: { collegeId: true },
  });

  const allowedColleges = new Set(collabs.map((c) => c.collegeId));
  for (const id of collegeIds) {
    if (!allowedColleges.has(id)) {
      log.warn("postJob.collab.missing", {
        companyId: company.id,
        collegeId: id,
      });
      throw new ApiError(403, `no active collaboration with college ${id}`);
    }
  }

  const finalDueDate = dueDate
    ? new Date(dueDate)
    : new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);

  const createdJobs = [];

  await prisma.$transaction(async (tx) => {
    for (const college of colleges) {
      const jobHash = createJobHash({
        title,
        salary: salary ? Number(salary) : null,
        tenure,
        address: address ?? company.address,
        dueDate: finalDueDate,
        companyId: company.id,
        collegeId: college.id,
      });

      let job;
      let created = false;

      try {
        job = await tx.job.create({
          data: {
            title,
            salary: salary ? Number(salary) : null,
            tenure: tenure ?? null,
            address: address ?? company.address,
            dueDate: finalDueDate,
            companyId: company.id,
            collegeId: college.id,
            jobHash,
          },
          select: {
            id: true,
            title: true,
            college: { select: { id: true, name: true, email: true } },
          },
        });

        created = true;

        log.info("postJob.job.created", {
          jobId: job.id,
          collegeId: college.id,
        });
      } catch (err) {
        if (err.code === "P2002") {
          job = await tx.job.findUnique({
            where: {
              companyId_collegeId_jobHash: {
                companyId: company.id,
                collegeId: college.id,
                jobHash,
              },
            },
            select: {
              id: true,
              title: true,
              college: { select: { id: true, name: true, email: true } },
            },
          });

          log.info("postJob.job.duplicate", {
            jobId: job.id,
            collegeId: college.id,
          });
        } else {
          throw err;
        }
      }

      if (created) {
        await tx.jobSkill.createMany({
          data: skills.map((skillId) => ({
            jobId: job.id,
            skillId,
          })),
          skipDuplicates: true,
        });
      }

      createdJobs.push({ job, created });
    }
  });

  for (const entry of createdJobs) {
    if (!entry.created) continue;

    await emailQueue.add(
      "post-job",
      {
        collegeEmail: entry.job.college.email,
        collegeName: entry.job.college.name,
        companyName: company.name,
        jobTitle: entry.job.title,
      },
      emailOptions,
    );

    log.info("postJob.email.queued", {
      jobId: entry.job.id,
      collegeId: entry.job.college.id,
    });

    await redisConnection.incr(
      `college:${entry.job.college.id}:job:requests:version`,
    );
    await redisConnection.incr(`college:${entry.job.college.id}:jobs:version`);

    log.info("postJob.cache.invalidated", {
      collegeId: entry.job.college.id,
    });
  }

  await redisConnection.incr(`company:${company.id}:jobs:version`);

  log.info("postJob.cache.invalidated", {
    companyId: company.id,
  });

  log.info("request.success", {
    action: "postJob",
    totalJobs: createdJobs.length,
    createdCount: createdJobs.filter((j) => j.created).length,
  });

  res.json(
    new ApiResponse(200, createdJobs, "job posting processed successfully"),
  );
});



const makeStudentApplicationDecision = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "makeStudentApplicationDecision",
    actorId: req.user.id,
    role: req.user.role,
    ip: req.ip,
  });

  const { applicationId } = req.params;
  const { result } = req.body;

  if (!applicationId || !result) {
    throw new ApiError(403, "please provide studentId and your decision");
  }
  if (!["1", "0"].includes(result)) {
    throw new ApiError(403, "please provide proper decision in either 0 or 1");
  }

  const nextStatus = result === "1" ? "shortlisted" : "rejected";
  let application = null;
  let occured = false;

  log.info("makeDecision.input.validated", {
    applicationId,
    nextStatus,
  });

  await prisma.$transaction(async (tx) => {
    const tempApplication = await tx.application.findUnique({
      where: { id: applicationId },
      select: {
        id: true,
        status: true,
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
      },
    });

    if (!tempApplication) {
      throw new ApiError(404, "no such application found");
    }

    const currentStatus = tempApplication.status;

    if (!canStudentApplicationTransition(currentStatus, nextStatus)) {
      if (currentStatus === nextStatus) {
        application = tempApplication;

        log.info("makeDecision.noop", {
          applicationId,
          status: currentStatus,
        });

        return;
      } else {
        log.warn("makeDecision.invalid_transition", {
          applicationId,
          fromStatus: currentStatus,
          toStatus: nextStatus,
        });

        throw new ApiError(
          409,
          `invalid job transition from ${currentStatus} to ${nextStatus}`,
        );
      }
    }

    const updated = await tx.application.updateMany({
      where: { id: tempApplication.id, status: currentStatus },
      data: { status: nextStatus },
    });

    if (updated.count === 1) {
      occured = true;
      application = {
        ...updated,
        status: nextStatus,
      };

      log.info("makeDecision.status.updated", {
        applicationId,
        fromStatus: currentStatus,
        toStatus: nextStatus,
      });
    }
  });

  if (occured) {
    await emailQueue.add(
      "student-application-decision-company",
      {
        studentName: application.student.user.name,
        companyName: application.job.company.name,
        jobTitle: application.job.title,
        status: nextStatus,
        studentEmail: application.student.user.email,
      },
      emailOptions,
    );

    log.info("makeDecision.email.queued", {
      applicationId,
      jobId: application.job.id,
      status: nextStatus,
    });

    await redisConnection.incr(`company:job:${application.job.id}:version`);

    log.info("makeDecision.cache.invalidated", {
      jobId: application.job.id,
    });
  }

  log.info("request.success", {
    action: "makeStudentApplicationDecision",
    applicationId,
    occured,
    finalStatus: nextStatus,
  });

  res.json(
    new ApiResponse(200, application, `the student has been ${nextStatus}`),
  );
});


const getEmployeesList = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "getEmployeesList",
    actorId: req.user.id,
    role: req.user.role,
    ip: req.ip,
  });

  const { search } = req.query;
  const { page, limit, skip } = getPagination(req.query);

  const company = await prisma.company.findUnique({
    where: { email: req.user.email },
    select: { id: true },
  });
  if (!company) throw new ApiError(404, "no such company found");

  log.info("getEmployees.company.resolved", {
    companyId: company.id,
  });

  const version =
    (await redisConnection.get(`company:${company.id}:employees:version`)) || 1;

  const cacheKey = `company:${company.id}:employees:v${version}:filter:${search}:page:${page}:limit:${limit}`;
  const cached = await redisConnection.get(cacheKey);

  if (cached) {
    log.info("getEmployees.cache.hit", {
      companyId: company.id,
      page,
      limit,
      search,
    });

    return res.json(
      new ApiResponse(200, JSON.parse(cached), "employees list(cached)"),
    );
  }

  log.info("getEmployees.cache.miss", {
    companyId: company.id,
    page,
    limit,
    search,
  });

  const whereClause = {
    companyId: company.id,
    ...(search && {
      user: {
        is: {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { email: { contains: search, mode: "insensitive" } },
            { id: { contains: search, mode: "insensitive" } },
          ],
        },
      },
    }),
  };

  const [employees, totalEmployees] = await prisma.$transaction([
    prisma.employee.findMany({
      where: whereClause,
      skip: skip,
      take: limit,
      orderBy: { id: "desc" },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
          },
        },
      },
    }),

    prisma.employee.count({ where: whereClause }),
  ]);

  log.info("getEmployees.query.executed", {
    companyId: company.id,
    returnedCount: employees.length,
    totalEmployees,
  });

  const responsePayLoad = {
    employees,
    pagination: {
      page,
      limit,
      totalEmployees,
      totalPages: Math.ceil(totalEmployees / limit),
      hasPrevPage: page > 1,
      hasNextPage: skip + employees.length < totalEmployees,
    },
  };

  await redisConnection.setex(cacheKey, 60, JSON.stringify(responsePayLoad));

  log.info("getEmployees.cache.set", {
    companyId: company.id,
    page,
    limit,
    ttl: 60,
  });

  log.info("request.success", {
    action: "getEmployeesList",
    companyId: company.id,
    page,
    limit,
    returnedCount: employees.length,
  });

  res.json(new ApiResponse(200, responsePayLoad, "employees list"));
});

const getEmployeeDetail = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "getEmployeeDetail",
    actorId: req.user.id,
    role: req.user.role,
    ip: req.ip,
    employeeId: req.params.employeeId,
  });

  const { employeeId } = req.params;

  const company = await prisma.company.findUnique({
    where: { email: req.user.email },
    select: { id: true },
  });
  if (!company) throw new ApiError(404, "no such company found");

  log.info("getEmployee.company.resolved", {
    companyId: company.id,
  });

  const version =
    (await redisConnection.get(`employee:${employeeId}:version`)) || 1;

  const cacheKey = `employee:${employeeId}}:v${version}`;
  const cached = await redisConnection.get(cacheKey);

  if (cached) {
    log.info("getEmployee.cache.hit", {
      employeeId,
      companyId: company.id,
    });

    return res.json(
      new ApiResponse(200, JSON.parse(cached), "employee details(cached)"),
    );
  }

  log.info("getEmployee.cache.miss", {
    employeeId,
    companyId: company.id,
  });

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      companyId: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          createdAt: true,
        },
      },
      interviews: {
        select: {
          id: true,
          date: true,
          time: true,
          address: true,
          selected: true,
          student: {
            select: {
              branch: true,
              college: {
                select: {
                  name: true,
                  email: true,
                  address: true,
                },
              },
              year: true,
              rollNo: true,
            },
          },
        },
      },
    },
  });

  if (!employee) throw new ApiError(404, "no such employee found");

  if (employee.companyId !== company.id) {
    log.warn("getEmployee.forbidden", {
      employeeId,
      companyId: company.id,
      employeeCompanyId: employee.companyId,
    });

    throw new ApiError(403, "you cant see employee of another company");
  }

  await redisConnection.setex(cacheKey, 120, JSON.stringify(employee));

  log.info("getEmployee.cache.set", {
    employeeId,
    ttl: 120,
  });

  log.info("request.success", {
    action: "getEmployeeDetail",
    employeeId,
  });

  res.json(new ApiResponse(200, employee, "employee details"));
});


const getAllColleges = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "getAllColleges",
    actorId: req.user.id,
    role: req.user.role,
    ip: req.ip,
  });

  let { filter = "all" } = req.query;
  const { page, limit, skip } = getPagination(req.query);

  const company = await prisma.company.findUnique({
    where: { email: req.user.email },
    select: { id: true },
  });
  if (!company) throw new ApiError(404, "no such company found");

  log.info("getColleges.company.resolved", {
    companyId: company.id,
  });

  const version = (await redisConnection.get(`colleges:version`)) || 1;

  const cacheKey = `colleges:v${version}:filter:${filter}:page:${page}:limit:${limit}`;
  const cached = await redisConnection.get(cacheKey);

  if (cached) {
    log.info("getColleges.cache.hit", {
      filter,
      page,
      limit,
    });

    return res.json(
      new ApiResponse(200, JSON.parse(cached), "all colleges(cached)"),
    );
  }

  log.info("getColleges.cache.miss", {
    filter,
    page,
    limit,
  });

  const collegeSelect = {
    id: true,
    name: true,
    address: true,
    email: true,
  };

  let colleges = [];
  let totalColleges = 0;

  /* --------------------------------------------------
     FILTER: ALL
  -------------------------------------------------- */
  if (filter === "all") {
    log.info("getColleges.filter.all");

    const [rows, count] = await prisma.$transaction([
      prisma.college.findMany({
        skip,
        take: limit,
        orderBy: { name: "asc" },
        select: {
          ...collegeSelect,
          collabs: {
            where: { companyId: company.id },
            select: { status: true },
          },
        },
      }),
      prisma.college.count(),
    ]);

    colleges = rows.map((c) => ({
      id: c.id,
      name: c.name,
      address: c.address,
      email: c.email,
      status:
        c.collabs.length === 0
          ? "not applied"
          : c.collabs[0].status === "accepted"
            ? "collaborated"
            : c.collabs[0].status,
    }));

    totalColleges = count;
  } else if (["pending", "rejected", "collaborated"].includes(filter)) {
    /* --------------------------------------------------
       FILTER: pending / rejected / collaborated
    -------------------------------------------------- */
    log.info("getColleges.filter.collab", {
      filter,
    });

    const statusMap = {
      pending: "pending",
      rejected: "rejected",
      collaborated: "accepted",
    };

    const whereClause = {
      companyId: company.id,
      status: statusMap[filter],
    };

    const [rows, count] = await prisma.$transaction([
      prisma.collab.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { college: { name: "asc" } },
        select: {
          status: true,
          college: { select: collegeSelect },
        },
      }),
      prisma.collab.count({ where: whereClause }),
    ]);

    colleges = rows.map((r) => ({
      ...r.college,
      status: filter === "collaborated" ? "collaborated" : r.status,
    }));

    totalColleges = count;
  } else if (filter === "not_applied") {
    /* --------------------------------------------------
       FILTER: not_applied
    -------------------------------------------------- */
    log.info("getColleges.filter.not_applied");

    const whereClause = {
      collabs: {
        none: {
          companyId: company.id,
        },
      },
    };

    const [rows, count] = await prisma.$transaction([
      prisma.college.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { name: "asc" },
        select: collegeSelect,
      }),
      prisma.college.count({ where: whereClause }),
    ]);

    colleges = rows.map((c) => ({
      ...c,
      status: "not applied",
    }));

    totalColleges = count;
  } else {
    log.warn("getColleges.filter.invalid", {
      filter,
    });

    throw new ApiError(400, "invalid filter");
  }

  log.info("getColleges.query.executed", {
    filter,
    returnedCount: colleges.length,
    totalColleges,
  });

  const responsePayLoad = {
    colleges,
    pagination: {
      page,
      limit,
      totalColleges,
      totalPages: Math.ceil(totalColleges / limit),
      hasPrevPage: page > 1,
      hasNextPage: skip + colleges.length < totalColleges,
    },
  };

  await redisConnection.setex(cacheKey, 60, JSON.stringify(responsePayLoad));

  log.info("getColleges.cache.set", {
    filter,
    page,
    limit,
    ttl: 60,
  });

  log.info("request.success", {
    action: "getAllColleges",
    filter,
    returnedCount: colleges.length,
  });

  res.json(new ApiResponse(200, responsePayLoad, "colleges list"));
});



const getCollegeDetails = async (req, res) => {
  log.info("request.start", {
    action: "getCollegeDetails",
    actorId: req.user?.id,
    role: req.user?.role,
    ip: req.ip,
    collegeId: req.params.collegeId,
  });

  const { collegeId } = req.params;

  const version =
    (await redisConnection.get(`college:${collegeId}:version`)) || 1;

  const cacheKey = `college:${collegeId}}:v${version}`;
  const cached = await redisConnection.get(cacheKey);

  if (cached) {
    log.info("getCollege.cache.hit", {
      collegeId,
    });

    return res.json(
      new ApiResponse(200, JSON.parse(cached), "college details(cached)"),
    );
  }

  log.info("getCollege.cache.miss", {
    collegeId,
  });

  let college = await prisma.college.findUnique({
    where: { id: collegeId },
    select: {
      id: true,
      name: true,
      address: true,
      email: true,
      phone: true,
      collabs: {
        where: {
          status: "accepted",
        },
      },
    },
  });

  if (!college) {
    log.warn("getCollege.not_found", {
      collegeId,
    });

    throw new ApiError(404, "no such college found");
  }

  college = {
    ...college,
    collaboratedCount: college.collabs.length,
  };
  college.collabs = undefined;

  await redisConnection.setex(cacheKey, 60, JSON.stringify(college));

  log.info("getCollege.cache.set", {
    collegeId,
    ttl: 60,
  });

  log.info("request.success", {
    action: "getCollegeDetails",
    collegeId,
  });

  res.json(new ApiResponse(200, college, "college details"));
};


const getAllJobs = asyncHandler(async (req, res) => {
  log.info("request.start", {
    action: "getAllJobs",
    actorId: req.user.id,
    role: req.user.role,
    ip: req.ip,
  });

  const company = await prisma.company.findUnique({
    where: { email: req.user.email },
    select: { id: true },
  });
  if (!company) throw new ApiError(404, "no such company found");

  log.info("getJobs.company.resolved", {
    companyId: company.id,
  });

  const { page, limit, skip } = getPagination(req.query);
  let { filter = "current" } = req.query;

  const version =
    (await redisConnection.get(`company:${company.id}:jobs:version`)) || 1;

  const cacheKey = `company:${company.id}:jobs:v${version}:filter:${filter}:page:${page}:limit:${limit}`;
  const cached = await redisConnection.get(cacheKey);

  if (cached) {
    log.info("getJobs.cache.hit", {
      companyId: company.id,
      filter,
      page,
      limit,
    });

    return res.json(
      new ApiResponse(200, JSON.parse(cached), "company jobs(cached)"),
    );
  }

  log.info("getJobs.cache.miss", {
    companyId: company.id,
    filter,
    page,
    limit,
  });

  const whereClause = {
    companyId: company.id,
  };

  // ---- TIME-BASED FILTERS ----
  if (filter === "current") whereClause.dueDate = { gte: new Date() };
  if (filter === "past") whereClause.dueDate = { lt: new Date() };
  // ---- APPROVAL-BASED FILTERS ----
  if (filter === "accepted") whereClause.isApproved = true;
  if (filter === "pending") whereClause.isApproved = false;

  let [jobs, totalJobs] = await prisma.$transaction([
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
        isApproved: true,
        createdAt: true,
        college: {
          select: {
            name: true,
            address: true,
          },
        },
      },
    }),

    prisma.job.count({ where: whereClause }),
  ]);

  jobs = jobs.map((job) => ({
    ...job,
    status: filter,
  }));

  log.info("getJobs.query.executed", {
    companyId: company.id,
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

  log.info("getJobs.cache.set", {
    companyId: company.id,
    filter,
    page,
    limit,
    ttl: 60,
  });

  log.info("request.success", {
    action: "getAllJobs",
    companyId: company.id,
    filter,
    returnedCount: jobs.length,
  });

  res.json(new ApiResponse(200, responsePayLoad, "all jobs"));
});


const getAllSkills = asyncHandler(async (req, res) => {
  const { search, sortBy = "name", sortOrder = "desc" } = req.query;
  const version = (await redisConnection.get(`company:skills:version`)) || 1;

  const cacheKey = `company:skills:v${version}:filter:${search}:sortBy:${sortBy}:sortOrder:${sortOrder}`;
  const cached = await redisConnection.get(cacheKey);
  if (cached) {
    return res.json(
      new ApiResponse(200, JSON.parse(cached), "all skills(cached)"),
    );
  }
  const skills = await prisma.skill.findMany({
    where: {
      name: { contains: search, mode: "insensitive" },
    },
    orderBy: {
      [sortBy]: sortOrder,
    },
  });

  await redisConnection.setex(cacheKey,60,JSON.stringify(skills))

  res.json(new ApiResponse(200, skills, "all skills"));
});

const getJobDetails = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  if (!jobId) throw new ApiError(403, "please provide job id");

  const company = await prisma.company.findUnique({
    where: { email: req.user.email },
    select:{id:true}
  });
  if (!company) throw new ApiError(404, "no such company found");

  const version = (await redisConnection.get(`company:job:${jobId}:version`)) || 1;

  const cacheKey = `company:job:${jobId}:v${version}`;
  const cached = await redisConnection.get(cacheKey);
  if (cached) {
    return res.json(
      new ApiResponse(200, JSON.parse(cached), "job details(cached)"),
    );
  }

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
      companyId: true,
      isApproved: true,
      createdAt: true,
      college: {
        select: {
          id: true,
          name: true,
          address: true,
          email: true,
          phone: true,
        },
      },
      mentor: {
        select: {
          id: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
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
  if (job.companyId !== company.id)
    throw new ApiError(403, "job not belongs to your company");

  const shortlistedCandidates = job.applications.filter(
    (application) => application.status === "shortlisted"
  );
  const rejectedCandidates = job.applications.filter(
    (application) => application.status === "rejected"
  );
  const hiredCandidates = job.applications.filter(
    (application) => application.status === "hired"
  );
  const pendingCandidates = job.applications.filter(
    (application) => application.status === "pending"
  );

  job.applications = {
    shortlistedCandidates: shortlistedCandidates,
    rejectedCandidates: rejectedCandidates,
    hiredCandidates: hiredCandidates,
    pendingCandidates: pendingCandidates,
  };

  const applicationCount = {
    shortlisted: job.applications.shortlistedCandidates.length,
    rejected: job.applications.rejectedCandidates.length,
    hired: job.applications.hiredCandidates.length,
    pending: job.applications.pendingCandidates.length,
  };

  applicationCount.total =
    applicationCount.shortlisted +
    applicationCount.rejected +
    applicationCount.hired +
    applicationCount.pending;

  await redisConnection.setex(cacheKey,60,JSON.stringify({...job,applicationCount}))

  res.json(new ApiResponse(200, { ...job, applicationCount }, "job details"));
});

const exportEmployees = asyncHandler(async (req, res) => {
  const company = await prisma.company.findUnique({
    where: { email: req.user.email },
    select:{id:true}
  });
  if (!company) throw new ApiError(404, "no such company found");

  const employees = await prisma.employee.findMany({
    where: { companyId: company.id },
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
    ...employees.map((e) => [
      e.id,
      e.user.name,
      e.user.email,
      e.user.createdAt.toISOString(), // IMPORTANT
    ]),
  ];

  const csv = data.map((row) => row.join(",")).join("\n");

  res
    .setHeader("Content-Type", "text/csv; charset=utf-8")
    .setHeader("Content-Disposition", "attachment; filename=employees.csv")
    .setHeader("Cache-Control", "no-store")
    .send("\uFEFF" + csv);
});

export {
  createEmployee,
  collabWithCollege,
  resetPassword,
  postJob,
  addSkill,
  makeStudentApplicationDecision,
  getEmployeesList,
  getEmployeeDetail,
  getAllColleges,
  getAllSkills,
  getAllJobs,
  getJobDetails,
  getCollegeDetails,
  exportEmployees,
};
