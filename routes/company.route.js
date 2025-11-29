import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import authorizeRole from "../middlewares/authorizableRole.js";
import { addSkill, collabWithCollege, createEmployee, postJob, resetPassword } from "../controllers/company.controller.js";

const router = Router();

router.post("/create/employee",verifyJWT,authorizeRole("companyAdmin"),createEmployee);
router.post("/collab",verifyJWT,authorizeRole("companyAdmin"),collabWithCollege);
router.post("/reset-password",verifyJWT,authorizeRole("companyAdmin"),resetPassword);

router.post("/create/job",verifyJWT,authorizeRole("companyAdmin"),postJob);
router.post("/add/skill",verifyJWT,authorizeRole("companyAdmin","employee"),addSkill);

export default router;