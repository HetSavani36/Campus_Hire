import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import authorizeRole from "../middlewares/authorizableRole.js";
import { assignMentor, collabDecision, createMentor, exportMentors, getAllCollabRequests, getAllJobRequests, getCompanyDetails, getJobDetails, getMentorsList, jobApprovalDecision, mentorDetails, resetPassword } from "../controllers/college.controller.js";
import { rateLimitAssignMentor, rateLimitCollabDecision, rateLimitCollabRequests, rateLimitCollegeMentorDetails, rateLimitCollegeMentors, rateLimitCollegeResetPassword, rateLimitCompanyDetailsForCollege, rateLimitCreateMentor, rateLimitExportMentors, rateLimitJobApprovalDecision, rateLimitJobDetailsForCollege, rateLimitJobRequestsForCollege } from "../middlewares/rateLimit.js";
import { requestIdMiddleware } from "../middlewares/requestId.js";

const router = Router();

router.use(verifyJWT)
router.use(requestIdMiddleware)
router.post("/create/mentor",authorizeRole("collegeAdmin"),rateLimitCreateMentor,createMentor);
router.post("/collab/request/:companyId",authorizeRole("collegeAdmin"),rateLimitCollabDecision,collabDecision);
router.post("/reset-password/:userId",authorizeRole("collegeAdmin"),rateLimitCollegeResetPassword,resetPassword);
router.post("/job/:jobId/assign-mentor",authorizeRole("collegeAdmin"),rateLimitAssignMentor,assignMentor);
router.post("/job/:jobId/:result",authorizeRole("collegeAdmin"),rateLimitJobApprovalDecision,jobApprovalDecision);

router.get("/mentors",authorizeRole("collegeAdmin"),rateLimitCollegeMentors,getMentorsList)
router.get("/mentor/:mentorId",authorizeRole("collegeAdmin"),rateLimitCollegeMentorDetails,mentorDetails)
router.get("/collab/request",authorizeRole("collegeAdmin"),rateLimitCollabRequests,getAllCollabRequests)

router.get("/company/:companyId",authorizeRole("collegeAdmin"),rateLimitCompanyDetailsForCollege,getCompanyDetails)
router.get("/job/requests",authorizeRole("collegeAdmin"),rateLimitJobRequestsForCollege,getAllJobRequests)
router.get("/job/:jobId",authorizeRole("collegeAdmin"),rateLimitJobDetailsForCollege,getJobDetails)

router.get("/export/mentors",verifyJWT,authorizeRole("collegeAdmin"),rateLimitExportMentors,exportMentors);

export default router;