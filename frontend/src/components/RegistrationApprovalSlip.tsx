"use client";

import { useEffect, useState } from "react";

type RegistrationSlipBase = {
  applicationId: string;
  reference: string;
  submittedAt: string;
  schoolName: string;
  schoolCode: string;
  firstName: string;
  lastName: string;
  email: string;
  photo?: File | null;
};

export type RegistrationApprovalSlipData =
  | (RegistrationSlipBase & {
      role: "teacher";
      phone: string;
      qualification: string;
      courses: string[];
    })
  | (RegistrationSlipBase & {
      role: "student";
      phone: string;
      dateOfBirth: string;
      classLevel: string;
      gender: string;
      fatherName: string;
      motherName: string;
      guardianPhone: string;
      address: string;
      courseName: string;
      academicYearName: string;
      aadhaarLastFour: string;
    });

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-300 py-3">
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-slate-900">{value || "—"}</p>
    </div>
  );
}

function formatDate(value: string) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function RegistrationApprovalSlip({ data }: { data: RegistrationApprovalSlipData }) {
  const [photoUrl, setPhotoUrl] = useState("");

  useEffect(() => {
    if (!data.photo) {
      setPhotoUrl("");
      return;
    }

    const url = URL.createObjectURL(data.photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [data.photo]);

  const submittedAt = new Date(data.submittedAt).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });

  const isStudent = data.role === "student";

  return (
    <article className="registration-approval-slip mx-auto mt-6 w-full max-w-[194mm] border border-slate-300 bg-white p-7 text-slate-900 shadow-sm">
      <header className="border-b-2 border-slate-900 pb-5 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-700">
          {isStudent ? "Student admission application" : "Teacher application"}
        </p>
        <h2 className="mt-2 text-2xl font-extrabold uppercase tracking-wide">{data.schoolName}</h2>
        <p className="mt-1 text-xs text-slate-600">School code: {data.schoolCode}</p>
        <h1 className="mt-5 text-lg font-bold uppercase">
          {isStudent ? "Student Registration & Approval Slip" : "Teacher Registration & Approval Slip"}
        </h1>
      </header>

      <div className="mt-5 flex items-start justify-between gap-5">
        <div className="grid flex-1 grid-cols-2 gap-x-6">
          <Field label="Application reference" value={data.reference} />
          <Field label="Application status" value="Pending school approval" />
          <Field label="Submitted on (IST)" value={submittedAt} />
          <Field label="Application ID" value={data.applicationId} />
        </div>
        {photoUrl && (
          <img
            src={photoUrl}
            alt="Applicant"
            className="h-[34mm] w-[28mm] border border-slate-400 object-cover"
          />
        )}
      </div>

      <section className="mt-6">
        <h3 className="border-b border-slate-400 pb-2 text-xs font-extrabold uppercase tracking-[0.12em]">
          Applicant details
        </h3>
        <div className="grid grid-cols-2 gap-x-8">
          <Field label="Full name" value={`${data.firstName} ${data.lastName}`.trim()} />
          <Field label="Email address" value={data.email} />
          <Field label={isStudent ? "Student phone" : "Phone number"} value={data.phone} />
          {isStudent ? <>
            <Field label="Class" value={`Class ${data.classLevel}`} />
            <Field label="Date of birth" value={formatDate(data.dateOfBirth)} />
            <Field label="Gender" value={{ M: "Male", F: "Female", O: "Other" }[data.gender] ?? "—"} />
            <Field label="Father's name" value={data.fatherName} />
            <Field label="Mother's name" value={data.motherName} />
            <Field label="Parent phone" value={data.guardianPhone} />
            <Field label="Course requested" value={data.courseName || "To be assigned by school"} />
            <Field label="Academic year requested" value={data.academicYearName || "To be assigned by school"} />
            {data.aadhaarLastFour && <Field label="Aadhaar (masked)" value={`XXXX XXXX ${data.aadhaarLastFour}`} />}
            <div className="col-span-2 border-b border-slate-300 py-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">Full address</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-slate-900">{data.address}</p>
            </div>
          </> : <>
            <Field label="Highest qualification" value={data.qualification} />
            <div className="col-span-2 border-b border-slate-300 py-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">Courses the applicant can teach</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-semibold text-slate-900">
                {data.courses.map((course) => <li key={course}>{course}</li>)}
              </ul>
            </div>
          </>}
        </div>
      </section>

      <section className="mt-6 border border-slate-400 p-4">
        <h3 className="text-xs font-extrabold uppercase tracking-[0.12em]">Applicant declaration</h3>
        <p className="mt-2 text-xs leading-5 text-slate-700">
          I confirm that the information on this application is accurate and understand that school approval and
          {isStudent ? " classroom placement" : " teaching assignment"} are required before portal access is enabled.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-10 text-[10px] text-slate-600">
          <p className="border-t border-slate-500 pt-2">Applicant signature</p>
          <p className="border-t border-slate-500 pt-2">Date</p>
        </div>
      </section>

      <section className="mt-6 border-2 border-slate-700 p-4">
        <h3 className="text-xs font-extrabold uppercase tracking-[0.12em]">School office — approval decision</h3>
        <div className="mt-3 flex gap-8 text-sm font-semibold">
          <p>☐ Approved</p>
          <p>☐ Rejected</p>
        </div>
        <div className="mt-3 space-y-5">
          <p className="border-b border-slate-400 pb-2 text-[10px] text-slate-500">Remarks</p>
          <p className="border-b border-slate-400 pb-2 text-[10px] text-slate-500">&nbsp;</p>
        </div>
        <div className="mt-7 grid grid-cols-3 gap-6 text-[10px] text-slate-600">
          <p className="border-t border-slate-500 pt-2">Reviewed by</p>
          <p className="border-t border-slate-500 pt-2">Signature</p>
          <p className="border-t border-slate-500 pt-2">Date</p>
        </div>
      </section>

      <footer className="mt-5 border-t border-slate-300 pt-3 text-center text-[9px] text-slate-500">
        Keep this slip for school records. Passwords are never printed on application slips.
      </footer>
    </article>
  );
}
