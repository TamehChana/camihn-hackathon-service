import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const ALLOWED_ORIGIN = process.env.APP_BASE_URL ?? "https://camihn.org";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function isAuthorized(req: NextRequest): boolean {
  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expected = process.env.HACKATHON_ADMIN_TOKEN;
  return !!expected && token === expected;
}

function generateRefCode(): string {
  return randomBytes(8).toString("hex");
}

export function OPTIONS() {
  return NextResponse.json({}, { status: 200, headers: corsHeaders });
}

/** POST: Create a new volunteer and return their unique registration link */
export async function POST(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders },
      );
    }

    const body = (await req.json()) as {
      name: string;
      email: string;
      phone: string;
    };

    const { name, email, phone } = body;
    if (!name?.trim() || !email?.trim() || !phone?.trim()) {
      return NextResponse.json(
        { error: "Name, email, and phone are required" },
        { status: 400, headers: corsHeaders },
      );
    }

    let refCode: string;
    let attempts = 0;
    const maxAttempts = 5;

    do {
      refCode = generateRefCode();
      const existing = await prisma.volunteer.findUnique({ where: { refCode } });
      if (!existing) break;
      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      return NextResponse.json(
        { error: "Failed to generate unique volunteer link" },
        { status: 500, headers: corsHeaders },
      );
    }

    const volunteer = await prisma.volunteer.create({
      data: {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        refCode,
      },
    });

    const baseUrl = process.env.APP_BASE_URL ?? "https://camihn.org";
    const registrationLink = `${baseUrl}/hackathon/register?ref=${refCode}`;

    return NextResponse.json(
      {
        id: volunteer.id,
        name: volunteer.name,
        email: volunteer.email,
        phone: volunteer.phone,
        refCode: volunteer.refCode,
        registrationLink,
        teamsCount: 0,
        paidTeamsCount: 0,
        createdAt: volunteer.createdAt,
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("hackathon admin create volunteer error", error);
    return NextResponse.json(
      { error: "Unable to create volunteer" },
      { status: 500, headers: corsHeaders },
    );
  }
}

/** GET: List all volunteers with their stats (teams registered, teams paid) */
export async function GET(req: NextRequest) {
  try {
    if (!isAuthorized(req)) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: corsHeaders },
      );
    }

    const volunteers = await prisma.volunteer.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        teams: {
          include: {
            payments: {
              where: { status: "SUCCESS" },
              take: 1,
            },
          },
        },
      },
    });

    const baseUrl = process.env.APP_BASE_URL ?? "https://camihn.org";

    const data = volunteers.map((v) => {
      const teamsCount = v.teams.length;
      const paidTeamsCount = v.teams.filter(
        (t) => t.payments && t.payments.length > 0,
      ).length;

      return {
        id: v.id,
        name: v.name,
        email: v.email,
        phone: v.phone,
        refCode: v.refCode,
        registrationLink: `${baseUrl}/hackathon/register?ref=${v.refCode}`,
        teamsCount,
        paidTeamsCount,
        createdAt: v.createdAt,
      };
    });

    return NextResponse.json(data, { headers: corsHeaders });
  } catch (error) {
    console.error("hackathon admin volunteers list error", error);
    return NextResponse.json(
      { error: "Unable to fetch volunteers" },
      { status: 500, headers: corsHeaders },
    );
  }
}
