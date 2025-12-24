import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import { PrismaClient } from "@prisma/client";
import { generatePassword, hashPassword } from "../utils/password.util.js";
import { emailOptions, emailQueue } from "../queues/email-queue.js";
const prisma = new PrismaClient();

const createMentor = asyncHandler(async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) throw new ApiError(403, "please provide all details");

  const exists = await prisma.user.findUnique({
    where: {
      email: email,
    },
  });
  if (exists) throw new ApiError(403, "user with this email already exists");

  const college = await prisma.college.findUnique({
    where: {
      email: req.user.email,
    },
  });
  if (!college)
    throw new ApiError(404, "no college found where this user works");

  const password = generatePassword(8);
  
  await emailQueue.add(
    "mentor-credentials",
    {
      name:name,
      email: email,
      password: password,
      collegeName:college.name
    },
    emailOptions
  );
  

  const hashedPassword = await hashPassword(password);

  const result = await prisma.$transaction(async (tx) => {
    const user = await prisma.user.create({
      data: {
        name: name,
        email: email,
        password: hashedPassword,
        role: "mentor",
      },
    });

    const mentor = await prisma.mentor.create({
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
    return { user, mentor };
  });

  res.json(
    new ApiResponse(
      201,
      { mentor: result.mentor },
      "mentor created successfully"
    )
  );
});

const collabDecision = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { result } = req.body;
  if (!companyId || !result)
    throw new ApiError(403, "please provide all details");
  if (result !== "0" && result !== "1")
    throw new ApiError(403, "provide proper result value");

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
  });
  if (!college) throw new ApiError(404, "no such college found");

  const company = await prisma.company.findUnique({ where: { id: companyId } });
  if (!company) throw new ApiError(404, "no such company found");

  const collabRequest = await prisma.collab.findUnique({
    where: {
      collegeId_companyId: {
        collegeId: college.id,
        companyId: companyId,
      },
    },
  });
  if (!collabRequest) throw new ApiError(404, "no such collab request found");

  if (collabRequest.status === "accepted")
    throw new ApiError(403, "collab request already accepted");

  const status = result === "1" ? "accepted" : "rejected";

  if (result === "1") {
    await prisma.collab.update({
      where: { id: collabRequest.id },
      data: {
        status: "accepted",
      },
    });
  } else {
    await prisma.collab.delete({
      where: { id: collabRequest.id },
    });
  }

  await emailQueue.add(
    "collab-decision",
    {
      companyName: company.name,
      collegeName: college.name,
      status: status,
      companyEmail:company.email
    },
    emailOptions
  );

  res.json(
    new ApiResponse(200, { status: status }, `the collab request is ${status}`)
  );
});

const resetPassword = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name:true,
      password: true,
      role:true,
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
  if (!user) throw new ApiError(404, "no such user found");

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
  });
  if (!college) throw new ApiError(404, "no such college found");

  if (!user.mentor && !user.student)
    throw new ApiError(403, "you can only reset password of student/mentor");
  if (user.mentor && user.mentor.collegeId !== college.id)
    throw new ApiError(
      403,
      "you cant reset password of user outside your organization"
    );
  if (user.student && user.student.collegeId !== college.id)
    throw new ApiError(
      403,
      "you cant reset password of user outside your organization"
    );

  const password = generatePassword(8);
  const hashedPassword = await hashPassword(password);

  
  await emailQueue.add(
    "reset-password",
    {
      name: user.name,
      email: user.email,
      role: user.role,
    },
    emailOptions
  );

  
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
    },
  });

  res.json(new ApiResponse(200, {}, "password reset successfully"));
});

