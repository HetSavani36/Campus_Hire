import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";

import { PrismaClient } from "@prisma/client";
import { generatePassword, hashPassword } from "../utils/password.util.js";
import { sendEmail } from "../utils/email.js";
const prisma=new PrismaClient()

const createEmployee=asyncHandler(async(req,res)=>{
    const {name,email}=req.body
    if(!name || !email) throw new ApiError(403,"please provide all details")

    const exists=await prisma.user.findUnique({
        where:{
            email:email
        }
    })
    if(exists) throw new ApiError(403,"user with this email already exists")

    const company = await prisma.company.findUnique({
      where: {
        email: req.user.email,
      },
    });
    if(!company) throw new ApiError(404,"no college found where this user works")

    const password=generatePassword(8)
    await sendEmail("connectcampus51@gmail.com",email,password,password)
    console.log(password);
    
    const hashedPassword=await hashPassword(password)
    

    const result=await prisma.$transaction(async(tx)=>{

        const user=await prisma.user.create({
            data:{
                name:name,
                email:email,
                password:hashedPassword,
                role:"employee"
            }
        })
    
        const employee = await prisma.employee.create({
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

        return {user,employee}
    })


    res.json(
      new ApiResponse(201, { employee:result.employee }, "employee created successfully")
    );
})


const collabWithCollege=asyncHandler(async(req,res)=>{
    const {collegeId}=req.params
    if(!collegeId) throw new ApiError(403,"please provide college id")
    
    const company=await prisma.company.findUnique({
      where:{email:req.user.email}
    })
    if(!company) throw new ApiError(404,"no such company found")

    const college = await prisma.college.findUnique({
      where: { id: collegeId },
    });
    if (!college) throw new ApiError(404, "no such college found");

    const exists=await prisma.collab.findUnique({
      where:{
        collegeId_companyId:{
          collegeId:collegeId,
          companyId:company.id
        }
      }
    })
    if(exists && exists.status==="accepted") throw new ApiError(403,"request already accepted")
    if(exists && exists.status==="pending") throw new ApiError(403,"request already exists")

    const collabRequest=await prisma.collab.create({
      data:{
        collegeId:collegeId,
        companyId:company.id
      }
    })

    res.json(
      new ApiResponse(201,collabRequest,"collab request sent successfully")
    )
})


const resetPassword = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      password: true,
      employee: {
        select:{
          companyId:true
        }
      },
    },
  });
  if (!user) throw new ApiError(404, "no such user found");

  const company = await prisma.company.findUnique({
    where: { email: req.user.email },
  });
  if (!company) throw new ApiError(404, "no such company found");

  if (!user.employee) throw new ApiError(403, "you can only reset password of employee");
  if (user.employee.companyId !== company.id) throw new ApiError(403,"you cant reset password of user outside your organization");
  
  const password = generatePassword(8);
  const hashedPassword = await hashPassword(password);

  await sendEmail("connectcampus51@gmail.com", user.email, password, password);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
    },
  });

  res.json(new ApiResponse(200, {}, "password reset successfully"));
});


const addSkill=asyncHandler(async(req,res)=>{
  const {name} = req.body
  if(!name) throw new ApiError(403,"please provide skill name")

  const exists=await prisma.skill.findUnique({
    where:{name:name.toUpperCase()}
  })
  if(exists) return res.json(new ApiResponse(201, exists, "skill already exists"));

  const skill=await prisma.skill.create({
    data:{
      name:name.toUpperCase()
    }
  })

  res.json(
    new ApiResponse(201,skill,"new skill added")
  )
})


