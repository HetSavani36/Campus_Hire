import { asyncHandler } from "../utils/asyncHandler.js";
import { transporter } from "../utils/email-transporter.js";

export const sendRegisterCollegeMail=async(data)=>{
    const {name,email}=data
    await transporter.sendMail({
        from:process.env.EMAIL_USER,
        to:email,
        subject:'Welcome to CampusHire – College Registration Successful',
        html: `
            <h2>Welcome to CampusHire 🎓</h2>

            <p>Hello <strong>${name}</strong>,</p>

            <p>
                Your college has been successfully registered on <strong>CampusHire</strong>.
                CampusHire is designed to simplify campus placements by connecting colleges
                directly with hiring companies on a single platform.
            </p>

            <p>
                As a college admin, you can:
                <ul>
                <li>Manage students and mentors</li>
                <li>Collaborate with companies</li>
                <li>Track job postings and applications</li>
                </ul>
            </p>

            <p>
                You can log in using your registered email:
                <strong>${email}</strong>
            </p>

            <p>
                We’re glad to have your institution onboard.
            </p>

            <p>
                — Team CampusHire
            </p>
            `
    }) 

}



export const sendRegisterCompanyMail = async (data) => {
  const { name, email } = data;
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Welcome to CampusHire – Company Registration Successful",
    html: `
        <h2>Welcome to CampusHire 🚀</h2>

        <p>Hello <strong>${name}</strong>,</p>

        <p>
            Your company account has been successfully created on
            <strong>CampusHire</strong>.
            CampusHire helps companies connect with colleges and hire students
            efficiently through a structured campus recruitment process.
        </p>

        <p>
            With CampusHire, you can:
            <ul>
            <li>Post job opportunities</li>
            <li>Collaborate with multiple colleges</li>
            <li>Review and manage student applications</li>
            </ul>
        </p>

        <p>
            You can sign in using your registered email:
            <strong>${email}</strong>
        </p>

        <p>
            We look forward to helping you hire the right talent.
        </p>

        <p>
            — Team CampusHire
        </p>
        `,
  });
};



export const sendMentorCredentialsMail = async (data) => {
  const { name, email,password,collegeName } = data;
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Your Mentor Account Credentials – CampusHire",
    html: `
        <h2>Mentor Account Created on CampusHire 🎓</h2>

        <p>Hello <strong>${name}</strong>,</p>

        <p>
            Your mentor account has been created on <strong>CampusHire</strong> by your college.
            CampusHire is a campus placement platform that connects colleges, companies,
            and students to manage hiring and mentoring activities efficiently.
        </p>

        <p>
            You can use the following credentials to log in:
        </p>

        <p>
            <strong>Email:</strong> ${email}<br />
            <strong>Temporary Password:</strong> ${password}
        </p>

        <p>
            After logging in for the first time, we strongly recommend that you
            change your password for security reasons.
        </p>

        <p>
            As a mentor, you will be able to:
            <ul>
            <li>Review assigned students</li>
            <li>Approve or guide applications</li>
            <li>Participate in the campus hiring workflow</li>
            </ul>
        </p>

        <p>
            If you were not expecting this email, please contact your college administrator.
        </p>

        <p>
            — Team CampusHire
        </p>
        `,
  });
};



export const sendCollabDecisionMail = async (data) => {
  const { companyName, collegeName,status,companyEmail } = data;

    const subject =
    status === "accepted"
        ? `Collaboration Approved by ${collegeName} – CampusHire`
        : `Collaboration Request Declined by ${collegeName} – CampusHire`;

    const html =
    status === "accepted"
        ? `
            <h2>Collaboration Request Accepted 🎉</h2>

            <p>Hello <strong>${companyName}</strong>,</p>

            <p>
            We’re happy to inform you that <strong>${collegeName}</strong> has
            <strong>accepted</strong> your collaboration request on
            <strong>CampusHire</strong>.
            </p>

            <p>You can now collaborate with the college to:</p>
            <ul>
            <li>Post job opportunities</li>
            <li>Review student applications</li>
            <li>Manage campus hiring activities</li>
            </ul>

            <p>
            Log in to your CampusHire dashboard to proceed with the next steps.
            </p>

            <p>
            We wish you a successful collaboration.
            </p>

            <p>— Team CampusHire</p>
        `
        : `
            <h2>Collaboration Request Update</h2>

            <p>Hello <strong>${companyName}</strong>,</p>

            <p>
            This is to inform you that <strong>${collegeName}</strong> has
            <strong>declined</strong> your collaboration request on
            <strong>CampusHire</strong>.
            </p>

            <p>
            You may explore collaboration opportunities with other colleges
            available on the platform or reach out again at a later time.
            </p>

            <p>
            We appreciate your interest in partnering through CampusHire.
            </p>

            <p>— Team CampusHire</p>
        `;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: companyEmail,
    subject: subject,
    html: html,
  });
};


