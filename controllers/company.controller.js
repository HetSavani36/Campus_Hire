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
    const {collegeId}=req.body
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
  const { userId } = req.body;
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

export { createEmployee, collabWithCollege ,resetPassword, postJob, addSkill};