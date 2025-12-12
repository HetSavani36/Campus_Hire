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


const postJob=asyncHandler(async(req,res)=>{
  const {title,salary,tenure,address,dueDate,collegeId}=req.body
  let {skills}=req.body

  if(!title || !collegeId || !skills || skills.length === 0) throw new ApiError(403,"please provide all details")
  skills=[...new Set(skills)]

  const company=await prisma.company.findUnique({
    where:{email:req.user.email}
  })
  if(!company) throw new ApiError(404,"no such company found")

  const college = await prisma.college.findUnique({
    where: { id:collegeId },
  });
  if (!college) throw new ApiError(404, "no such college found");

  const skillsObtained=await prisma.skill.findMany({
      where:{
        id:{
          in:skills
        }
      }
  })
  if(skillsObtained.length!==skills.length) throw new ApiError(403,"please provide valid skill ids")

  const collab=await prisma.collab.findUnique({
    where:{
      collegeId_companyId:{
        collegeId:collegeId,
        companyId:company.id
      }
    }
  })
  if(!collab) throw new ApiError(403,"you have not collaberated with this college")
  if(collab.status==="rejected") throw new ApiError(403,"you have not collaberated with this college")
  if(collab.status==="pending") throw new ApiError(403,"your collaberation request is pending.wait till it is accepted")

  let date=new Date()
  date.setDate(date.getDate()+10)
  if(dueDate) date=new Date(dueDate)

  const exists = await prisma.job.findFirst({
    where: {
      title: title,
      salary: salary ? Number(salary) : null,
      tenure:tenure,
      dueDate:dueDate,
      companyId:company.id,
      collegeId:collegeId
    },
  });
  if(exists && !exists.isApproved) throw new ApiError(403,"this job already exists and is under approval")
  if(exists && exists.isApproved) throw new ApiError(403,"this job is already approved")
  
  const job=await prisma.job.create({
    data:{
      title:title,
      salary:salary?Number(salary):null,
      tenure:tenure??null,
      address:address??company.address,
      dueDate:date,
      collegeId:collegeId,
      companyId:company.id 
    }
  })

  const skillData=skills.map((skillId)=>({
      jobId:job.id,
      skillId:skillId
  }))

  await prisma.jobSkill.createMany({
    data:skillData,
    skipDuplicates:true
  })

  res.json(
    new ApiResponse(200,job,"new job posted")
  )
})


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


const getAllColleges=asyncHandler(async(req,res)=>{  //acceprted,rejected,pending,not applied
    let {filter="all"}=req.query

    const company = await prisma.company.findUnique({
      where: { email: req.user.email },
    });
    if (!company) throw new ApiError(404, "no such company found");

    let colleges=[]

    const companyProjector={
        status:true,
        college:{
          select:{
            id:true,
            name:true,
            address:true,
            email:true,
            phone:true,
            _count:{
              select:{
                collabs:{where:{status:"accepted"}}
              }
            }
          }
        }
    }

    const companyFormatter = ()=>{
      colleges=colleges.map((college) => ({
        id: college.college.id,
        name: college.college.name,
        address: college.college.address,
        email: college.college.email,
        phone: college.college.phone,
        status: college.status ? college.status : "not applied",
        collaboratedCount: college.college._count.collabs,
      }));
      return colleges
    } 
    
    if(filter==="all"){
        colleges = await prisma.college.findMany({
          select: {
            id: true,
            name: true,
            address: true,
            email: true,
            phone: true,
            collabs:{
              select:{
                status:true
              }
            },
            _count:{
              select:{
                collabs:{where:{status:"accepted"}}
              }
            }
          },
        });

        colleges=colleges.map((college)=>({
          id:college.id,
          name:college.name,
          address:college.address,
          email:college.email,
          phone:college.phone,
          status:college.collabs.length>0? college.collabs[0].status:"not applied",
          collaboratedCount:college._count.collabs
        }))
    }
    else if(filter==="collaborated"){
        colleges = await prisma.collab.findMany({
          where: { companyId: company.id, status: "accepted" },
          select: companyProjector
        });
        colleges=companyFormatter(colleges)
    }
    else if(filter==="not applied"){ //not involved with any collab
      const collabColleges=await prisma.collab.findMany({where:{companyId:company.id},select:{collegeId:true}});
      const collabCollegesId=collabColleges.map(collab=>collab.collegeId)

      colleges = await prisma.college.findMany({
        where: {
          id: { notIn: collabCollegesId },
        },
        select: {
          id: true,
          name: true,
          address: true,
          email: true,
          phone: true,
          collabs: {
            select: {
              status: true,
            },
          },
          _count: {
            select: {
              collabs: { where: { status: "accepted" } },
            },
          },
        },
      });

      colleges = colleges.map((college) => ({
        id: college.id,
        name: college.name,
        address: college.address,
        email: college.email,
        phone: college.phone,
        status:
          college.collabs.length > 0
            ? college.collabs[0].status
            : "not applied",
        collaboratedCount: college._count.collabs,
      }));
    }
    else if(filter==="rejected"){
        colleges = await prisma.collab.findMany({
          where: { companyId: company.id, status: "rejected" },
          select: companyProjector,
        });
        colleges = companyFormatter(colleges);
    }
    else if(filter==="pending"){
        colleges = await prisma.collab.findMany({
          where: { companyId: company.id, status: "pending" },
          select: companyProjector,
        });
        colleges = companyFormatter(colleges);
    }
    res.json(
      new ApiResponse(200,colleges,"colleges list")
    )
})

const getAllJobs = asyncHandler(async (req, res) => {
    const company = await prisma.company.findUnique({
      where: { email: req.user.email },
    });
    if (!company) throw new ApiError(404, "no such company found");

    let { filter = "all" } = req.query;

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
        tenure:true,
        status:true,
        address:true,
        dueDate:true,
        isApproved:true,
        createdAt:true
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
  getAllJobs
};