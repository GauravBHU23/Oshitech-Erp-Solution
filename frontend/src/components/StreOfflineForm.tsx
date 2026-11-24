"use client";

import { streClassLabel, streSchoolFieldLabel, type StrePublicReg } from "@/lib/stre";

type Exam = { title: string; code: string; exam_date: string; exam_time: string; last_date: string; fee: string; venue: string; instructions: string };

function Field({ label, value, wide = false }: { label: string; value?: string; wide?: boolean }) {
  return (
    <div className={wide ? "stre-form-field stre-form-field-wide" : "stre-form-field"}>
      <span>{label}</span>
      <b>{value?.trim() || " "}</b>
    </div>
  );
}

export default function StreOfflineForm({
  values,
  interests,
  exam,
  result,
}: {
  values?: Record<string, string>;
  interests?: string[];
  exam: Exam;
  result?: StrePublicReg;
}) {
  const v = values ?? {};
  const confirmation = !!result;

  return (
    <article className="stre-offline-form">
      <header>
        <p>STUDENT TALENT RECOGNITION EXAM</p>
        <h1>{confirmation ? "STRE Registration Acknowledgement" : "STRE Offline Registration Form"}</h1>
        <span>{exam.title} ({exam.code})</span>
      </header>

      {confirmation ? (
        <div className="stre-form-confirmation">
          <div><span>Registration number</span><b>{result.registration_no}</b></div>
          <div><span>Status</span><b>{result.status_label}</b></div>
          <div><span>Roll number</span><b>{result.roll_no || "To be issued"}</b></div>
        </div>
      ) : (
        <p className="stre-form-note">Please fill in block letters. This sheet can be printed and kept for your records. Submit the online form to complete registration.</p>
      )}

      <section>
        <h2>Student details</h2>
        <div className="stre-form-grid">
          <Field label="First name" value={confirmation ? result.full_name : v.first_name} wide={!confirmation} />
          {!confirmation && <Field label="Last name" value={v.last_name} />}
          <Field label="Father's name" value={confirmation ? undefined : v.father_name} />
          <Field label="Class / qualification" value={confirmation ? undefined : streClassLabel(v.class_level)} />
          <Field label={streSchoolFieldLabel(v.class_level)} value={confirmation ? undefined : v.school_name} wide />
          <Field label="Mobile number" value={confirmation ? result.mobile : v.mobile} />
          <Field label="Email" value={confirmation ? result.email : v.email} />
          <Field label="Aadhaar number" value={confirmation ? undefined : v.aadhaar_number} />
          <Field label="Subject" value={confirmation ? result.subject : v.subject} />
          <Field label="Address" value={confirmation ? undefined : v.address} wide />
        </div>
      </section>

      {!confirmation && (
        <section>
          <h2>Interests and goals</h2>
          <div className="stre-form-grid">
            <Field label="Hobbies / interests" value={interests?.join(", ")} wide />
            <Field label="Subject interest" value={v.subject_interest} wide />
            <Field label="Aim of life" value={v.aim_of_life} wide />
          </div>
        </section>
      )}

      <section>
        <h2>Exam details</h2>
        <div className="stre-form-grid">
          <Field label="Exam date (tentative)" value={exam.exam_date} />
          <Field label="Reporting / exam time" value={exam.exam_time || "To be announced"} />
          <Field label="Registration closes" value={exam.last_date} />
          <Field label="Registration fee" value={Number(exam.fee) > 0 ? `Rs. ${Number(exam.fee).toLocaleString("en-IN")}` : "Free"} />
          <Field label="Venue" value={exam.venue || "To be announced"} wide />
        </div>
      </section>

      <footer>
        <div><span>Student signature</span></div>
        <div><span>Parent / guardian signature</span></div>
      </footer>
    </article>
  );
}
