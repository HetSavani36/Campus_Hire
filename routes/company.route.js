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
  getCompanyDetails,
} from "../controllers/company.controller.js";
import { rateLimitAddSkillForCompany, rateLimitCollabRequest, rateLimitCollegeDetailsForCompany, rateLimitCollegesForCompany, rateLimitCompanyResetPassword, rateLimitCreateEmployee, rateLimitEmployeeDetailsForCompany, rateLimitEmployeesForCompany, rateLimitExportEmployees, rateLimitJobDetailsForCompany, rateLimitJobsForCompany, rateLimitPostJob, rateLimitSkillsForCompany, rateLimitStudentApplicationDecisionForCompany } from "../middlewares/rateLimit.js";
import { requestIdMiddleware } from "../middlewares/requestId.js";

const router = Router();

router.use(verifyJWT)
router.use(requestIdMiddleware)

router.post("/create/employee",authorizeRole("companyAdmin"),rateLimitCreateEmployee,createEmployee);
router.post("/collab/:collegeId",authorizeRole("companyAdmin"),rateLimitCollabRequest,collabWithCollege);
router.post("/reset-password/:userId",authorizeRole("companyAdmin"),rateLimitCompanyResetPassword,resetPassword);

router.post("/create/job",authorizeRole("companyAdmin"),rateLimitPostJob,postJob);
router.post("/add/skill",authorizeRole("companyAdmin","employee"),rateLimitAddSkillForCompany,addSkill);

router.post("/application/:applicationId",authorizeRole("employee"),rateLimitStudentApplicationDecisionForCompany,makeStudentApplicationDecision);

router.get("/export/employees",authorizeRole("companyAdmin"),rateLimitExportEmployees,exportEmployees);
router.get("/employees",authorizeRole("companyAdmin"),rateLimitEmployeesForCompany,getEmployeesList);
router.get("/employee/:employeeId",authorizeRole("companyAdmin"),rateLimitEmployeeDetailsForCompany,getEmployeeDetail);
router.get("/college",authorizeRole("companyAdmin"),rateLimitCollegesForCompany,getAllColleges);
router.get("/college/:collegeId",authorizeRole("companyAdmin"),rateLimitCollegeDetailsForCompany,getCollegeDetails);

router.get("/skills",authorizeRole("companyAdmin","employee"),rateLimitSkillsForCompany,getAllSkills);
router.get("/jobs", authorizeRole("companyAdmin"),rateLimitJobsForCompany,getAllJobs);
router.get("/job/:jobId",authorizeRole("companyAdmin"),getJobDetails)

router.get("/profile", authorizeRole("companyAdmin"),getCompanyDetails);


export default router