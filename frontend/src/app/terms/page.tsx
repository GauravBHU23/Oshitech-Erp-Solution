import type { Metadata } from "next";
import LegalPage, { type LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms & Conditions | Oshitech Education ERP",
  description: "Terms for using the Oshitech Education ERP portals and the STRE (Student Talent Recognition Exam) registration.",
};

const sections: LegalSection[] = [
  { id: "acceptance", title: "Acceptance of these terms", body: [
    "These Terms & Conditions apply to the Oshitech Education ERP website, its portals (Super Admin, School Admin, Teacher, Exam Controller, Student and the Upcoming Exam portal) and the STRE – Student Talent Recognition Exam registration.",
    "By using the website, signing in, or registering for STRE, you agree to these terms. If the user is a minor, a parent or guardian must read and accept these terms on their behalf.",
  ] },
  { id: "accounts", title: "Accounts and access", body: [
    "Portal accounts are created or approved by the school (or the platform administrator). Each person can only see and change the information their role allows.",
    [
      "Keep your password secret. You are responsible for activity done with your account.",
      "Sessions sign out automatically after a period of inactivity; always sign out on shared devices.",
      "If you forget your password, use “Forgot password” on the login page. If your account is locked or disabled, contact your school office.",
      "The school may block or remove an account that is misused.",
    ],
  ] },
  { id: "use", title: "Acceptable use", body: [
    "You agree not to:",
    [
      "give false information, impersonate another person, or register on someone else’s behalf without permission;",
      "try to access records, accounts or pages you are not allowed to see;",
      "upload harmful files, attack, overload or copy the website by automated means;",
      "share other people’s personal data (marks, phone numbers, documents) without permission.",
    ],
  ] },
  { id: "stre", title: "STRE registration rules", body: [
    [
      "Fill in correct details. The email must be verified with the OTP sent to it.",
      "Only one registration is allowed per email address and per mobile number for an exam.",
      "The registration fee is shown before payment. Registration is confirmed only after the fee is received and verified.",
      "Admit cards are issued by the STRE exam cell after verifying the registration and payment. Paying the fee does not by itself guarantee an admit card.",
      "The exam cell may correct obvious mistakes on request, and may cancel registrations with false, duplicate or incomplete information.",
      "The exam date, time, venue or schedule may change if required. Updates are sent by email and shown on the STRE pages.",
    ],
  ] },
  { id: "payments", title: "Fees, payments and refunds", body: [
    "Online payments are processed by our payment partner (Cashfree Payments). We do not see or store your card, UPI PIN or net-banking password.",
    [
      "Fees once paid are non-refundable and non-transferable.",
      "A refund is considered only if the same fee was charged more than once, or if the exam is cancelled by the organisers.",
      "If money is deducted but the payment shows as failed, it is usually confirmed automatically or reversed by your bank within 5–7 working days. Contact us with your Payment ID if it is not.",
      "School fees shown in the student portal are set by the school; questions about them should go to the school office.",
    ],
  ] },
  { id: "content", title: "Content and intellectual property", body: [
    "The website design, software and branding belong to Oshitech ERP Solutions. Schools own the records they enter. You may download or print your own documents (admit card, report card, receipts, ID card) for personal use.",
  ] },
  { id: "availability", title: "Availability and changes", body: [
    "We try to keep the service available and correct, but it may sometimes be unavailable for maintenance or reasons beyond our control. We may update features and these terms; the date at the top shows the latest version. Continued use after a change means you accept the updated terms.",
  ] },
  { id: "liability", title: "Limitation of liability", body: [
    "The service is provided “as is”. To the extent allowed by law, Oshitech ERP Solutions is not liable for indirect losses, or for losses caused by incorrect information entered by users, network or payment-partner failures, or events beyond reasonable control. Our total liability for any claim is limited to the fee paid for the specific service in question.",
  ] },
  { id: "law", title: "Governing law", body: [
    "These terms are governed by the laws of India. Disputes are subject to the jurisdiction of the courts at Varanasi, Uttar Pradesh.",
  ] },
  { id: "contact", title: "Contact", body: [
    "For questions, corrections or complaints, use the Contact Us page or raise a support request on the STRE page. Please include your registration number or Payment ID where relevant.",
  ] },
];

export default function TermsPage() {
  return (
    <LegalPage
      kicker="Legal"
      title="Terms & Conditions"
      updated="21 November 2026"
      intro="Please read these terms before using Oshitech Education ERP or registering for STRE. They explain your responsibilities, the exam rules, and how fees and refunds work."
      sections={sections}
    />
  );
}