const postJob = asyncHandler(async (req, res) => {
  const { title, salary, tenure, address, dueDate } = req.body;
  let { skills, collegeIds } = req.body;

  if (!title || !Array.isArray(collegeIds) || collegeIds.length === 0)
    throw new ApiError(403, "please provide title and at least one college");

  if (!skills || skills.length === 0)
    throw new ApiError(403, "please provide at least one skill");

  skills = [...new Set(skills)];
  collegeIds = [...new Set(collegeIds)];

  const company = await prisma.company.findUnique({
    where: { email: req.user.email },
  });
  if (!company) throw new ApiError(404, "no such company found");

  // Validate colleges
  const colleges = await prisma.college.findMany({
    where: { id: { in: collegeIds } },
    select: { id: true },
  });
  if (colleges.length !== collegeIds.length) throw new ApiError(403, "one or more college IDs are invalid");

  // Validate skills
  const skillsObtained = await prisma.skill.findMany({
    where: { id: { in: skills } },
  });
  if (skillsObtained.length !== skills.length) throw new ApiError(403, "one or more skill IDs are invalid");

  // Validate collaborations
  const collabs = await prisma.collab.findMany({
    where: {
      companyId: company.id,
      collegeId: { in: collegeIds },
    },
  });

  const collabMap = new Map();
  collabs.forEach((c) => collabMap.set(c.collegeId, c));

  for (let collegeId of collegeIds) {
    const c = collabMap.get(collegeId);

    if (!c)
      throw new ApiError(
        403,
        `You have not collaborated with college ${collegeId}`
      );
    if (c.status === "rejected")
      throw new ApiError(
        403,
        `Your collaboration with college ${collegeId} is rejected`
      );
    if (c.status === "pending")
      throw new ApiError(
        403,
        `Your collaboration request with ${collegeId} is pending`
      );
  }

  // Final due date
  let finalDueDate = new Date();
  finalDueDate.setDate(finalDueDate.getDate() + 10);
  if (dueDate) finalDueDate = new Date(dueDate);

  // --------------------------
  // 🔥 RUN EVERYTHING IN A TRANSACTION
  // --------------------------
  const createdJobs = await prisma.$transaction(async (tx) => {
    const jobResults = [];

    for (let collegeId of collegeIds) {
      // 1. Check duplicates inside transaction
      const exists = await tx.job.findFirst({
        where: {
          title,
          salary: salary ? Number(salary) : null,
          tenure,
          dueDate: dueDate ? new Date(dueDate) : null,
          companyId: company.id,
          collegeId,
        },
      });

      if (exists && !exists.isApproved)
        throw new ApiError(
          403,
          `Job for college ${collegeId} already exists and is under approval`
        );

      if (exists && exists.isApproved)
        throw new ApiError(
          403,
          `Job for college ${collegeId} is already approved`
        );

      // 2. Create job
      const job = await tx.job.create({
        data: {
          title,
          salary: salary ? Number(salary) : null,
          tenure: tenure ?? null,
          address: address ?? company.address,
          dueDate: finalDueDate,
          collegeId,
          companyId: company.id,
        },
      });

      // 3. Create job skills
      const skillData = skills.map((skillId) => ({
        jobId: job.id,
        skillId,
      }));

      await tx.jobSkill.createMany({
        data: skillData,
        skipDuplicates: true,
      });

      jobResults.push(job);
    }

    return jobResults;
  });

  res.json(new ApiResponse(200, createdJobs, "Jobs posted successfully"));
});



const makeStudentApplicationDecision=asyncHandler(async(req,res)=>{
    const {applicationId}=req.params
    const {result}=req.params
    if(!applicationId || !result) throw new ApiError(403,"please provide studentId and your decision")
    if(result!=="1" && result!=="0") throw new ApiError(403,"please provide proper decision in either 0 or 1")

    const status=(result==="1")?"shortlisted":"rejected"

    const application=await prisma.application.findUnique({
      where:{id:applicationId}
    })
    if(!application) throw new ApiError(404,"no such application found")

    if(application.status==="hired") throw new ApiError(403,"the student is already hired")
    if(application.status==="rejected") throw new ApiError(403,"the student is already rejected")
    if(application.status==="shortlisted") throw new ApiError(403,"the student is already shortlisted")

    const applicationAfterDecision=await prisma.application.update({
      where:{id:application.id},
      data:{
        status:status
      }
    })
    
    res.json(
      new ApiResponse(200,applicationAfterDecision,`the student has been ${status}`)
    )
})


const getEmployeesList=asyncHandler(async(req,res)=>{

    const {search}=req.query

    const company=await prisma.company.findUnique({
      where:{email:req.user.email}
    })
    if(!company) throw new ApiError(404,"no such company found")

    const employees= await prisma.employee.findMany({
      where:{
        companyId:company.id,
        ...(search && {
          user:{
            is:{
              OR:[
                {name:{contains:search , mode:"insensitive"} },
                {email: {contains:search , mode:"insensitive"} },
                {id: {contains:search , mode:"insensitive"} },
              ]
            }
          }
        })
      },
      select:{
        id:true,
        user:{
          select:{
            id:true,
            name:true,
            email:true,
            createdAt:true,
          }
        }
      }
    })

    res.json(
      new ApiResponse(200,employees,"employees list")
    );
})

const getEmployeeDetail=asyncHandler(async(req,res)=>{
    const { employeeId } = req.params;

    const company = await prisma.company.findUnique({
      where: { email: req.user.email },
    });
    if (!company) throw new ApiError(404, "no such company found");

    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        companyId:true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            createdAt: true,
          },
        },
        interviews:{
          select:{
            id:true,
            date:true,
            time:true,
            address:true,
            selected:true,
            student:{
              select:{
                branch:true,
                college:{
                  select:{
                    name:true,
                    email:true,
                    address:true
                  }
                },
                year:true,
                rollNo:true
              }
            },
          }
        },
      },
    });
    if (!employee) throw new ApiError(404, "no such employee found");
    if (employee.companyId!==company.id) throw new ApiError(403, "you cant see employee of another company");
    
    res.json(new ApiResponse(200, employee,"employee details"));
})


