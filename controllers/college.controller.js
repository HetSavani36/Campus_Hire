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
const prisma = new PrismaClient();

const createMentor = asyncHandler(async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) throw new ApiError(403, "please provide all details");

  const college = await prisma.college.findUnique({
    where: {
      email: req.user.email,
    },
    select:{
      id:true,
      name:true
    }
  });
  if(!college) throw new ApiError(404, "no such college found");

  const password = generatePassword(8);
  let mentor=null
  
  try {
    await prisma.$transaction(async (tx) => {
      const hashedPassword = await hashPassword(password);
      const user = await tx.user.create({
        data: {
          name: name,
          email: email,
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
    if (err.code === "P2002") throw new ApiError(409, "user/mentor already exists");
    throw new ApiError(500, "failed to create mentors");
  }

  await emailQueue.add(
    "mentor-credentials",
    {
      name: name,
      email: email,
      password: password,
      collegeName: college.name,
    },
    emailOptions
  );

  await redisConnection.incr(`college:${college.id}:mentors:version`)

  res.json(
    new ApiResponse( 201, mentor, "mentor created successfully" )
  );
});

const collabDecision = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { result } = req.body;
  if (!companyId || !result) throw new ApiError(403, "please provide all details");
  if ( !["1","0"].includes(result)) throw new ApiError(403, "provide proper result value");

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select:{
      id:true,
      name:true
    }
  });
  if (!college) throw new ApiError(404, "no such college found");

  const company = await prisma.company.findUnique({ 
      where: { id: companyId } ,
      select:{
        name:true,
        email:true
      }
    });
  if (!company) throw new ApiError(404, "no such company found");

  const nextStatus=(result==="1")?"accepted":"rejected"
  let occured=false

  await prisma.$transaction(async(tx)=>{  
    const collabRequest = await tx.collab.findUnique({
      where: {
        collegeId_companyId: {
          collegeId: college.id,
          companyId: companyId,
        },
      },
      select:{
        id:true,
        status:true
      }
    });
    if (!collabRequest) throw new ApiError(404, "no such collab request found");
  
    const currentStatus = collabRequest.status;
    if(!canCollabTransition(currentStatus,nextStatus)) return 

    const updated=await tx.collab.updateMany({
      where: { id: collabRequest.id,status:currentStatus },
      data: {
        status: nextStatus,
      },
    });

    if(updated.count===1) occured=true
  })

  if(occured){
    await emailQueue.add(
      "collab-decision",
      {
        companyName: company.name,
        collegeName: college.name,
        status: nextStatus,
        companyEmail:company.email
      },
      emailOptions
    );

    await redisConnection.incr(`college:${college.id}:collab:requests:version`);
  }

  res.json(
    new ApiResponse(200, nextStatus, `the collab request is ${nextStatus}`)
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
    select:{id:true}
  });
  if (!college) throw new ApiError(404, "no such college found");

  if (!user.mentor && !user.student) throw new ApiError(403, "you can only reset password of student/mentor");
  if ( (user.mentor && user.mentor.collegeId !== college.id) || (user.student && user.student.collegeId !== college.id) ) throw new ApiError(403,"you cant reset password of user outside your organization");
  
  const password = generatePassword(8);
  const hashedPassword = await hashPassword(password);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
    },
  });
  
  await tx.session.updateMany({
    where: { userId: user.id },
    data: { revokedAt: new Date() },
  });
  
  await emailQueue.add(
    "reset-password",
    {
      name: user.name,
      email: user.email,
      role: user.role,
      password:password
    },
    emailOptions
  );

  res.json(new ApiResponse(200, {}, "password reset successfully"));
});