export const sendResetPasswordMail=async(data)=>{
    const { name, email, role } = data;
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset Successful – CampusHire",
      html: `
        <h2>Password Reset Successful 🔐</h2>

        <p>Hello <strong>${name}</strong>,</p>

        <p>
            This is to confirm that the password for your
            <strong>${role}</strong> account on <strong>CampusHire</strong>
            has been successfully reset.
        </p>

        <p>
            You can now log in using your updated password.
            For security reasons, please do not share your credentials
            with anyone.
        </p>

        <p>
            If you did not request this password reset, we strongly recommend that you:
            <ul>
            <li>Log in immediately and change your password</li>
            <li>Contact your administrator or support team</li>
            </ul>
        </p>

        <p>
            If everything looks good, no further action is required.
        </p>

        <p>
            — Team CampusHire
        </p>
        `,
    });
}


export const sendJobDecisionMail = async (data) => {
  const { companyName, collegeName, jobTitle, status, companyEmail } = data;

  const subject =
    status === "approved"
      ? `Job Approved by ${collegeName} – CampusHire`
      : `Job Rejected by ${collegeName} – CampusHire`;

  const html =
    status === "approved"
      ? `
        <h2>Job Posting Approved ✅</h2>

        <p>Hello <strong>${companyName}</strong>,</p>

        <p>
          We’re pleased to inform you that <strong>${collegeName}</strong> has
          <strong>approved</strong> your job posting titled
          <strong>${jobTitle}</strong> on <strong>CampusHire</strong>.
        </p>

        <p>
          The job is now visible to students of the college, and you can begin
          receiving applications through the platform.
        </p>

        <p>You can now:</p>
        <ul>
          <li>Track student applications</li>
          <li>Shortlist candidates</li>
          <li>Proceed with interviews</li>
        </ul>

        <p>
          We wish you success in finding the right candidates.
        </p>

        <p>— Team CampusHire</p>
      `
      : `
        <h2>Job Posting Update</h2>

        <p>Hello <strong>${companyName}</strong>,</p>

        <p>
          This is to inform you that <strong>${collegeName}</strong> has
          <strong>rejected</strong> your job posting titled
          <strong>${jobTitle}</strong> on <strong>CampusHire</strong>.
        </p>

        <p>
          You may review the job details and submit a revised posting,
          or explore opportunities with other colleges on the platform.
        </p>

        <p>
          We appreciate your interest in hiring through CampusHire.
        </p>

        <p>— Team CampusHire</p>
      `;

  await transporter.sendMail({
    from: `"CampusHire" <${process.env.EMAIL_USER}>`,
    to: companyEmail,
    subject:subject,
    html:html,
  });
};



export const sendMentorJobAssignMail = async (data) => {
  const { mentorName,jobTitle,companyName,mentorEmail } = data;
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: mentorEmail,
    subject: `Mentor Assignment: ${jobTitle} – CampusHire`,
    html: `
        <h2>You’ve Been Assigned a Job to Manage 🧑‍🏫</h2>

        <p>Hello <strong>${mentorName}</strong>,</p>

        <p>
            You have been assigned as a mentor for the job
            <strong>${jobTitle}</strong> posted by
            <strong>${companyName}</strong> on <strong>CampusHire</strong>.
        </p>

        <p>
            As the assigned mentor, your responsibilities include:
        </p>

        <ul>
            <li>Reviewing students who apply for this job</li>
            <li>Approving or rejecting applications</li>
            <li>Guiding students through the hiring process</li>
        </ul>

        <p>
            Please log in to your CampusHire dashboard to start managing
            applications related to this job.
        </p>

        <p>
            If you have any questions, please reach out to your college administrator.
        </p>

        <p>
            — Team CampusHire
        </p>
        `,
  });
};



export const sendEmployeeCredentialsMail = async (data) => {
  const { name, email, password, companyName } = data;
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Your Employee Account Credentials – CampusHire",
    html: `
      <h2>Your Employee Account Has Been Created 💼</h2>

      <p>Hello <strong>${name}</strong>,</p>

      <p>
        Your employee account has been created on <strong>CampusHire</strong>
        by <strong>${companyName}</strong>.
        CampusHire helps companies manage campus hiring, collaborate with colleges,
        and streamline recruitment workflows.
      </p>

      <p>
        You can log in using the following credentials:
      </p>

      <p>
        <strong>Email:</strong> ${email}<br />
        <strong>Temporary Password:</strong> ${password}
      </p>

      <p>
        For security reasons, please log in and change your password immediately
        after your first login.
      </p>

      <p>
        As an employee, you may be involved in:
      </p>

      <ul>
        <li>Managing job postings</li>
        <li>Reviewing student applications</li>
        <li>Supporting the campus hiring process</li>
      </ul>

      <p>
        If you were not expecting this email, please contact your company administrator.
      </p>

      <p>
        — Team CampusHire
      </p>
    `

  });
};



