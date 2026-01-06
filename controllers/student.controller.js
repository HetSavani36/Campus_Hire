import { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import { generatePassword, hashPassword } from "../utils/password.util.js";
import { parseFileBuffer } from "../utils/csv_parsing.util.js";
import { emailOptions, emailQueue } from "../queues/email-queue.js";
import csv from "csv-parser";

const prisma = new PrismaClient();

const uploadBulkStudents = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, "CSV file is required");
  
  // 1️⃣ Parse CSV
  const rows = await parseFileBuffer(req.file.buffer, req.file.originalname);

  if (!rows || rows.length === 0) {
    throw new ApiError(400, "CSV file is empty or invalid");
  }

  // 2️⃣ Get college from logged-in user
  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select:{id:true}
  });

  if (!college) {
    throw new ApiError(404, "College not found");
  }

  const createdStudents = [];
  const skippedStudents = [];

  // 3️⃣ Transaction: create users
  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      
      if (!row.email || !row.name) {
        skippedStudents.push({
          email: row.email || null,
          reason: "Missing required fields",
        });
        continue;
      }

      const existingUser = await tx.user.findUnique({
        where: { email: row.email },
        select:{id:true}
      });

      const existingStudent = await tx.student.findUnique({
        where: { email: row.email },
        select: { id: true },
      });

      if (existingUser || existingStudent) {
        skippedStudents.push({
          email: row.email,
          reason: "User already exists",
        });
        continue;
      }

      const password = generatePassword(8);
      const hashedPassword = await hashPassword(password);

      const user = await tx.user.create({
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
    }
  });

  // 4️⃣ Queue emails AFTER transaction commit
  if (createdStudents.length > 0) {
    
    for (const student of createdStudents) {
      await emailQueue.add(
        "student-credentials",
        {
          email: student.email,
          password: student.password,
          name: student.name,
          rollNo:student.rollNo
        },
        emailOptions
      );
    }

  }

  // 5️⃣ API Response (NO passwords exposed)
  return res.json(
    new ApiResponse(
      201,
      {
        createdCount: createdStudents.length,
        skippedCount: skippedStudents.length,
        skippedStudents,
      },
      "Bulk student upload completed successfully"
    )
  );
});

const createProfile = asyncHandler(async (req, res) => {
  const { year, aboutMe, branch } = req.body;
  if (!year || !branch) throw new ApiError(403, "please select year & branch");
  if (year !== "1" && year !== "2" && year !== "3" && year !== "4")
    throw new ApiError(403, "please select valid year");

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select:{
      id:true,
      metadata:true,
      hasCompletedProfile:true
    }
  });
  if (!user) throw new ApiError(404, "no such user found");

  if (user.hasCompletedProfile)
    throw new ApiError(403, "user already completed profile");
  if (!user.metadata) throw new ApiError(403, "no user data found");
  if (!user.metadata.collegeId || !user.metadata.rollNo)
    throw new ApiError(403, "collegeId or rollNo is missing in metadata");

  const [student, updatedUser] = await prisma.$transaction([
    prisma.student.create({
      data: {
        userId: user.id,
        collegeId: user.metadata.collegeId,
        year: Number(year),
        branch: branch,
        rollNo: user.metadata.rollNo,
        resume: null,
        aboutMe: aboutMe ?? null,
      },
      select:{id:true}
    }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        hasCompletedProfile: true,
      },
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
    }),
  ]);
  res.json(new ApiResponse(200, updatedUser, "profile created successfully"));
});

const editProfile = asyncHandler(async (req, res) => {
  const allowedUpdates = ["year", "resume", "aboutMe", "branch"];
  const update = {};

  allowedUpdates.forEach((field) => {
    if (req.body[field]) update[field] = req.body[field];
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

  res.json(new ApiResponse(200, user, "profile updated succeessfully"));
});

const addSkill = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name) throw new ApiError(403, "please provide skill name");

  const student = await prisma.student.findUnique({
    where: { userId: req.user.id },
    select: { id: true },
  });
  if (!student) throw new ApiError(404, "no such student found");

  const exists = await prisma.skill.findUnique({
    where: { name: name.toUpperCase() },
  });
  if (exists) {
    const studentSkillExists = await prisma.studentSkill.findUnique({
      where: {
        studentId_skillId: {
          studentId: student.id,
          skillId: exists.id,
        },
      },
      select:{skillId:true}
    });
    if (studentSkillExists) throw new ApiError(403, "skill already added");

    await prisma.studentSkill.create({
      data: {
        studentId: student.id,
        skillId: exists.id,
      },
      select:{id:true}
    });
    return res.json(new ApiResponse(201, exists, "skill added successfully"));
  }

  const skill = await prisma.skill.create({
    data: {
      name: name.toUpperCase(),
    },
  });
  await prisma.studentSkill.create({
    data: {
      studentId: student.id,
      skillId: skill.id,
    },
    select:{skillId:true}
  });

  res.json(new ApiResponse(201, skill, "skill added successfully"));
});

