import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import authorizeRole from "../middlewares/authorizableRole.js";
import { assignMentor, collabDecision, createMentor, exportMentors, getAllCollabRequests, getAllJobRequests, getCompanyDetails, getJobDetails, getMentorsList, jobApprovalDecision, mentorDetails, resetPassword } from "../controllers/college.controller.js";
import { rateLimitAssignMentor, rateLimitCollabDecision, rateLimitCollabRequests, rateLimitCollegeMentorDetails, rateLimitCollegeMentors, rateLimitCollegeResetPassword, rateLimitCompanyDetailsForCollege, rateLimitCreateMentor, rateLimitExportMentors, rateLimitJobApprovalDecision, rateLimitJobDetailsForCollege, rateLimitJobRequestsForCollege } from "../middlewares/rateLimit.js";

const router = Router();

router.post("/create/mentor",verifyJWT,authorizeRole("collegeAdmin"),rateLimitCreateMentor,createMentor);
router.post("/collab/request/:companyId",verifyJWT,authorizeRole("collegeAdmin"),rateLimitCollabDecision,collabDecision);
router.post("/reset-password/:userId",verifyJWT,authorizeRole("collegeAdmin"),rateLimitCollegeResetPassword,resetPassword);
router.post("/job/:jobId/assign-mentor",verifyJWT,authorizeRole("collegeAdmin"),rateLimitAssignMentor,assignMentor);
router.post("/job/:jobId/:result",verifyJWT,authorizeRole("collegeAdmin"),rateLimitJobApprovalDecision,jobApprovalDecision);

router.get("/mentors",verifyJWT,authorizeRole("collegeAdmin"),rateLimitCollegeMentors,getMentorsList)
router.get("/mentor/:mentorId",verifyJWT,authorizeRole("collegeAdmin"),rateLimitCollegeMentorDetails,mentorDetails)
router.get("/collab/request",verifyJWT,authorizeRole("collegeAdmin"),rateLimitCollabRequests,getAllCollabRequests)

router.get("/company/:companyId",verifyJWT,authorizeRole("collegeAdmin"),rateLimitCompanyDetailsForCollege,getCompanyDetails)
router.get("/job/requests",verifyJWT,authorizeRole("collegeAdmin"),rateLimitJobRequestsForCollege,getAllJobRequests)
router.get("/job/:jobId",verifyJWT,authorizeRole("collegeAdmin"),rateLimitJobDetailsForCollege,getJobDetails)

router.get("/export/mentors",verifyJWT,authorizeRole("collegeAdmin"),rateLimitExportMentors,exportMentors);

export default router;