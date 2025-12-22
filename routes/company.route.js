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
  getEmployeesList,
  getEmployeeDetail,
  getAllColleges,
  getAllSkills,
  getAllJobs,
  getJobDetails,
  getCollegeDetails,
  exportEmployees,
} from "../controllers/company.controller.js";

const router = Router();

router.post("/create/employee",verifyJWT,authorizeRole("companyAdmin"),createEmployee);
router.post("/collab/:collegeId",verifyJWT,authorizeRole("companyAdmin"),collabWithCollege);
router.post("/reset-password/:userId",verifyJWT,authorizeRole("companyAdmin"),resetPassword);

router.post("/create/job",verifyJWT,authorizeRole("companyAdmin"),postJob);
router.post("/add/skill",verifyJWT,authorizeRole("companyAdmin","employee"),addSkill);

router.post("/application/:applicationId",verifyJWT,authorizeRole("employee"),makeStudentApplicationDecision);

router.get("/export/employees",verifyJWT,authorizeRole("companyAdmin"),exportEmployees);
router.get("/employees",verifyJWT,authorizeRole("companyAdmin"),getEmployeesList);
router.get("/employee/:employeeId",verifyJWT,authorizeRole("companyAdmin"),getEmployeeDetail);
router.get("/college",verifyJWT,authorizeRole("companyAdmin"),getAllColleges);
router.get("/college/:collegeId",verifyJWT,authorizeRole("companyAdmin"),getCollegeDetails);

router.get("/skills",verifyJWT,authorizeRole("companyAdmin","employee"),getAllSkills);
router.get("/jobs", verifyJWT, authorizeRole("companyAdmin"), getAllJobs);
router.get("/job/:jobId", verifyJWT, authorizeRole("companyAdmin"), getJobDetails);


export default router