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
