import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import authorizeRole from "../middlewares/authorizableRole.js";
import hasCompletedProfile from "../middlewares/hasCompleteProfile.middleware.js";
import upload from "../middlewares/multer.middleware.js"
import { addSkill, apply, createProfile, editProfile, getJobDetail, getJobsList, uploadBulkStudents } from "../controllers/student.controller.js";
import { rateLimitAddSkillForStudent, rateLimitApplyInJob, rateLimitCreateStudentProfile, rateLimitEditStudentProfile, rateLimitJobDetailsForStudent, rateLimitJobsForStudent, rateLimitUploadBulkStudents } from "../middlewares/rateLimit.js";

const router = Router();

router.post("/upload",verifyJWT,authorizeRole("collegeAdmin"),upload.single("file"),rateLimitUploadBulkStudents,uploadBulkStudents);
router.post("/profile", verifyJWT, authorizeRole("student"), rateLimitCreateStudentProfile,createProfile);
router.put("/profile", verifyJWT, authorizeRole("student"),hasCompletedProfile,rateLimitEditStudentProfile,editProfile);
router.post("/add/skill", verifyJWT, authorizeRole("student"),hasCompletedProfile,rateLimitAddSkillForStudent,addSkill);
router.post("/apply/:jobId", verifyJWT, authorizeRole("student"),hasCompletedProfile,rateLimitApplyInJob,apply);

router.get("/jobs", verifyJWT, authorizeRole("student"),hasCompletedProfile,rateLimitJobsForStudent,getJobsList);
router.get("/job/:jobId", verifyJWT, authorizeRole("student"),hasCompletedProfile,rateLimitJobDetailsForStudent,getJobDetail);

export default router;