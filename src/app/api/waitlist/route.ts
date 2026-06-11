import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { db } from "@/lib/firebase-admin";
import { sendEmail } from "@/lib/email/client";
import { waitlistConfirmationEmail } from "@/lib/email/templates";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  let email: string;
  try {
    const body = await request.json();
    email = String(body?.email ?? "").trim().toLowerCase();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  try {
    const ref = db.collection("waitlist").doc(email);
    const existing = await ref.get();
    const isNew = !existing.exists;

    await ref.set(
      {
        email,
        source: "landing",
        ...(isNew ? { createdAt: admin.firestore.FieldValue.serverTimestamp() } : {}),
      },
      { merge: true }
    );

    // Send the confirmation only on first signup — don't re-email duplicate
    // submits. Failures here must not fail the request (sendEmail never throws).
    if (isNew) {
      const result = await sendEmail(email, waitlistConfirmationEmail());
      await ref.set(
        {
          confirmationSent: result.sent,
          confirmationSentAt: result.sent
            ? admin.firestore.FieldValue.serverTimestamp()
            : null,
        },
        { merge: true }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[waitlist POST]", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
