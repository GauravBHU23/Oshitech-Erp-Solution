import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy | Oshitech Education ERP",
  description: "How Oshitech Education ERP collects, uses and protects personal data of students, parents, teachers and STRE candidates.",
};

const sections: LegalSection[] = [
  { id: "about", title: "About this policy", body: [
    "This policy explains what personal data Oshitech Education ERP collects, why, who can see it, and how it is protected. It covers the school portals and the STRE – Student Talent Recognition Exam registration.",
    "Schools decide what student and staff data they enter and are responsible for it; we process it on their behalf to run the portals.",
  ] },
  { id: "collect", title: "Data we collect", body: [
    "School portals (entered by the school or during approved registration):",
    ["Name, email, phone, profile photo, role and school.", "Student details: admission number, class, section, date of birth, gender, father’s and mother’s name, parent phone, address, blood group.", "Academic records: attendance, marks, results, report cards, homework, leave requests, fee invoices and payments.", "Teacher details: employee ID, qualification, assigned classes."],
    "STRE registration:",
    ["Name, father’s name, email (verified by OTP), mobile, class, school name and address.", "Subject, interests, hobbies and aim of life.", "Aadhaar number, passport-size photo and signature.", "Payment status and payment reference (not card or UPI credentials)."],
    "Technical data: sign-in sessions, IP address in the security audit log, and an anonymous visitor count.",
  ] },
  { id: "use", title: "How we use the data", body: [
    ["To run the portals: accounts, classes, attendance, exams, results, ID cards, fees and notices.", "To process STRE registrations, verify payments, issue admit cards and send exam updates.", "To send service emails: OTPs, password reset codes, registration, payment and admit-card emails, and support replies.", "To keep the service secure: preventing misuse, investigating problems and keeping an audit trail of important changes."],
    "We do not sell personal data and do not use it for advertising.",
  ] },
  { id: "aadhaar", title: "Aadhaar, photos and documents", body: [
    "Aadhaar numbers are stored encrypted. Only the last four digits are shown on admit cards, and the full number is visible only to authorised exam-cell staff for verification. For school registration requests, the Aadhaar number is removed after the application is reviewed. Photos and signatures are used only on ID cards and admit cards and are never shown publicly.",
  ] },
  { id: "sharing", title: "Who can see the data", body: [
    ["Your school’s authorised staff, each limited to their role (for example, a teacher sees only their own classes).", "The STRE exam cell, for STRE registrations only. School staff cannot see STRE data, and the exam cell cannot see school records.", "Service providers who help run the service: our email provider and our payment partner (Cashfree Payments), only as needed.", "Authorities, if required by law."],
    "Public QR verification pages show only minimal details (name, exam/school and validity), never contact details or documents.",
  ] },
  { id: "security", title: "How we protect it", body: [
    ["Passwords are stored as strong one-way hashes; one-time codes are stored hashed and expire quickly.", "Role-based access, separate school data, and an audit log of important actions.", "Sessions sign out after inactivity and expire after a fixed time.", "Email OTP verification and a Cloudflare Turnstile check on public lookups to block misuse."],
    "No system is completely secure; please keep your password private and report anything suspicious to us.",
  ] },
  { id: "cookies", title: "Cookies and local storage", body: [
    "We use essential cookies to keep you signed in securely (they cannot be read by page scripts) and to protect forms. Your browser also stores small preferences such as dark/light theme and your last activity time for automatic sign-out. We do not use advertising or tracking cookies.",
  ] },
  { id: "retention", title: "How long we keep data", body: [
    "School records are kept for as long as the school uses the service or as required by law. STRE registrations are kept for the exam session and a reasonable period afterwards for results, verification and disputes. Rejected registration applications and expired codes are removed.",
  ] },
  { id: "rights", title: "Your choices and rights", body: [
    ["Ask to see or correct your information (school portal: contact your school; STRE: raise a support request).", "Ask for deletion where it is not required to be kept by law or by the school.", "Withdraw consent for optional data by contacting us."],
    "Parents or guardians may make these requests for children.",
  ] },
  { id: "children", title: "Children’s data", body: [
    "Most students are minors. Student data is entered by schools or submitted with the involvement of a parent or guardian, and is used only for education and examination purposes.",
  ] },
  { id: "changes", title: "Changes and contact", body: [
    "We may update this policy; the date at the top shows the latest version. For privacy questions or requests, use the Contact Us page.",
  ] },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      kicker="Legal"
      title="Privacy Policy"
      updated="21 November 2026"
      intro="We respect the privacy of students, parents, teachers and STRE candidates. This page explains what we collect, why, and how we keep it safe."
      sections={sections}
    />
  );
}
