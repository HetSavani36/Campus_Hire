import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import authorizeRole from "../middlewares/authorizableRole.js";
import { assignMentor, collabDecision, createMentor, jobApprovalDecision, resetPassword } from "../controllers/college.controller.js";

const router = Router();

router.post("/create/mentor",verifyJWT,authorizeRole("collegeAdmin"),createMentor);
router.post("/collab/request/:companyId",verifyJWT,authorizeRole("collegeAdmin"),collabDecision);
router.post("/reset-password/:userId",verifyJWT,authorizeRole("collegeAdmin"),resetPassword);
router.post("/job/:jobId/:result",verifyJWT,authorizeRole("collegeAdmin"),jobApprovalDecision);
router.post("/job/:jobId/assign-mentor",verifyJWT,authorizeRole("collegeAdmin"),assignMentor);

export default router;