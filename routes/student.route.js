import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import authorizeRole from "../middlewares/authorizableRole.js";
import hasCompletedProfile from "../middlewares/hasCompleteProfile.middleware.js";
import upload from "../middlewares/multer.middleware.js"
import { addSkill, apply, createProfile, editProfile, getJobDetail, getJobsList, getProfile, getStudentList, uploadBulkStudents } from "../controllers/student.controller.js";
import { rateLimitAddSkillForStudent, rateLimitApplyInJob, rateLimitCreateStudentProfile, rateLimitEditStudentProfile, rateLimitJobDetailsForStudent, rateLimitJobsForStudent, rateLimitUploadBulkStudents } from "../middlewares/rateLimit.js";
import { requestIdMiddleware } from "../middlewares/requestId.js";

const router = Router();
router.use(verifyJWT)
router.use(requestIdMiddleware)

router.post("/upload",authorizeRole("collegeAdmin"),upload.single("file"),rateLimitUploadBulkStudents,uploadBulkStudents);
router.post("/profile", authorizeRole("student"), rateLimitCreateStudentProfile,createProfile);
router.put("/profile", authorizeRole("student"),hasCompletedProfile,rateLimitEditStudentProfile,editProfile);
router.get("/profile", authorizeRole("student"),hasCompletedProfile,getProfile);
router.post("/add/skill", authorizeRole("student"),hasCompletedProfile,rateLimitAddSkillForStudent,addSkill);
router.post("/apply/:jobId", authorizeRole("student"),hasCompletedProfile,rateLimitApplyInJob,apply);

router.get("/job/:jobId", authorizeRole("student"),hasCompletedProfile,rateLimitJobDetailsForStudent,getJobDetail);
router.get("/jobs", authorizeRole("student"),hasCompletedProfile,rateLimitJobsForStudent,getJobsList);
router.get("/", authorizeRole("collegeAdmin"),getStudentList);

export default router;