export const sendCollabRequestRecievedMail = async (data) => {
  const { collegEmail, collegeName, companyName } = data;
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: collegEmail,
    subject: `New Collaboration Request from ${companyName} – CampusHire`,
    html: `
      <h2>New Collaboration Request Received 🤝</h2>

      <p>Hello <strong>${collegeName}</strong>,</p>

      <p>
        You have received a new collaboration request on <strong>CampusHire</strong>
        from <strong>${companyName}</strong>.
      </p>

      <p>
        Collaborating with companies allows you to:
      </p>

      <ul>
        <li>Share job opportunities with your students</li>
        <li>Participate in campus hiring initiatives</li>
        <li>Build long-term industry partnerships</li>
      </ul>

      <p>
        Please log in to your CampusHire dashboard to review
        and take action on this collaboration request.
      </p>

      <p>
        If you are not expecting this request, you can safely ignore this email.
      </p>

      <p>
        — Team CampusHire
      </p>
    `,
  });
};


export const sendJobAddedMail = async (data) => {
  const { collegEmail, collegeName, companyName, jobTitle } = data;
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: collegEmail,
    subject: `New Job Posted by ${companyName} – CampusHire`,
    html: `
      <h2>New Job Posted on CampusHire 🆕</h2>

      <p>Hello <strong>${collegeName}</strong>,</p>

      <p>
        A new job has been posted on <strong>CampusHire</strong> by
        <strong>${companyName}</strong> for your college.
      </p>

      <p>
        <strong>Job Title:</strong> ${jobTitle}
      </p>

      <p>
        Please log in to your CampusHire dashboard to view the job details
        and take the necessary action.
      </p>

      <p>
        This helps you keep track of new opportunities being shared with
        your students.
      </p>

      <p>
        — Team CampusHire
      </p>
    `,
  });
};


export const sendStudentApplicationDecisionMail = async (data) => {
  const { studentName, companyName, jobTitle, status, studentEmail } = data;

  const subject =
    status === "shortlisted"
      ? `You’ve Been Shortlisted for ${jobTitle} – CampusHire`
      : `Application Update for ${jobTitle} – CampusHire`;

  const html =
    status === "shortlisted"
      ? `
        <h2>Congratulations! 🎉</h2>

        <p>Hello <strong>${studentName}</strong>,</p>

        <p>
          We’re happy to inform you that <strong>${companyName}</strong> has
          <strong>shortlisted</strong> your application for the position of
          <strong>${jobTitle}</strong> on <strong>CampusHire</strong>.
        </p>

        <p>
          This means you have moved forward in the hiring process.
          Further steps such as interviews or assessments will be communicated
          to you soon.
        </p>

        <p>
          Please keep an eye on your dashboard and email for updates.
        </p>

        <p>
          Best of luck!
        </p>

        <p>
          — Team CampusHire
        </p>
      `
      : `
        <h2>Application Update</h2>

        <p>Hello <strong>${studentName}</strong>,</p>

        <p>
          Thank you for applying to the position of
          <strong>${jobTitle}</strong> at <strong>${companyName}</strong>
          through <strong>CampusHire</strong>.
        </p>

        <p>
          After careful consideration, your application was
          <strong>not selected</strong> at this time.
        </p>

        <p>
          We encourage you to continue applying for other opportunities
          available on CampusHire.
        </p>

        <p>
          We wish you the very best in your job search.
        </p>

        <p>
          — Team CampusHire
        </p>
      `;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: studentEmail,
    subject: subject,
    html: html,
  });
};



export const sendStudentJobNotificationMail = async (data) => {
  const {studentName,studentEmail,companyName,jobTitle } = data;
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: studentEmail,
    subject: `New Job Opportunity Posted – CampusHire`,
    html: `
      <h2>New Job Opportunity Available 🆕</h2>

      <p>Hello <strong>${studentName}</strong>,</p>

      <p>
        A new job has been posted on <strong>CampusHire</strong> that you may be
        eligible for.
      </p>

      <p>
        <strong>Company:</strong> ${companyName}<br />
        <strong>Job Title:</strong> ${jobTitle}
      </p>

      <p>
        You can log in to your CampusHire dashboard to view the job details
        and apply if you’re interested.
      </p>

      <p>
        Stay proactive and explore opportunities that match your skills
        and career goals.
      </p>

      <p>
        — Team CampusHire
      </p>
    `,
  });
};