const jobApprovalDecision = asyncHandler(async (req, res) => {
  
  const { jobId, result } = req.params;
  if (!jobId || !result) throw new ApiError(403, "please provide all details");
  if (!["1","0"].includes(result)) throw new ApiError(403, "please provide correct decision");

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select:{
      id:true,
      name:true
    }
  });
  if (!college) throw new ApiError(404, "no such college found");

  let nextStatus= result==="1"?"approved":"rejected"
  let transitionOccurred = false;
  let jobSnapshot;

  await prisma.$transaction(async(tx)=>{
    const job = await tx.job.findUnique({
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
    
    const currentStatus=job.isApproved?"approved":"pending"
    if(!canJobTransition(currentStatus,nextStatus)){
      if(currentStatus===nextStatus){
        jobSnapshot=job;
        return;
      }
      throw new ApiError(
        409,
        `Invalid job transition from ${currentStatus} to ${nextStatus}`
      );
    }
    else{
      if(nextStatus==="approved"){
        await tx.job.update({
          where: { id: job.id },
          data: { isApproved: true },
        });
      }
      else{
        await tx.jobSkill.deleteMany({
          where: { jobId: job.id },
        });
        await tx.application.deleteMany({
          where: { jobId: job.id },
        });
        await tx.job.delete({
          where: { id: job.id },
        });
      }
      transitionOccurred=true
      jobSnapshot=job
    }
  })

  if(transitionOccurred){
    await emailQueue.add(
      "job-decision",
      {
        companyName:jobSnapshot.company.name,
        collegeName:college.name,
        jobTitle:jobSnapshot.title,
        status:nextStatus,
        companyEmail:jobSnapshot.company.email,
      },
      emailOptions
    );

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
          emailOptions
        );
      }
    }

  };

  await redisConnection.incr(`college:${college.id}:mentors:version`);

  res.json(
    new ApiResponse(
      200,
      {status:nextStatus} ,
      `the job is ${nextStatus}`
    )
  );
});

const assignMentor = asyncHandler(async (req, res) => {
  const { mentorId } = req.body;
  const { jobId } = req.params;

  if (!mentorId || !jobId) throw new ApiError(403, "please provide all details");

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select: { id: true },
  });
  if (!college) throw new ApiError(404, "no such college found");

  const mentor = await prisma.mentor.findUnique({
    where: { id: mentorId },
    select: {
      id: true,
      collegeId: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  });
  if (!mentor) throw new ApiError(404, "no such mentor found");

  if (mentor.collegeId !== college.id) throw new ApiError(403, "this mentor does not belong to your college");

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      collegeId: true,
      dueDate: true,
      status: true,
      isApproved: true,
      title: true,
      company: {
        select: { name: true },
      },
    },
  });
  if (!job) throw new ApiError(404, "no such job found");
  if (college.id !== job.collegeId) throw new ApiError(403,"cant assign mentor to job outside your organization");
  if (job.status === "closed") throw new ApiError(403, "cant assign mentor to closed job");
  if (job.dueDate < new Date()) throw new ApiError(403, "cant assign mentor to expired job");
  
  let occured=false
  await prisma.$transaction(async(tx)=>{
    const updated=await tx.job.updateMany({
      where: { id: jobId,isApproved:true,mentorId:null },
      data: { mentorId },
    });
    if (updated.count === 1) occured = true;
  })
  
  if(occured){
    await emailQueue.add(
      "assign-mentor",
      {
        mentorName: mentor.user.name,
        jobTitle: job.title,
        companyName: job.company.name,
        mentorEmail: mentor.user.email,
      },
      emailOptions
    );
  }

  //mentors
  await redisConnection.incr(`college:${college.id}:mentors:version`);
  //menotr details
  await redisConnection.incr(`mentor:${mentor.id}:version`);

  res.json(new ApiResponse(200, {mentorAssigned:occured,mentor}, occured?"mentor assigned successfully":"mentor already assigned"));
});


const getMentorsList = asyncHandler(async (req, res) => {
  const { filter = "all" } = req.query;
  const { page, limit, skip } = getPagination(req.query);

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select: { id: true },
  });
  if (!college) throw new ApiError(404, "no such college found");

  const version=( await redisConnection.get(`college:${college.id}:mentors:version`) ) || 1

  const cacheKey=`college:${college.id}:mentors:v${version}:filter:${filter}:page:${page}:limit:${limit}`
  const cached=await redisConnection.get(cacheKey)
  if(cached){
    return res.json(
      new ApiResponse(
        200,
        JSON.parse(cached),
        "mentors fetched successfully(cached)",
      ),
    );
  }

  const now = new Date();

  // Common job condition used in filters
  const activeJobCondition = {
    isApproved: true,
    status: "active",
    mentorId: { not: null },
  };

  // Build mentor WHERE clause (THIS IS THE KEY FIX)
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

  const [mentors, totalMentors] = await prisma.$transaction([
    prisma.mentor.findMany({
      where: mentorWhere,
      skip,
      take: limit,
      orderBy: { id:"desc" },
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

  await redisConnection.setex(cacheKey,60,JSON.stringify(responsePayLoad))

  res.json(
    new ApiResponse(
      200,
      responsePayLoad,
      "mentors fetched successfully"
    )
  );
});


const mentorDetails = asyncHandler(async (req, res) => {
  const { filter } = req.query;
  const { mentorId } = req.params;
  if (!mentorId) throw new ApiError(403, "please provide mentor id");

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select:{id:true}
  });
  if (!college) throw new ApiError(404, "no such college found");

  const version = (await redisConnection.get(`mentor:${mentorId}:version`)) || 1;

  const cacheKey = `mentor:${mentorId}:v${version}:filter:${filter}`;
  const cached = await redisConnection.get(cacheKey);
  if (cached) {
    return res.json(
      new ApiResponse(
        200,
        JSON.parse(cached),
        "mentor detail (cached)",
      ),
    );
  }

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

  await redisConnection.setex(cacheKey,30,JSON.stringify(mentor))

  res.json(new ApiResponse(200, mentor, "mentor detail"));
});

