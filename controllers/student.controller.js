import { PrismaClient } from "@prisma/client"
import { asyncHandler } from "../utils/asyncHandler.js"
import ApiError from "../utils/ApiError.js"
import ApiResponse from "../utils/ApiResponse.js"
import { generatePassword, hashPassword } from "../utils/password.util.js";
import { parseCSVBuffer } from "../utils/csv_parsing.util.js";
import { sendEmail } from "../utils/email.js";
const prisma=new PrismaClient()

const uploadBulkStudents=asyncHandler(async(req,res)=>{
    if (!req.file) throw new ApiError(400, "CSV file is required");

    // 1. Parse CSV → JSON array
    console.log(req.file);
    
    const rows = await parseCSVBuffer(req.file.buffer);
    const college=await prisma.college.findUnique({
        where:{email:req.user.email}
    })
    if(!college) throw new ApiError(404,"no such college found")

    const createdStudents = []

    await prisma.$transaction(async(tx)=>{
        for (const row in rows) {
            if (!Object.hasOwn(rows, row)) continue;
            
            const element = rows[row];
            if(!element.email || !element.name) throw new ApiError(403,"providel all details")
            const exists=await tx.user.findUnique({
                where:{email:element.email}
            })
            if(exists) throw new ApiError(403, `account for ${element.email} already exists`)
            
            const password = generatePassword(8)
            const hashedPassword=await hashPassword(password)
    
            const user=await tx.user.create({
                data:{
                    name:element.name,
                    email:element.email,
                    password:hashedPassword,
                    role:"student",
                    metadata:{
                        collegeId:college.id,
                        rollNo:element.rollNo
                    }
                }
            })
            
            user.password = undefined;
            user.refreshToken=undefined
            
            createdStudents.push({user,password})
        }   
    })
    
    for (const s of createdStudents) {
        await sendEmail("connectcampus51@gmail.com",s.user.email,s.password,s.password)
    }

    res.json(
        new ApiResponse(201,createdStudents,"credentials for students created successfully")
    )
})


const createProfile=asyncHandler(async(req,res)=>{
    const { year, aboutMe, branch } = req.body;
    if (!year || !branch) throw new ApiError(403, "please select year & branch");
    if(year!=="1" && year!=="2" && year!=="3" && year!=="4") throw new ApiError(403,"please select valid year")

    const user=await prisma.user.findUnique({
        where:{id:req.user.id},
    })
    if(!user) throw new ApiError(404,"no such user found")

    if(user.hasCompletedProfile) throw new ApiError(403,"user already completed profile")
    if(!user.metadata) throw new ApiError(403,"no user data found")
    if(!user.metadata.collegeId || !user.metadata.rollNo) throw new ApiError(403,"collegeId or rollNo is missing in metadata")

    const [student,updatedUser]=await prisma.$transaction([
        prisma.student.create({
            data:{
                userId:user.id,
                collegeId:user.metadata.collegeId,
                year:Number(year),
                branch:branch,
                rollNo:user.metadata.rollNo,
                resume:null,
                aboutMe:aboutMe??null
            }
        }),
        prisma.user.update({
            where:{id:user.id},
            data:{
                hasCompletedProfile:true
            },
            select:{
                id:true,
                name:true,
                email:true,
                hasCompletedProfile:true,
                student:{
                    select:{
                        year:true,
                        branch:true,
                        rollNo:true,
                        resume:true,
                        aboutMe:true,
                        college:{
                            select:{
                                email:true,
                                name:true,
                                address:true
                            }
                        }
                    }
                }
            },
        })
    ])
    res.json(
        new ApiResponse(200,updatedUser,"profile created successfully")
    )
})


const editProfile=asyncHandler(async(req,res)=>{
    const allowedUpdates=["year","resume","aboutMe","branch"]
    const update={}

    allowedUpdates.forEach((field)=>{
        if(req.body[field]) update[field]=req.body[field]
    })

    const user=await prisma.student.update({
        where:{userId:req.user.id},
        data:update,
        select:{
            id:true,
            year:true,
            branch:true,
            rollNo:true,
            resume:true,
            aboutMe:true,
            user:{
                select:{
                    name:true,
                    email:true,
                    hasCompletedProfile:true,
                }
            },
            college:{
                select:{
                    email:true,
                    name:true,
                    address:true
                }
            }
        }
    })

    res.json(
        new ApiResponse(200,user,"profile updated succeessfully")
    )
})

const addSkill=asyncHandler(async(req,res)=>{
    const { name } = req.body;
    if (!name) throw new ApiError(403, "please provide skill name");

    const student=await prisma.student.findUnique({
        where:{userId:req.user.id}
    })
    if(!student) throw new ApiError(404,"no such student found")

        
    const exists = await prisma.skill.findUnique({
        where: { name: name.toUpperCase() },
    });
    if (exists) {
        const studentSkillExists=await prisma.studentSkill.findUnique({
            where:{
                studentId_skillId:{
                    studentId:student.id,
                    skillId:exists.id
                }
            }
        })
        if(studentSkillExists) throw new ApiError(403,"skill already added")

        await prisma.studentSkill.create({
            data:{
                studentId:student.id,
                skillId:exists.id
            }
        })
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
        skillId: skill.id
      },
    });

    res.json(new ApiResponse(201, skill, "skill added successfully"));
})


const apply=asyncHandler(async(req,res)=>{
    const {jobId}=req.params

    const student=await prisma.student.findUnique({
        where:{userId:req.user.id}
    })
    if(!student) throw new ApiError(404,"no such student found")
    if(!student.resume) throw new ApiError(403,"please upload your resume first")

    const job=await prisma.job.findUnique({
        where:{id:jobId}
    })
    if(!job) throw new ApiError(404,"no such job found")

    if(job.collegeId !== student.collegeId) throw new ApiError(403,"the job is not for your college")
    if(!job.isApproved) throw new ApiError(403,"cant apply to un-approved job")
    if(job.status==="closed") throw new ApiError(403,"job application is closed")
    if(job.dueDate<new Date()) throw new ApiError(403,"the job application has expired")
    if(!job.mentorId) throw new ApiError(403,"cant apply without mentor")

    const exists=await prisma.application.findFirst({
        where:{
            studentId:student.id,
            jobId:job.id
        }
    })
    if(exists && exists.status==="pending") throw new ApiError(403,"you already applied and your application is under process")
    if(exists && exists.status==="rejected") throw new ApiError(403,"you already applied and you have been rejected")
    if(exists && exists.status==="shortlisted") throw new ApiError(403,"you already applied and you have been shortlisted")
    if(exists && exists.status==="hired") throw new ApiError(403,"you already applied and you have been hired")

    const application=await prisma.application.create({
        data:{
            studentId:student.id,
            jobId:job.id,
            mentorId:job.mentorId
        },
        select:{
            id:true,
            status:true,
            appliedAt:true,
            job:{
                select:{
                    company:{
                        select:{
                            email:true,
                            contactNo:true,
                            name:true,
                            address:true
                        }
                    }
                }
            },
            mentor:{
                select:{
                    user:{
                        select:{
                            name:true,
                            email:true
                        }
                    }
                }
            }
        }
    })

    res.json(
        new ApiResponse(201,application,"your have applied to this job")
    )
})

export { uploadBulkStudents, createProfile, editProfile, addSkill , apply};