const jobApprovalDecision = asyncHandler(async (req, res) => {
  const { jobId, result } = req.params;
  if (!jobId || !result) throw new ApiError(403, "please provide all details");
  if (result !== "1" && result !== "0")
    throw new ApiError(403, "please provide correct decision");

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
  });
  if (!college) throw new ApiError(404, "no such college found");

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select:{
      id:true,
      title:true,
      dueDate:true,
      isApproved:true,
      collegeId:true,
      company:{
        select:{
          name:true,
          email:true
        }
      }
    }
  });
  if (!job) throw new ApiError(404, "no such job found");

  if (job.collegeId !== college.id)
    throw new ApiError(
      403,
      "cant make decision for job request for another colleges"
    );
  if (job.dueDate < new Date()) throw new ApiError(403, "job expired");
  if (job.isApproved) throw new ApiError(403, "job request already approved");

  const approval = result === "1" ? true : false;
  if (approval) {
    await prisma.job.update({
      where: { id: job.id },
      data: { isApproved: true },
    });
  } else {
    await prisma.job.delete({
      where: { id: job.id },
    });
  }

  await emailQueue.add(
    "job-decision",
    {
      companyName:job.company.name,
      collegeName:college.name,
      jobTitle:job.title,
      status:approval?"approved":"rejected",
      companyEmail:job.company.email,
    },
    emailOptions
  );

  if(approval){
    const students=await prisma.student.findMany({
      where:{collegeId:college.id},
      select:{
        user:{
          select:{
            name:true,
            email:true
          }
        }
      }
    })

    for (const student of students) {
      await emailQueue.add(
        "job-notification",
        {
          studentName: student.user.name,
          email: student.user.email,
          companyName: job.company.name,
          jobTitle: job.title,
        },
        emailOptions
      );
    }
  }

  res.json(
    new ApiResponse(
      200,
      { approval: approval },
      `the job is ${approval ? "approved" : "rejected"}`
    )
  );
});

const assignMentor = asyncHandler(async (req, res) => {
  const { mentorId } = req.body;
  const { jobId } = req.params;
  if (!mentorId || !jobId)
    throw new ApiError(403, "please provide all details");

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
  });
  if (!college) throw new ApiError(404, "no such college found");

  const mentor = await prisma.mentor.findUnique({
    where: {
      collegeId: college.id,
      ...(search && {
        user: {
          is: {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      }),
    },
    select:{
      id:true,
      collegeId:true,
      user:{
        select:{
          name:true,
          email:true
        }
      }
    }
  });
  if (!mentor) throw new ApiError(404, "no such mentor found");

  if (mentor.collegeId !== college.id)
    throw new ApiError(403, "this mentor does not belong to your college");

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select:{
      collegeId:true,
      dueDate:true,
      status:true,
      isApproved:true,
      id:true,
      company:{
        select:{
          name:true
        }
      }
    }
  });
  if (!job) throw new ApiError(404, "no such job found");
  if (college.id !== job.collegeId)
    throw new ApiError(
      403,
      "cant assign mentor to job outside your organization"
    );
  if (job.status === "closed")
    throw new ApiError(403, "cant assign mentor to closed job");
  if (job.dueDate < new Date())
    throw new ApiError(403, "cant assign mentor to expired job");
  if (!job.isApproved)
    throw new ApiError(403, "cant assign mentor to un-approved job");

  const updatedJob = await prisma.job.update({
    where: { id: jobId },
    data: {
      mentorId: mentorId,
    },
  });

  await emailQueue.add(
    "assign-mentor",
    {
      mentorName:mentor.user.name,
      jobTitle:job.title,
      companyName:job.company.name,
      mentorEmail:mentor.user.email,
    },
    emailOptions
  );

  res.json(
    new ApiResponse(200, mentor, "mentor assigned/updated successfully")
  );
});

