import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

type TeamMemberInput = { name: string; email: string; role?: string };

type RegisterTeamPayload = {
  teamName: string;
  institution?: string;
  lead: {
    name: string;
    email: string;
    phone: string;
    role: string;
  };
  members: TeamMemberInput[];
};

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
    const body = (await req.json()) as RegisterTeamPayload;
    const { teamName, institution, lead, members } = body;

    if (!teamName || !lead?.name || !lead?.email || !lead?.phone || !lead?.role) {
      return NextResponse.json(
        { error: "Missing required team or lead fields" },
        { status: 400, headers: corsHeaders },
      );
    }

    const cleanedMembers = (members || []).filter((m) => m.name && m.email);
    if (cleanedMembers.length === 0) {
      return NextResponse.json(
        { error: "At least one teammate is required" },
        { status: 400, headers: corsHeaders },
      );
    }

    // 1) Create team + members in Postgres
    const team = await prisma.team.create({
      data: {
        teamName,
        institution,
        leadName: lead.name,
        leadEmail: lead.email,
        leadPhone: lead.phone,
        leadRole: lead.role,
        members: {
          create: cleanedMembers.map((m) => ({
            name: m.name,
            email: m.email,
            role: m.role ?? null,
          })),
        },
      },
    });

    const amount = 1_000;
    const currency = "XAF";

    // 2) Create payment link with Fapshi (Generate Payment Link / initiate-pay)
    const reference = `CAMIHN-${team.id}-${Date.now()}`;

    const rawApiUser = process.env.FAPSHI_API_USER;
    const rawApiKey = process.env.FAPSHI_API_KEY;
    const apiUser = rawApiUser?.trim();
    const apiKey = rawApiKey?.trim();

    if (!apiUser || !apiKey) {
      console.error("Fapshi configuration error: missing FAPSHI_API_USER or FAPSHI_API_KEY");
      return NextResponse.json(
        { error: "Payment configuration error" },
        { status: 500, headers: corsHeaders },
      );
    }

    console.log(
      "Fapshi apiUser (masked):",
      `${apiUser.substring(0, 6)}...`,
      "len:",
      apiUser.length,
    );

    const fapshiResponse = await fetch(
      `${process.env.FAPSHI_API_BASE_URL ?? "https://sandbox.fapshi.com"}/initiate-pay`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey,
          apiuser: apiUser,
        },
        body: JSON.stringify({
          amount,
          email: lead.email,
          redirectUrl: `${process.env.APP_BASE_URL}/hackathon/register/success?teamId=${team.id}`,
          userId: team.id,
          externalId: reference,
          message: "CAMIHN Hackathon Team Registration",
        }),
      },
    );

    if (!fapshiResponse.ok) {
      const rawError = await fapshiResponse.text();
      console.error("Fapshi error", rawError);

      let parsed: { message?: string } | null = null;
      try {
        parsed = JSON.parse(rawError);
      } catch {
        // ignore JSON parse error
      }

      return NextResponse.json(
        {
          error: parsed?.message || "Unable to initiate payment with Fapshi",
          providerMessage: rawError,
        },
        { status: 502, headers: corsHeaders },
      );
    }

    const fapshiData = (await fapshiResponse.json()) as {
      message?: string;
      link?: string;
      transId?: string;
      dateInitiated?: string;
      [key: string]: unknown;
    };

    if (!fapshiData.link) {
      return NextResponse.json(
        { error: "Fapshi did not return a payment link" },
        { status: 502, headers: corsHeaders },
      );
    }

    const providerRef = fapshiData.transId ?? reference;

    // 3) Persist payment record
    await prisma.payment.create({
      data: {
        teamId: team.id,
        amount,
        currency,
        provider: "FAPSHI",
        providerRef,
        status: "INITIATED",
        rawPayload: fapshiData as unknown as object,
      },
    });

    // 4) Respond to frontend with payment link
    return NextResponse.json(
      {
        teamId: team.id,
        payment: {
          amount,
          currency,
          provider: "FAPSHI",
          link: fapshiData.link,
          transId: providerRef,
          message: fapshiData.message ?? "Payment link generated",
        },
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    console.error("register-team error", error);
    return NextResponse.json(
      { error: "Unable to create registration" },
      { status: 500, headers: corsHeaders },
    );
  }
}