const getAllColleges=asyncHandler(async(req,res)=>{  //acceprted,rejected,not applied,applied
    let {filter="all"}=req.query

    const company = await prisma.company.findUnique({
      where: { email: req.user.email },
    });
    if (!company) throw new ApiError(404, "no such company found");

    let whereClause={ 
      companyId: company.id, 
    }
    if(filter === "pending" ) whereClause.status="pending"
    if(filter ==="rejected" ) whereClause.status = "rejected";
    if (filter === "collaborated" ) whereClause.status = "accepted";

    const collegeProjector = {
      id: true,
      name: true,
      address: true,
      email: true,
    };    

    let colleges=[]
    if(filter==="all"){
        colleges = await prisma.college.findMany({
          select: {
            ...collegeProjector,
            collabs:{
              where:{companyId:company.id},
              select:{status:true}
            }
          },
        });
        
        colleges = colleges.map((college) => ({
          id: college.id,
          name: college.name,
          address: college.address,
          email: college.email,
          status: college.collabs.length>0
            ? college.collabs[0].status === "accepted"
              ? "collaborated"
              : college.collabs[0].status
            : "not applied",
        }));
    }
    else{
      const collabs = await prisma.collab.findMany({
        where: whereClause,
        select: {
          status:true,
          college: {
            select: collegeProjector,
          },
        },
      });
      colleges=collabs.map((college)=>college.college)

      if(filter==="not_applied"){
        const collegesId=colleges.map((college)=>college.id)
        colleges=await prisma.college.findMany({
          where:{
            id:{notIn:collegesId}
          },
          select:collegeProjector
        })

        colleges=colleges.map((college)=>({
          ...college,
          status:"not applied"
        }))
      }
    }
  
    res.json(
      new ApiResponse(200,colleges,"colleges list")
    )
})


const getCollegeDetails=async(req,res)=>{
    const {collegeId}=req.params

    let college=await prisma.college.findUnique({
      where:{id:collegeId},
      select:{
        id:true,
        name:true,
        address:true,
        email:true,
        phone:true,
        collabs:{
          where:{
            status:"accepted"
          }
        }
      }
    })
    if(!college) throw new ApiError(404,"no such college found")

    college={
      ...college,
      collaboratedCount:college.collabs.length
    }
    college.collabs=undefined

    res.json(
      new ApiResponse(200,college,"college details")
    )
}


const getAllJobs = asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({
      where: { email: req.user.email },
    });
    if (!company) throw new ApiError(404, "no such company found");

    let { filter = "current" } = req.query;

    const whereClause = {
      companyId: company.id,
    };

    // ---- TIME-BASED FILTERS ----
    if (filter === "current") whereClause.dueDate = { gte: new Date() };
    if (filter === "past") whereClause.dueDate = { lt: new Date() };
    // ---- APPROVAL-BASED FILTERS ----
    if (filter === "accepted") whereClause.isApproved = true;
    if (filter === "pending") whereClause.isApproved = false;

    const jobs = await prisma.job.findMany({
      where: whereClause,
      select:{
        id:true,
        title:true,
        salary:true,
        dueDate:true,
        isApproved:true,
      }
    });

    res.json(new ApiResponse(200, jobs, "all jobs"));
});


const getAllSkills=asyncHandler(async(req,res)=>{
    const {search,sortBy="name",sortOrder="desc"}=req.query
    const skills=await prisma.skill.findMany({
      where:{
        name:{contains:search,mode:"insensitive"},
      },
      orderBy:{
        [sortBy]:sortOrder
      }
    })

    res.json(
      new ApiResponse(200,skills,"all skills")
    )
})


const getJobDetails=asyncHandler(async(req,res)=>{
    const {jobId}=req.params
    if(!jobId) throw new ApiError(403,"please provide job id")

    const company = await prisma.company.findUnique({
      where: { email: req.user.email },
    });
    if (!company) throw new ApiError(404, "no such company found");

    const job = await prisma.job.findUnique({
      where: { id:jobId },
      select:{
        id:true,
        title:true,
        salary:true,
        tenure:true,
        address:true,
        status:true,
        dueDate:true,
        companyId:true,
        isApproved:true,
        createdAt:true,
        college:{
          select:{
              id:true,
              name:true,
              address:true,
              email:true,
              phone:true
          } 
        },
        mentor:{
          select:{
              id:true,
              user:{
                select:{
                  id:true,
                  name:true,
                  email:true
                }
              }
          }
        },
        applications:{
            select:{
              id:true,
              studentId:true,
              status:true
            }
        }
      }
    });
    if (!job) throw new ApiError(404, "no such job found");
    if(job.companyId!==company.id) throw new ApiError(403,"job not belongs to your company")

    const shortlistedCandidates = job.applications.filter((application) => application.status === "shortlisted");
    const rejectedCandidates = job.applications.filter((application) => application.status === "rejected");
    const hiredCandidates = job.applications.filter((application) => application.status === "hired");
    const pendingCandidates = job.applications.filter((application) => application.status === "pending");

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
      applicationCount.hired+
      applicationCount.pending;
    
    res.json(
      new ApiResponse(200,{...job,applicationCount},"job details")
    )

})

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
};