const getMentorsList = asyncHandler(async (req, res) => {
  const { filter = "all" } = req.query;

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
  });
  if (!college) throw new ApiError(404, "no such college found");

  let whereClause = {
    isApproved: true,
    collegeId: college.id,
    status: "active",
    mentorId: { not: null },
  };
  if (filter === "allocated_current" || filter === "available")
    whereClause.dueDate = { gte: new Date() };
  if (filter === "allocated_past") whereClause.dueDate = { lt: new Date() };

  let mentors = await prisma.mentor.findMany({
    where: {
      collegeId: college.id,
    },
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
        where: whereClause,
        select: {
          id: true,
          title: true,
          dueDate: true,
        },
      },
    },
  });

  mentors = mentors.map((mentor) => ({
    id: mentor.id,
    userId: mentor.user.id,
    name: mentor.user.name,
    email: mentor.user.email,
    jobs: mentor.jobs,
  }));

  if (filter === "available")
    mentors = mentors.filter((mentor) => mentor.jobs.length === 0);
  else mentors = mentors.filter((mentor) => mentor.jobs.length > 0);

  res.json(new ApiResponse(200, mentors, "all mentors fetched successfully"));
});

const mentorDetails = asyncHandler(async (req, res) => {
  const { filter } = req.query;
  const { mentorId } = req.params;
  if (!mentorId) throw new ApiError(403, "please provide mentor id");

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
  });
  if (!college) throw new ApiError(404, "no such college found");

  let whereClause = {
    collegeId: college.id,
    isApproved: true,
  };
  if (filter === "jobs_current") whereClause.dueDate = { gte: new Date() };
  if (filter === "jobs_past") whereClause.dueDate = { lt: new Date() };

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
  if (!mentor) throw new ApiError(404, "no such employee found");
  if (mentor.collegeId !== college.id)
    throw new ApiError(
      403,
      "you cant access mentor details of another college"
    );

  mentor = {
    name: mentor.user.name,
    ...mentor,
    email: mentor.user.email,
    userId: mentor.user.id,
  };
  mentor.collegeId = undefined;
  mentor.user = undefined;

  res.json(new ApiResponse(200, mentor, "mentor detail"));
});

const getAllCollabRequests = asyncHandler(async (req, res) => {
  let { status = "pending" } = req.query;
  if (
    status &&
    status !== "accepted" &&
    status !== "rejected" &&
    status !== "pending"
  )
    status = "pending";

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
  });
  if (!college) throw new ApiError(404, "no such college found");

  const collabRequests = await prisma.collab.findMany({
    where: {
      collegeId: college.id,
      status: status,
    },
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
  });

  res.json(new ApiResponse(200, collabRequests, "collab requests"));
});

const getCompanyDetails = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  if (!companyId) throw new ApiError(403, "please provide company id");

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
  if (!company) throw new ApiError(403, "no such company found");

  const formattedCompany = {
    id: company.id,
    name: company.name,
    address: company.address,
    email: company.email,
    contactNo: company.contactNo,
    collaboratedCount: company.collabs.length,
  };

  res.json(new ApiResponse(200, formattedCompany, "company details"));
});

const getAllJobRequests = asyncHandler(async (req, res) => {
  let { isApproved = "false" } = req.query;
  isApproved = isApproved === "true";

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
  });
  if (!college) throw new ApiError(404, "no such college found");

  let whereClause = {
    collegeId: college.id,
    isApproved: isApproved,
    status: "active",
  };
  if (!isApproved) whereClause.dueDate = { gte: new Date() };

  const jobRequests = await prisma.job.findMany({
    where: whereClause,
    select: {
      id: true,
      title: true,
      salary: true,
      dueDate: true,
      companyId: true,
      isApproved: true,
      createdAt: true,
      mentorId: true,
    },
  });

  res.json(new ApiResponse(200, jobRequests, "job requests"));
});

const getJobDetails = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  if (!jobId) throw new ApiError(403, "please provide job id");

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
  });
  if (!college) throw new ApiError(404, "no such college found");

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

  if (!job) throw new ApiError(404, "no such job found");
  if (job.collegeId !== college.id)
    throw new ApiError(403, "you cant see another college job details");

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

  res.json(new ApiResponse(200, formattedJob, "job detail"));
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
};
