import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import authorizeRole from "../middlewares/authorizableRole.js";
import {
  addSkill,
  collabWithCollege,
  createEmployee,
  postJob,
  resetPassword,
  makeStudentApplicationDecision,
} from "../controllers/company.controller.js";

const router = Router();

router.post("/create/employee",verifyJWT,authorizeRole("companyAdmin"),createEmployee);
router.post("/collab/:collegeId",verifyJWT,authorizeRole("companyAdmin"),collabWithCollege);
router.post("/reset-password/:userId",verifyJWT,authorizeRole("companyAdmin"),resetPassword);

router.post("/create/job",verifyJWT,authorizeRole("companyAdmin"),postJob);
router.post("/add/skill",verifyJWT,authorizeRole("companyAdmin","employee"),addSkill);

router.post("/application/:applicationId",verifyJWT,authorizeRole("employee"),makeStudentApplicationDecision);


export default router