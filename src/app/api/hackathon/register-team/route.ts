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

    const amount = 10_000;
    const currency = "XAF";

    // 2) Create payment with Fapshi (Initiate Pay)
    const reference = `CAMIHN-${team.id}-${Date.now()}`;

    const fapshiResponse = await fetch(
      `${process.env.FAPSHI_API_BASE_URL ?? "https://sandbox.fapshi.com"}/initiate-pay`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Adjust auth headers to match Fapshi docs (API User + API Key)
          "X-API-USER": process.env.FAPSHI_API_USER ?? "",
          "X-API-KEY": process.env.FAPSHI_API_KEY ?? "",
        },
        body: JSON.stringify({
          amount,
          currency,
          reference,
          description: "CAMIHN Hackathon Team Registration",
          customer: {
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
          },
          success_url: `${process.env.APP_BASE_URL}/hackathon/register/success`,
          cancel_url: `${process.env.APP_BASE_URL}/hackathon/register/cancel`,
        }),
      },
    );

    if (!fapshiResponse.ok) {
      console.error("Fapshi error", await fapshiResponse.text());
      return NextResponse.json(
        { error: "Unable to initiate payment with Fapshi" },
        { status: 502, headers: corsHeaders },
      );
    }

    const fapshiData = (await fapshiResponse.json()) as {
      checkout_url?: string;
      reference?: string;
      [key: string]: unknown;
    };

    const checkoutUrl = fapshiData.checkout_url;
    const providerRef = (fapshiData.reference as string) ?? reference;

    if (!checkoutUrl) {
      return NextResponse.json(
        { error: "Fapshi did not return a checkout URL" },
        { status: 502, headers: corsHeaders },
      );
    }

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

    // 4) Respond to frontend with checkout URL
    return NextResponse.json(
      {
        teamId: team.id,
        payment: {
          amount,
          currency,
          provider: "FAPSHI",
          checkoutUrl,
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
