import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import authorizeRole from "../middlewares/authorizableRole.js";
import { getAllJobs, getJobDetails, getJobsWithApplicationSummary, getStudentHistoryForMentor, getStudentsListForMentor, makeStudentApplicationDecision } from "../controllers/mentor.controller.js";
import { rateLimitStudentApplicationDecisionForMentor } from "../middlewares/rateLimit.js";
import { requestIdMiddleware } from "../middlewares/requestId.js";

const router = Router();

router.use(verifyJWT)
router.use(requestIdMiddleware)

router.put("/application/:applicationId/decision",authorizeRole("mentor"),rateLimitStudentApplicationDecisionForMentor,makeStudentApplicationDecision);
router.get("/job/:jobId",authorizeRole("mentor"),getJobDetails);
router.get("/jobs",authorizeRole("mentor"),getAllJobs);
router.get("/student/:studentId/history", getStudentHistoryForMentor);
router.get("/students", getStudentsListForMentor);
router.get("/jobs-with-applications", getJobsWithApplicationSummary);

export default router;