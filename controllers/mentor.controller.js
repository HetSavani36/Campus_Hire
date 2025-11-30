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

export {
    makeStudentApplicationDecision
}