import {
  PrismaClient,
  UserRole,
  CompanyStatus,
  JobStatus,
  ApplicationStatus,
  ApprovalStatus,
  CollabStatus,
} from "@prisma/client";
import { faker } from "@faker-js/faker";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// --- 1. CONFIGURATION (Optimized High Load) ---
// This is the "Sweet Spot" - High volume but safe
const CONFIG = {
  COLLEGES: 10,
  COMPANIES: 10,
  SKILLS: 25,
  USERS: {
    MENTORS: 50,
    EMPLOYEES: 50,
    STUDENTS: 2000, // ⚡️ Increased safely due to optimization
  },
  JOBS_PER_COMPANY: 8,
  MAX_APPLICATIONS_PER_STUDENT: 5,
};

// --- 2. HELPERS ---
const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
const getRandomItems = (arr, count) => {
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

// Batch Helper
const batchInsert = async (modelName, data, batchSize = 500) => {
  console.log(
    `\t> Inserting ${data.length} ${modelName} in batches of ${batchSize}...`
  );
  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    await prisma[modelName].createMany({ data: batch, skipDuplicates: true });
  }
};

// --- 3. MAIN SEED FUNCTION ---
async function main() {
  console.log("🌱 Starting Optimized Database Seed...");
  const startTime = Date.now();

  const PASSWORD = "password123";
  const PASSWORD_HASH = await bcrypt.hash(PASSWORD, 10);

  // A. CLEANUP
  console.log("🧹 Cleaning existing data...");
  await prisma.$transaction([
    prisma.feedback.deleteMany(),
    prisma.certificate.deleteMany(),
    prisma.interview.deleteMany(),
    prisma.application.deleteMany(),
    prisma.studentSkill.deleteMany(),
    prisma.jobSkill.deleteMany(),
    prisma.job.deleteMany(),
    prisma.collab.deleteMany(),
    prisma.mentor.deleteMany(),
    prisma.employee.deleteMany(),
    prisma.student.deleteMany(),
    prisma.company.deleteMany(),
    prisma.college.deleteMany(),
    prisma.user.deleteMany(),
    prisma.skill.deleteMany(),
  ]);

  // B. PREPARE ADMIN DATA (Pre-generate IDs)
  console.log("🏗️  Generating Data in Memory (No DB calls yet)...");

  // We generate IDs here to avoid fetching them later
  const collegeIdMap = new Map(); // name -> id
  const companyIdMap = new Map(); // name -> id

  // --- College Data ---
  const collegeData = [];

  // 1. Demo College
  const demoCollegeId = faker.string.uuid();
  collegeData.push({
    id: demoCollegeId,
    name: "Demo Institute of Technology",
    address: "123 Tech Lane",
    email: "admin@college.com",
    phone: "9998887771",
  });
  collegeIdMap.set("Demo Institute of Technology", demoCollegeId);

  // 2. Random Colleges
  for (let i = 0; i < CONFIG.COLLEGES; i++) {
    const id = faker.string.uuid();
    const name = `${faker.location.city()} Institute of Technology`;
    collegeData.push({
      id,
      name,
      address: faker.location.streetAddress(),
      email: faker.internet.email(),
      phone: faker.phone.number(),
    });
    collegeIdMap.set(name, id);
  }

  // --- Company Data ---
  const companyData = [];

  // 1. Demo Company
  const demoCompanyId = faker.string.uuid();
  companyData.push({
    id: demoCompanyId,
    name: "Demo Corp",
    registrationNo: "REG123456",
    address: "456 Corporate Blvd",
    email: "admin@company.com",
    contactNo: "1112223334",
    status: CompanyStatus.active,
    collabNameShowUp: true,
  });
  companyIdMap.set("Demo Corp", demoCompanyId);

  // 2. Random Companies
  for (let i = 0; i < CONFIG.COMPANIES; i++) {
    const id = faker.string.uuid();
    const name = faker.company.name();
    companyData.push({
      id,
      name,
      registrationNo: faker.string.alphanumeric(10).toUpperCase(),
      address: faker.location.streetAddress(),
      email: faker.internet.email(),
      contactNo: faker.phone.number(),
      status:
        Math.random() > 0.1 ? CompanyStatus.active : CompanyStatus.inactive,
      collabNameShowUp: faker.datatype.boolean(),
    });
    companyIdMap.set(name, id);
  }

  // C. PREPARE USERS (With Pre-Generated IDs)
  // This is the trick: We know the ID before inserting!

  const allUsers = [];
  const mentors = []; // To track for profile creation
  const employees = [];
  const students = [];

  // Helper
  const createUser = (role, email = null, name = null) => {
    const id = faker.string.uuid();
    const user = {
      id, // <--- Explicit ID
      name: name || faker.person.fullName(),
      email: email || faker.internet.email(),
      password: PASSWORD_HASH,
      role: role,
      hasCompletedProfile: true,
      createdAt: faker.date.past(),
    };
    return user;
  };

  // 1. Admin Users (Linked to specific Colleges/Companies)
  collegeData.forEach((c) => {
    allUsers.push({ ...createUser(UserRole.collegeAdmin, c.email, c.name) });
  });
  companyData.forEach((c) => {
    allUsers.push({ ...createUser(UserRole.companyAdmin, c.email, c.name) });
  });

  // 2. Demo Student
  const demoStudentUser = createUser(
    UserRole.student,
    "student@demo.com",
    "Demo Student"
  );
  allUsers.push(demoStudentUser);
  students.push(demoStudentUser); // Track for profile

  // 3. Random Users
  for (let i = 0; i < CONFIG.USERS.MENTORS; i++) {
    const u = createUser(UserRole.mentor);
    allUsers.push(u);
    mentors.push(u);
  }
  for (let i = 0; i < CONFIG.USERS.EMPLOYEES; i++) {
    const u = createUser(UserRole.employee);
    allUsers.push(u);
    employees.push(u);
  }
  for (let i = 0; i < CONFIG.USERS.STUDENTS; i++) {
    const u = createUser(UserRole.student);
    allUsers.push(u);
    students.push(u);
  }

  // D. INSERT BASIC DATA (Batched)
  console.log("💾 Writing Users, Colleges, Companies to DB...");

  await batchInsert("user", allUsers);
  await batchInsert("college", collegeData);
  await batchInsert("company", companyData);

  // Skills
  const skillNames = new Set();
  while (skillNames.size < CONFIG.SKILLS)
    skillNames.add(faker.person.jobArea());
  // We need skills back for their IDs, but skills are few (25), so fetching is fast
  await prisma.skill.createMany({
    data: Array.from(skillNames).map((name) => ({ name })),
    skipDuplicates: true,
  });
  const dbSkills = await prisma.skill.findMany(); // Only DB fetch we really need

  // E. PREPARE PROFILES (In Memory using known IDs)
  console.log("🔗 Linking Profiles (In Memory)...");

  // NOTE: We use the `collegeData` and `companyData` arrays which already have IDs!

  const mentorProfiles = mentors.map((u) => ({
    userId: u.id, // Using pre-generated ID
    collegeId: getRandomItem(collegeData).id,
  }));

  const employeeProfiles = employees.map((u) => ({
    userId: u.id,
    companyId: getRandomItem(companyData).id,
  }));

  const studentProfiles = students.map((u) => ({
    userId: u.id,
    collegeId: getRandomItem(collegeData).id,
    year: faker.number.int({ min: 1, max: 4 }),
    branch: getRandomItem(["CS", "IT", "ECE", "MECH"]),
    rollNo: faker.string.alphanumeric(8).toUpperCase(),
    resume: faker.internet.url(),
    aboutMe: faker.lorem.sentence(),
  }));

  // Fix Demo Student Profile specific data
  const demoProfileIndex = studentProfiles.findIndex(
    (p) => p.userId === demoStudentUser.id
  );
  if (demoProfileIndex > -1) {
    studentProfiles[demoProfileIndex].collegeId = demoCollegeId;
    studentProfiles[demoProfileIndex].branch = "CS";
    studentProfiles[demoProfileIndex].year = 4;
  }

  // Insert Profiles
  await batchInsert("mentor", mentorProfiles);
  await batchInsert("employee", employeeProfiles);
  await batchInsert("student", studentProfiles);

  // We need the inserted Student IDs for applications, but we already have them!
  // However, we need to map Student -> College to assign jobs correctly.
  // We can just use the `studentProfiles` array for this since it contains studentId and collegeId.

  // F. JOBS & COLLABS
  console.log("💼 Creating Jobs & Collabs...");

  const collabs = [];
  collegeData.forEach((college) => {
    const partnerCompanies = getRandomItems(companyData, 2);
    partnerCompanies.forEach((company) => {
      collabs.push({
        collegeId: college.id,
        companyId: company.id,
        status: getRandomItem(Object.values(CollabStatus)),
      });
    });
  });
  await batchInsert("collab", collabs);

  // Create Jobs
  // We need to track created jobs to link applications.
  const allJobs = [];

  companyData.forEach((company) => {
    if (company.status !== CompanyStatus.active) return;
    for (let i = 0; i < CONFIG.JOBS_PER_COMPANY; i++) {
      const isApproved = faker.datatype.boolean();
      // Assign to a random college
      const jobCollege = getRandomItem(collegeData);

      // Need a mentor ID? We have the `mentorProfiles` array!
      // Filter mentors for this college
      const collegeMentors = mentorProfiles.filter(
        (m) => m.collegeId === jobCollege.id
      );
      const mentorId =
        isApproved && collegeMentors.length > 0
          ? getRandomItem(collegeMentors).userId // Note: Mentor ID is technically UUID, but schema links via User?
          : // Wait, schema says mentorId is string. Mentor model ID is uuid.
            // We need the Mentor Model ID, not User ID.
            // Ah, slight catch: We inserted Mentors but didn't generate explicit Mentor IDs (Prisma default).
            // Since we need Mentor IDs for Jobs, we DO need to fetch Mentors or pre-generate them too.
            null;

      // Optimization: Let's fetch Mentors quickly. It's only 50 records.
      // We will do this fetch below before inserting jobs.
    }
  });

  // Since we need Mentor IDs (which are separate from User IDs in your schema),
  // we will fetch just the Mentors and Jobs.
  const dbMentors = await prisma.mentor.findMany();

  const jobsData = [];
  companyData.forEach((company) => {
    if (company.status !== CompanyStatus.active) return;
    for (let i = 0; i < CONFIG.JOBS_PER_COMPANY; i++) {
      const isApproved = faker.datatype.boolean();
      const jobCollege = getRandomItem(collegeData);

      // Find valid mentor for this college
      const validMentors = dbMentors.filter(
        (m) => m.collegeId === jobCollege.id
      );

      const jobId = faker.string.uuid(); // Pre-generate Job ID
      const job = {
        id: jobId,
        title: faker.person.jobTitle(),
        salary: faker.number.int({ min: 300000, max: 2500000 }),
        tenure: "Permanent",
        address: company.address,
        status: JobStatus.active,
        dueDate: faker.date.future(),
        collegeId: jobCollege.id,
        companyId: company.id,
        isApproved: isApproved,
        mentorId:
          isApproved && validMentors.length
            ? getRandomItem(validMentors).id
            : null,
      };
      jobsData.push(job);
      allJobs.push(job);
    }
  });

  await batchInsert("job", jobsData);

  // G. APPLICATIONS
  console.log("📝 Generating Applications...");

  // We have `studentProfiles` which has { userId, collegeId }.
  // Wait, Student Table ID is different from User ID.
  // We need the Student Table ID.
  // Since we batch inserted students without explicit IDs, we actually DO need to fetch students back.
  // BUT, 2000 records is fast to fetch if we only select ID and CollegeID.

  const dbStudents = await prisma.student.findMany({
    select: { id: true, collegeId: true },
  });

  const applicationsData = [];
  dbStudents.forEach((student) => {
    // Find jobs for this student's college
    const relevantJobs = allJobs.filter(
      (j) => j.collegeId === student.collegeId
    );
    const applied = getRandomItems(
      relevantJobs,
      faker.number.int({ min: 0, max: CONFIG.MAX_APPLICATIONS_PER_STUDENT })
    );

    applied.forEach((job) => {
      applicationsData.push({
        studentId: student.id,
        jobId: job.id,
        mentorId: job.mentorId,
        status: getRandomItem(Object.values(ApplicationStatus)),
        mentorApproval: getRandomItem(Object.values(ApprovalStatus)),
      });
    });
  });
  await batchInsert("application", applicationsData);

  // H. SKILLS LINKS (Optional for heavy load, kept simple)
  // Job Skills
  const jobSkills = [];
  allJobs.forEach((j) => {
    getRandomItems(dbSkills, 3).forEach((s) =>
      jobSkills.push({ jobId: j.id, skillId: s.id })
    );
  });
  await batchInsert("jobSkill", jobSkills);

  const duration = (Date.now() - startTime) / 1000;
  console.log(`✅ Seed completed in ${duration.toFixed(2)}s`);
  console.log(
    `   Stats: ${allUsers.length} Users, ${allJobs.length} Jobs, ${applicationsData.length} Applications`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