export const sendStudentMentorDecisionMail = async (data) => {
  const { studentName, mentorName, companyName, jobTitle, status, studentEmail } =data;

  const subject =
    status === "approved"
      ? `Your Application Has Been Approved – CampusHire`
      : `Application Update – CampusHire`;

  const html =
    status === "approved"
      ? `
        <h2>Application Approved ✅</h2>

        <p>Hello <strong>${studentName}</strong>,</p>

        <p>
          Your application for the position of
          <strong>${jobTitle}</strong> at <strong>${companyName}</strong>
          has been <strong>approved</strong> by your mentor
          <strong>${mentorName}</strong> on <strong>CampusHire</strong>.
        </p>

        <p>
          This means your application has moved forward in the hiring process.
          Further updates will be shared with you by the company.
        </p>

        <p>
          Please keep checking your dashboard for the next steps.
        </p>

        <p>
          Best wishes!
        </p>

        <p>
          — Team CampusHire
        </p>
      `
      : `
        <h2>Application Update</h2>

        <p>Hello <strong>${studentName}</strong>,</p>

        <p>
          Your application for the position of
          <strong>${jobTitle}</strong> at <strong>${companyName}</strong>
          has been <strong>rejected</strong> by your mentor
          <strong>${mentorName}</strong> on <strong>CampusHire</strong>.
        </p>

        <p>
          While this application did not move forward, we encourage you
          to continue applying for other opportunities available on the platform.
        </p>

        <p>
          Keep building your profile and skills — better opportunities await.
        </p>

        <p>
          — Team CampusHire
        </p>
      `;

  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: studentEmail,
    subject,
    html,
  });
};


export const sendStudentsCredentialsMail = async (data) => {
  const { name, email, password, rollNo } = data;
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: `New Job Opportunity Posted – CampusHire`,
    html: `
      <h2>Your Student Account Has Been Created 🎓</h2>

      <p>Hello <strong>${rollNo}- ${name}</strong>,</p>

      <p>
        Your student account has been successfully created on
        <strong>CampusHire</strong>.
        CampusHire helps students explore job opportunities, apply for campus
        placements, and track their application status in one place.
      </p>

      <p>
        You can log in using the following credentials:
      </p>

      <p>
        <strong>Email:</strong> ${email}<br />
        <strong>Temporary Password:</strong> ${password}
      </p>

      <p>
        For security reasons, please log in and change your password immediately
        after your first login.
      </p>

      <p>
        Once logged in, you can:
      </p>

      <ul>
        <li>View and apply for job postings</li>
        <li>Track your application status</li>
        <li>Interact with mentors and placement teams</li>
      </ul>

      <p>
        If you were not expecting this email, please contact your college
        administrator.
      </p>

      <p>
        — Team CampusHire
      </p>
    `,
  });
};



export const sendStudentJobAppliedMail = async (data) => {
  const { jobTitle, studentName, companyName,email } = data;
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: `Application Submitted – ${jobTitle} | CampusHire`,
    html: `
      <h2>Application Submitted Successfully 📄</h2>

      <p>Hello <strong>${studentName}</strong>,</p>

      <p>
        You have successfully applied for the position of
        <strong>${jobTitle}</strong> at <strong>${companyName}</strong>
        through <strong>CampusHire</strong>.
      </p>

      <p>
        Your application is now under review. You can track the status of
        your application anytime from your CampusHire dashboard.
      </p>

      <p>
        Staying updated helps you prepare for next steps such as interviews
        or assessments.
      </p>

      <p>
        We wish you the best in your application process.
      </p>

      <p>
        — Team CampusHire
      </p>
    `,
  });
};


export const sendPasswordChangeMail = async (data) => {
  const { name, email } = data;
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: `Your CampusHire Password Has Been Changed`,
    html: `
      <h2>Password Changed Successfully 🔐</h2>

      <p>Hello <strong>${name}</strong>,</p>

      <p>
        This is a confirmation that the password for your
        <strong>CampusHire</strong> account has been successfully changed.
      </p>

      <p>
        If you made this change, no further action is required.
      </p>

      <p>
        If you did <strong>not</strong> change your password, please take the
        following steps immediately:
      </p>

      <ul>
        <li>Log in and reset your password again</li>
        <li>Contact your administrator or support team</li>
      </ul>

      <p>
        Keeping your account secure helps protect your data and activity
        on CampusHire.
      </p>

      <p>
        — Team CampusHire
      </p>
    `,
  });
};