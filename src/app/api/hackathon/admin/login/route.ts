import { NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGIN = process.env.APP_BASE_URL ?? "https://camihn.org";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { password?: string };
    const password = body.password ?? "";

    const expectedPassword = process.env.HACKATHON_ADMIN_PASSWORD;
    const adminToken = process.env.HACKATHON_ADMIN_TOKEN;

    if (!expectedPassword || !adminToken) {
      console.error("Hackathon admin env vars missing");
      return NextResponse.json(
        { error: "Admin not configured" },
        { status: 500, headers: corsHeaders },
      );
    }

    if (password !== expectedPassword) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401, headers: corsHeaders },
      );
    }

    return NextResponse.json(
      { token: adminToken },
      { status: 200, headers: corsHeaders },
    );
  } catch (error) {
    console.error("hackathon admin login error", error);
    return NextResponse.json(
      { error: "Unable to login" },
      { status: 500, headers: corsHeaders },
    );
  }
}


