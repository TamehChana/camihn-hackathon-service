import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Shape this to match Fapshi's webhook payload from:
// https://docs.fapshi.com/en/api-reference
type FapshiWebhookPayload = {
  reference: string;
  status: "SUCCESS" | "FAILED" | string;
  amount?: number;
  currency?: string;
  // ...other fields...
};

export async function POST(req: NextRequest) {
  try {
    const signature = req.headers.get("x-fapshi-signature");
    const rawBody = await req.text();

    // TODO: Implement signature verification logic using Fapshi's recommended method.
    // This typically involves computing an HMAC with a shared secret and
    // comparing it to the signature header. See:
    // https://docs.fapshi.com/en/guides/webhooks
    if (!signature || !process.env.FAPSHI_WEBHOOK_SECRET) {
      console.warn("Missing Fapshi signature or webhook secret; skipping verification.");
    } else {
      // verifySignature(rawBody, signature, process.env.FAPSHI_WEBHOOK_SECRET);
    }

    const payload = JSON.parse(rawBody) as FapshiWebhookPayload;
    const providerRef = payload.reference;

    if (!providerRef) {
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const payment = await prisma.payment.findUnique({
      where: {
        provider_providerRef: {
          provider: "FAPSHI",
          providerRef,
        },
      },
    });

    if (!payment) {
      console.warn("Payment not found for Fapshi reference", providerRef);
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const newStatus = payload.status.toUpperCase();

    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: newStatus === "SUCCESS" ? "SUCCESS" : "FAILED",
        rawPayload: payload as unknown as object,
      },
    });

    if (updatedPayment.status === "SUCCESS") {
      await prisma.team.update({
        where: { id: payment.teamId },
        data: { status: "PAID" },
      });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Fapshi webhook error", error);
    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }
}


