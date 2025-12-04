import { asyncHandler } from "../utils/asyncHandler.js";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import { PrismaClient } from "@prisma/client";
import { generatePassword, hashPassword } from "../utils/password.util.js";
import { sendEmail } from "../utils/email.js";
const prisma=new PrismaClient()

const createMentor=asyncHandler(async(req,res)=>{
    const {name,email}=req.body
    if(!name || !email) throw new ApiError(403,"please provide all details")

    const exists=await prisma.user.findUnique({
        where:{
            email:email
        }
    })
    if(exists) throw new ApiError(403,"user with this email already exists")

    const college=await prisma.college.findUnique({
        where:{
            email:req.user.email
        }
    })
    if(!college) throw new ApiError(404,"no college found where this user works")

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
                role:"mentor"
            }
        })
    
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
        return {user,mentor}
    })


    res.json(
        new ApiResponse(201,{mentor:result.mentor},"mentor created successfully")
    )
})

const collabDecision=asyncHandler(async(req,res)=>{
    const { companyId } = req.params
    const {result}=req.body
    if(!companyId || !result) throw new ApiError(403,"please provide all details")
    if(result!=="0" && result!=="1") throw new ApiError(403,"provide proper result value")

    const college=await prisma.college.findUnique({where:{email:req.user.email}})
    if(!college) throw new ApiError(404,"no such college found")

    const company=await prisma.company.findUnique({where:{id:companyId}})
    if(!company) throw new ApiError(404,"no such company found")

    const collabRequest= await prisma.collab.findUnique({
      where: {
        collegeId_companyId: {
          collegeId: college.id,
          companyId: companyId,
        },
      },
    });
    if(!collabRequest) throw new ApiError(404,"no such collab request found")

    if(collabRequest.status==="accepted") throw new ApiError(403,"collab request already accepted")

    const status=result==="1"?"accepted":"rejected"
    
    if(result==="1"){
      await prisma.collab.update({
        where:{id:collabRequest.id},
        data:{
          status:"accepted"
        }
      })
    }
    else{
        await prisma.collab.delete({
          where:{id:collabRequest.id}
        })
    }

    res.json(
      new ApiResponse(200,{status:status},`the collab request is ${status}`)
    )
})

const resetPassword=asyncHandler(async(req,res)=>{
    const {userId}=req.params
    const user=await prisma.user.findUnique({
      where:{id:userId},
      select:{
        id:true,
        email:true,
        password:true,
        mentor:{
          select:{
            collegeId:true
          }
        },
        student:{
          select:{
            collegeId:true
          }
        }
      }
    })
    if(!user) throw new ApiError(404,"no such user found")

    const college=await prisma.college.findUnique({
      where:{email:req.user.email}
    })
    if(!college) throw new ApiError(404,"no such college found")
    
    if(!user.mentor && !user.student) throw new ApiError(403,"you can only reset password of student/mentor")
    if(user.mentor && user.mentor.collegeId!==college.id) throw new ApiError(403,"you cant reset password of user outside your organization")
    if(user.student && user.student.collegeId!==college.id) throw new ApiError(403,"you cant reset password of user outside your organization")

    const password = generatePassword(8)
    const hashedPassword=await hashPassword(password)

    await sendEmail("connectcampus51@gmail.com", user.email, password, password);
    
    await prisma.user.update({
      where:{id:user.id},
      data:{
        password:hashedPassword
      }
    })

    res.json(
      new ApiResponse(200,{},"password reset successfully")
    )
})


