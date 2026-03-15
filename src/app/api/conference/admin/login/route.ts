import { NextRequest, NextResponse } from "next/server";
import { getCorsHeaders } from "@/lib/cors";

export function OPTIONS(req: NextRequest) {
  return NextResponse.json({}, { status: 200, headers: getCorsHeaders(req, { methods: "POST, OPTIONS" }) });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { username?: string; password?: string };
    const username = body.username ?? "";
    const password = body.password ?? "";

    const expectedUsername = process.env.CONFERENCE_ADMIN_USERNAME;
    const expectedPassword = process.env.CONFERENCE_ADMIN_PASSWORD;
    const adminToken = process.env.CONFERENCE_ADMIN_TOKEN;

    if (!expectedUsername || !expectedPassword || !adminToken) {
      console.error("Conference admin env vars missing");
      return NextResponse.json(
        { error: "Conference admin not configured" },
        { status: 500, headers: getCorsHeaders(req) },
      );
    }

    if (username !== expectedUsername || password !== expectedPassword) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401, headers: getCorsHeaders(req) },
      );
    }

    return NextResponse.json(
      { token: adminToken },
      { status: 200, headers: getCorsHeaders(req) },
    );
  } catch (error) {
    console.error("conference admin login error", error);
    return NextResponse.json(
      { error: "Unable to login" },
      { status: 500, headers: getCorsHeaders(req) },
    );
  }
}

