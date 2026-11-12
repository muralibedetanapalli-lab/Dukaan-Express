import { NextResponse } from "next/server";

/** SMS OTP login is switched off for now: customers sign up and log in with email + password (see /auth/signup, /auth/login). */
export function POST() {
  return NextResponse.json({ error: { code: "GONE", message: "OTP login is disabled. Please log in with your email or mobile number and password." } }, { status: 410 });
}
