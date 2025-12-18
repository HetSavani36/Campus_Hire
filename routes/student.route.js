import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import authorizeRole from "../middlewares/authorizableRole.js";
import hasCompletedProfile from "../middlewares/hasCompleteProfile.middleware.js";
import upload from "../middlewares/multer.middleware.js"
import { addSkill, apply, createProfile, editProfile, getJobDetail, getJobsList, uploadBulkStudents } from "../controllers/student.controller.js";

const router = Router();

router.post("/upload",verifyJWT,authorizeRole("collegeAdmin"),upload.single("file"),uploadBulkStudents);
router.post("/profile", verifyJWT, authorizeRole("student"), createProfile);
router.put("/profile", verifyJWT, authorizeRole("student"),hasCompletedProfile,editProfile);
router.post("/add/skill", verifyJWT, authorizeRole("student"),hasCompletedProfile,addSkill);
router.post("/apply/:jobId", verifyJWT, authorizeRole("student"),hasCompletedProfile,apply);
router.get("/jobs", verifyJWT, authorizeRole("student"),hasCompletedProfile,getJobsList);
router.get("/job/:jobId", verifyJWT, authorizeRole("student"),hasCompletedProfile,getJobDetail);

export default router;