const apply = asyncHandler(async (req, res) => {
  
  const { jobId } = req.params;
  const student = await prisma.student.findUnique({
    where: { userId: req.user.id },
    select:{
      id:true,
      resume:true,
      collegeId:true,
      user:{
        select:{
          name:true,
          email:true
        }
      }
    }
  });
  if (!student) throw new ApiError(404, "no such student found");
  if (!student.resume) throw new ApiError(403, "please upload your resume first");

  const idempotencyKey=req.headers["idempotency-key"]
  if(!idempotencyKey) throw new ApiError(403,"idempotency key header is required")
  
  let responseSnapshot=null
  let occured=false

  await prisma.$transaction(async(tx)=>{

    const existingKey=await tx.idempotencyKey.findUnique({
      where:{key:idempotencyKey}
    })
    if(existingKey){
      responseSnapshot=existingKey.response
      occured=false
      return
    }

    const job = await tx.job.findUnique({
      where: { id: jobId },
      select:{
        id:true,
        collegeId:true,
        status:true,
        isApproved:true,
        dueDate:true,
        mentorId:true,
        title:true
      }
    });
    if (!job) throw new ApiError(404, "no such job found");
  
    if (job.collegeId !== student.collegeId) throw new ApiError(403, "the job is not for your college");
    if (!job.isApproved) throw new ApiError(403, "cant apply to un-approved job");
    if (job.status === "closed") throw new ApiError(403, "job application is closed");
    if (job.dueDate < new Date()) throw new ApiError(403, "the job application has expired");
    if (!job.mentorId) throw new ApiError(403, "cant apply without mentor");
  
    
    let application=null
    const selectQuery={
      id: true,
      status: true,
      appliedAt: true,
      job: {
        select: {
          title:true,
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
    }

    try {
      application = await tx.application.create({
        data: {
          studentId: student.id,
          jobId: job.id,
          mentorId: job.mentorId,
        },
        select: selectQuery
      });
      occured=true

    } catch (error) {
        if(error.code==="P2002"){
          application = await tx.application.findUnique({
            where: { studentId_jobId: { studentId: student.id, jobId:job.id } },
            select:selectQuery
          });
          occured = false;
        }
        else throw error
    }

    responseSnapshot=application

    await tx.idempotencyKey.create({
      data:{
        key:idempotencyKey,
        userId:student.id,
        endpoint:"POST /api/job/:jobId/apply",
        response:responseSnapshot
      }
    })
    
  })

  if(occured){
    await emailQueue.add(
      "job-applied",
      {
        jobTitle: responseSnapshot.job.title,
        studentName: student.user.name,
        companyName: responseSnapshot.job.company.name,
        email: student.user.email,
      },
      emailOptions
    );
  }

  res.json(new ApiResponse(201, responseSnapshot, "your have applied to this job"));
});

const getJobsList = asyncHandler(async (req, res) => {
  //current,past,shortlisted,hired,rejected,pending,menterApproval_pending,menterApproval_rejected,menterApproval_approved,applied,not_applied
  const { filter = "current" } = req.query;

  const student = await prisma.student.findUnique({
    where: { userId: req.user.id },
    select: {
      id: true,
      userId: true,
      collegeId: true,
    },
  });
  if (!student) throw new ApiError(404, "no such student found");

  let jobs = [];
  const jobProjector = {
    id: true,
    title: true,
    salary: true,
    dueDate: true,
  };

  if (filter === "current" || filter === "past" || filter === "all") {
    let whereClause = {
      status: "active",
      collegeId: student.collegeId,
      isApproved: true,
      mentorId: { not: null },
    };
    if (filter === "past") whereClause.dueDate = { lt: new Date() };
    if (filter === "current") whereClause.dueDate = { gte: new Date() };

    jobs = await prisma.job.findMany({
      where: whereClause,
      select: jobProjector,
    });
  } else {
    let whereClause = {
      studentId: student.id,
    };
    if (filter === "pending") whereClause.status = "pending";
    if (filter === "rejected") whereClause.status = "rejected";
    if (filter === "shortlisted") whereClause.status = "shortlisted";
    if (filter === "hired") whereClause.status = "hired";

    if (filter === "mentor_approval_pending")
      whereClause.mentorApproval = "pending";
    if (filter === "mentor_approval_approved")
      whereClause.mentorApproval = "approved";
    if (filter === "mentor_approval_rejected")
      whereClause.mentorApproval = "rejected";

    const applications = await prisma.application.findMany({
      where: whereClause,
      select: {
        job: {
          select: jobProjector,
        },
      },
    });
    jobs = applications.map((application) => application.job);

    if (filter === "not_applied") {
      const appliedJobIds = jobs.map((job) => job.id);
      jobs = await prisma.job.findMany({
        where: {
          id: { notIn: appliedJobIds },
        },
        select: jobProjector,
      });
    }
  }

  res.json(new ApiResponse(200, jobs, "student jobs"));
});

const getJobDetail = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  if (!jobId) throw new ApiError(403, "please provide job id");

  const student = await prisma.student.findUnique({
    where: { userId: req.user.id },
    select:{collegeId:true}
  });
  if (!student) throw new ApiError(404, "no such student found");

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
  if (!job) throw new ApiError(404, "no such job found");
  if (job.collegeId !== student.collegeId)
    throw new ApiError(403, "you cant apply to another college job");
  if (job.status !== "active")
    throw new ApiError(403, "the job is currently not active");
  if (job.isApproved === false)
    throw new ApiError(403, "the job is not approved by your college yet");
  if (!job.mentorId)
    throw new ApiError(403, "your college has not yet assigned a mentor");

  job.mentor = {
    name: job.mentor.user.name,
    email: job.mentor.user.email,
  };

  res.json(new ApiResponse(200, job, "job details"));
});

export {
  uploadBulkStudents,
  createProfile,
  editProfile,
  addSkill,
  apply,
  getJobsList,
  getJobDetail,
};