const getAllCollabRequests = asyncHandler(async (req, res) => {
  const allowedStatus=["accepted","rejected","pending"]
  let { status = "pending" } = req.query;
  if(!allowedStatus.includes(status)) status="pending"

  const { page, limit ,skip } = getPagination(req.query);

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select:{id:true}
  });
  if (!college) throw new ApiError(404, "no such college found");

    const version = (await redisConnection.get(`college:${college.id}:collab:requests:version`)) || 1;

    const cacheKey = `college:${college.id}:collab:requests:v${version}:status:${status}:page:${page}:limit:${limit}`;
    const cached = await redisConnection.get(cacheKey);
    if (cached) {
      return res.json(
        new ApiResponse(
          200,
          JSON.parse(cached),
          "collab requests(cached)",
        ),
      );
    }

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


  collabRequests=collabRequests.map((request)=>({
    ...request,
    status:status
  }))

  const responsePayLoad={
    collabRequests,
    pagination: {
      page,
      limit,
      totalRequests,
      totalPages: Math.ceil(totalRequests / limit),
      hasPrevPage: page > 1,
      hasNextPage: skip+collabRequests.length < totalRequests,
    },
  }

  await redisConnection.setex(cacheKey,60,JSON.stringify(responsePayLoad))

  res.json(
    new ApiResponse(
      200,
      responsePayLoad,
      "collab requests"
    )
  );
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
  let { filter = "PENDING" } = req.query;
  const { page, limit, skip } = getPagination(req.query);

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select: { id: true },
  });
  if (!college) throw new ApiError(404, "no such college found");

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const whereClause = {
    collegeId: college.id,
    status: "active",
  };

  if (filter === "PENDING") {
    whereClause.isApproved = false;
    whereClause.dueDate = { gte: startOfToday };
  }

  else if (filter === "CURRENT") {
    whereClause.isApproved = true;
    whereClause.dueDate = { gte: startOfToday };
    whereClause.mentor = { isNot: null };
  }

  else if (filter === "PAST") {
    whereClause.isApproved = true;
    whereClause.dueDate = { lt: startOfToday };
    whereClause.mentor = { isNot: null };
  }

  else if (filter === "ASSIGN_MENTOR") {
    whereClause.isApproved = true;
    whereClause.dueDate = { gte: startOfToday };
    whereClause.mentor = { is: null };
  }
  else {
    throw new ApiError(400, "invalid filter");
  }

  let [jobRequests,totalRequests]=await prisma.$transaction([
    prisma.job.findMany({
      where: whereClause,
      skip:skip,
      take:limit,
      orderBy:{createdAt:"desc"},
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
      where:whereClause
    })
  ])


  jobRequests = jobRequests.map((job) => ({
    id: job.id,
    title: job.title,
    salary: job.salary,
    deadline: job.dueDate, // 🔥 rename here
    companyName: job.company.name,
    mentorName: job.mentor?.user?.name ?? null,
    status:filter
  }));


  res.json(
    new ApiResponse(
      200,
      {
        jobRequests,
        pagination: {
          page,
          limit,
          totalRequests,
          totalPages: Math.ceil(totalRequests / limit),
          hasPrevPage: page > 1,
          hasNextPage: skip+jobRequests.length < totalRequests,
        },
      },
      "job requests"
    )
  );
});


const getJobDetails = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  if (!jobId) throw new ApiError(403, "please provide job id");

  const college = await prisma.college.findUnique({
    where: { email: req.user.email },
    select:{id:true}
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
