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

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RegisterTeamPayload;
    const { teamName, institution, lead, members } = body;

    if (!teamName || !lead?.name || !lead?.email || !lead?.phone || !lead?.role) {
      return NextResponse.json(
        { error: "Missing required team or lead fields" },
        { status: 400 },
      );
    }

    const cleanedMembers = (members || []).filter((m) => m.name && m.email);
    if (cleanedMembers.length === 0) {
      return NextResponse.json(
        { error: "At least one teammate is required" },
        { status: 400 },
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

    // 2) Create payment with Fapshi
    // NOTE: Replace URL, headers, and payload with the exact values from:
    // https://docs.fapshi.com/en/api-reference
    const reference = `CAMIHN-${team.id}-${Date.now()}`;

    const fapshiResponse = await fetch(
      `${process.env.FAPSHI_API_BASE_URL ?? ""}/payments`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.FAPSHI_SECRET_KEY}`,
        },
        body: JSON.stringify({
          amount,
          currency,
          reference,
          description: "CAMIHN Hackathon Team Registration",
          // Adjust field names to Fapshi's spec:
          customer: {
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
          },
          // Where Fapshi should redirect the user after payment:
          success_url: `${process.env.APP_BASE_URL}/hackathon/register/success`,
          cancel_url: `${process.env.APP_BASE_URL}/hackathon/register/cancel`,
          // Webhook URL is typically configured in the Fapshi dashboard,
          // but can also be passed here if supported.
        }),
      },
    );

    if (!fapshiResponse.ok) {
      console.error("Fapshi error", await fapshiResponse.text());
      return NextResponse.json(
        { error: "Unable to initiate payment with Fapshi" },
        { status: 502 },
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
        { status: 502 },
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
    return NextResponse.json({
      teamId: team.id,
      payment: {
        amount,
        currency,
        provider: "FAPSHI",
        checkoutUrl,
      },
    });
  } catch (error) {
    console.error("register-team error", error);
    return NextResponse.json(
      { error: "Unable to create registration" },
      { status: 500 },
    );
  }
}


