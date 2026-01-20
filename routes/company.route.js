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
import { rateLimitAddSkillForCompany, rateLimitCollabRequest, rateLimitCollegeDetailsForCompany, rateLimitCollegesForCompany, rateLimitCompanyResetPassword, rateLimitCreateEmployee, rateLimitEmployeeDetailsForCompany, rateLimitEmployeesForCompany, rateLimitExportEmployees, rateLimitJobDetailsForCompany, rateLimitJobsForCompany, rateLimitPostJob, rateLimitSkillsForCompany, rateLimitStudentApplicationDecisionForCompany } from "../middlewares/rateLimit.js";

const router = Router();

router.post("/create/employee",verifyJWT,authorizeRole("companyAdmin"),rateLimitCreateEmployee,createEmployee);
router.post("/collab/:collegeId",verifyJWT,authorizeRole("companyAdmin"),rateLimitCollabRequest,collabWithCollege);
router.post("/reset-password/:userId",verifyJWT,authorizeRole("companyAdmin"),rateLimitCompanyResetPassword,resetPassword);

router.post("/create/job",verifyJWT,authorizeRole("companyAdmin"),rateLimitPostJob,postJob);
router.post("/add/skill",verifyJWT,authorizeRole("companyAdmin","employee"),rateLimitAddSkillForCompany,addSkill);

router.post("/application/:applicationId",verifyJWT,authorizeRole("employee"),rateLimitStudentApplicationDecisionForCompany,makeStudentApplicationDecision);

router.get("/export/employees",verifyJWT,authorizeRole("companyAdmin"),rateLimitExportEmployees,exportEmployees);
router.get("/employees",verifyJWT,authorizeRole("companyAdmin"),rateLimitEmployeesForCompany,getEmployeesList);
router.get("/employee/:employeeId",verifyJWT,authorizeRole("companyAdmin"),rateLimitEmployeeDetailsForCompany,getEmployeeDetail);
router.get("/college",verifyJWT,authorizeRole("companyAdmin"),rateLimitCollegesForCompany,getAllColleges);
router.get("/college/:collegeId",verifyJWT,authorizeRole("companyAdmin"),rateLimitCollegeDetailsForCompany,getCollegeDetails);

router.get("/skills",verifyJWT,authorizeRole("companyAdmin","employee"),rateLimitSkillsForCompany,getAllSkills);
router.get("/jobs", verifyJWT, authorizeRole("companyAdmin"),rateLimitJobsForCompany,getAllJobs);
router.get("/job/:jobId", verifyJWT, authorizeRole("companyAdmin"),rateLimitJobDetailsForCompany,getJobDetails);


export default router