const jobApprovalDecision=asyncHandler(async(req,res)=>{
    const {jobId,result}=req.params
    if(!jobId || !result) throw new ApiError(403,"please provide all details")
    if(result!=="1" && result!=="0") throw new ApiError(403,"please provide correct decision")
  
    const college=await prisma.college.findUnique({
      where:{email:req.user.email}
    })
    if(!college) throw new ApiError(404,"no such college found")
      
    const job=await prisma.job.findUnique({
      where:{id:jobId}
    })
    if(!job) throw new ApiError(404,"no such job found")

    if(job.collegeId !== college.id) throw new ApiError(403,"cant make decision for job request for another colleges")
    if(job.dueDate<new Date()) throw new ApiError(403,"job expired")
    if (job.isApproved) throw new ApiError(403, "job request already approved");
    
    const approval=(result==="1")?true:false
    if(approval){
      await prisma.job.update({
        where:{id:job.id},
        data:{isApproved:true}
      })
    }
    else{
      await prisma.job.delete({
        where:{id:job.id}
      })
    }

    res.json(
      new ApiResponse(200,{approval:approval},`the job is ${approval?"approved":"rejected"}`)
    )
})

const assignMentor=asyncHandler(async(req,res)=>{
  const {mentorId}=req.body
  const {jobId}=req.params
  if(!mentorId || !jobId) throw new ApiError(403,"please provide all details")

  const college=await prisma.college.findUnique({
    where:{email:req.user.email}
  })
  if(!college) throw new ApiError(404,"no such college found")

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
  });
  if (!mentor) throw new ApiError(404, "no such mentor found");
  
  if (mentor.collegeId !== college.id) throw new ApiError(403, "this mentor does not belong to your college");

  const job=await prisma.job.findUnique({
    where:{id:jobId}
  })
  if (!job) throw new ApiError(404, "no such job found");
  if(college.id!==job.collegeId) throw new ApiError(403,"cant assign mentor to job outside your organization")
  if(job.status==="closed") throw new ApiError(403,"cant assign mentor to closed job")
  if(job.dueDate<new Date()) throw new ApiError(403,"cant assign mentor to expired job")
  if(!job.isApproved) throw new ApiError(403,"cant assign mentor to un-approved job")
  
  const updatedJob=await prisma.job.update({
    where:{id:jobId},
    data:{
      mentorId:mentorId
    }
  })

  res.json(
    new ApiResponse(200,{mentor:mentor},"mentor assigned/updated successfully")
  )
})


const getMentorsList=asyncHandler(async(req,res)=>{
    const {search}=req.query

    const college=await prisma.college.findUnique({
      where:{email:req.user.email}
    })
    if(!college) throw new ApiError(404,"no such college found")

    let userQuery = {
      ...(search && {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ]
      }),
    };

    const allMentors=await prisma.mentor.findMany({
      where:{
        collegeId:college.id,
        user:userQuery
      },
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
    })

    const onGoingJobs = await prisma.job.findMany({
      where: {
        collegeId: college.id,
        dueDate: { gte: new Date() },
        isApproved:true,
        mentorId:{not:null}
      },
      select: {
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
      },
    });

    const allocatedMentors = onGoingJobs.map((job) => {
      return {
        id: job.mentor.id,
        user: job.mentor.user,
      };
    });

    const pastJobs = await prisma.job.findMany({
      where: {
        collegeId: college.id,
        dueDate: { lt: new Date() },
        isApproved: true,
        mentorId: { not: null },
      },
      select: {
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
      },
    });

    const pastAllocatedMentors = pastJobs.map((job) => {
      return {
        id: job.mentor.id,
        user: job.mentor.user,
      };
    });


    res.json(
      new ApiResponse(
        200,
        {
          allMentors: allMentors,
          allocatedMentors: allocatedMentors,
          pastAllocatedMentors: pastAllocatedMentors,
        },
        "all mentors fetched successfully"
      )
    );
})


const mentorDetails=asyncHandler(async(req,res)=>{
    const {mentorId}=req.params
    if(!mentorId) throw new ApiError(403,"please provide mentor id")
    
    const mentor=await prisma.mentor.findUnique({
      where:{id:mentorId}
    })  
    if(!mentor) throw new ApiError(404,"no such employee found")
    
    
})


export {
  createMentor,
  collabDecision,
  resetPassword,
  jobApprovalDecision,
  assignMentor,
  getMentorsList,
  mentorDetails,
};