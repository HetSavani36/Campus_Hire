import { PrismaClient } from "@prisma/client";
import ApiError from "../utils/ApiError.js";
import ApiResponse from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
const prisma=new PrismaClient()

const makeStudentApplicationDecision = asyncHandler(async (req, res) => {
    const { applicationId, result } = req.params;
    if (!applicationId || !result)
        throw new ApiError(403, "please provide studentId and your decision");
    if (result !== "1" && result !== "0")
        throw new ApiError(403, "please provide proper decision in either 0 or 1");

    const approval = result === "1" ? "approved" : "rejected";

    const application = await prisma.application.findUnique({
        where: { id: applicationId },
    });
    if (!application) throw new ApiError(404, "no such application found");

    if (application.status === "pending") throw new ApiError(403, "the application is pending for approval by company");
    if (application.status === "hired") throw new ApiError(403, "the student is already hired");
    if (application.status === "rejected") throw new ApiError(403, "the student has been rejected");
    if (application.mentorApproval!==null) throw new ApiError(403,"mentor had already approved/rejected application")
    
    const applicationAfterDecision = await prisma.application.update({
        where: { id: application.id },
        data: {
            mentorApproval:approval
        },
    });

    res.json(
        new ApiResponse(
            200,
            applicationAfterDecision,
            `the student application has been ${approval} by mentor`
        )
    );
});

const getAllJobs=asyncHandler(async(req,res)=>{

    const {filter="current"}=req.query

    const mentor=await prisma.mentor.findUnique({
        where:{userId:req.user.id}
    })
    if(!mentor) throw new ApiError(404,"no such mentor found")

    let whereClause={
        collegeId:mentor.collegeId,
        mentorId:mentor.id
    }
    if (filter === "past") whereClause.dueDate = { lt: new Date() };
    if (filter === "current") whereClause.dueDate = { gte: new Date() };

    const jobs=await prisma.job.findMany({
        where:whereClause,
        select:{
            id:true,
            title:true,
            salary:true,
            dueDate:true,
            company:{
                select:{
                    name:true,
                    email:true
                }
            }
        }
    })

    res.json(
        new ApiResponse(200,jobs,"jobs under mentor")
    )
})


const getJobDetails = asyncHandler(async (req, res) => {
  const { jobId } = req.params;
  if (!jobId) throw new ApiError(403, "please provide job id");

  const mentor = await prisma.mentor.findUnique({
    where: { userId: req.user.id },
  });
  if (!mentor) throw new ApiError(404, "no such mentor found");

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
      mentorId: true,

      company: {
        select: {
          id: true,
          name: true,
          address: true,
          email: true,
          contactNo: true,
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
  if (job.collegeId !== mentor.collegeId)
    throw new ApiError(403, "job not belongs to your college");
  if (job.mentorId !== mentor.id)
    throw new ApiError(403, "job is not under you");

  // -------- Group applications --------
  const groupedApplications = {
    shortlisted: [],
    rejected: [],
    hired: [],
    pending: [],
  };

  job.applications.forEach((app) => {
    groupedApplications[app.status]?.push(app);
  });

  // -------- Counts --------
  const applicationCount = {
    total: job.applications.length,
    shortlisted: groupedApplications.shortlisted.length,
    rejected: groupedApplications.rejected.length,
    hired: groupedApplications.hired.length,
    pending: groupedApplications.pending.length,
  };

  const response = {
    ...job,
    applications: groupedApplications,
    applicationCount,
  };

  res.json(new ApiResponse(200, response, "job details"));
});


export {
    makeStudentApplicationDecision,
    getAllJobs,
    getJobDetails
}