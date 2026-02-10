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

    console.log("=== FAPSHI WEBHOOK RECEIVED ===");
    console.log("Fapshi webhook raw body:", rawBody);
    console.log("Signature header:", signature ? "present" : "missing");

    // TODO: Implement signature verification logic using Fapshi's recommended method.
    // This typically involves computing an HMAC with a shared secret and
    // comparing it to the signature header. See:
    // https://docs.fapshi.com/en/guides/webhooks
    if (!signature || !process.env.FAPSHI_WEBHOOK_SECRET) {
      console.warn("Missing Fapshi signature or webhook secret; skipping verification.");
    } else {
      // verifySignature(rawBody, signature, process.env.FAPSHI_WEBHOOK_SECRET);
    }

    const payload = JSON.parse(rawBody) as FapshiWebhookPayload & {
      transId?: string;
      externalId?: string;
      [key: string]: unknown;
    };

    console.log("Parsed webhook payload:", JSON.stringify(payload, null, 2));

    const providerRef =
      payload.reference || payload.externalId || payload.transId || "";

    console.log("Looking up payment with providerRef:", providerRef);

    if (!providerRef) {
      console.warn("No providerRef found in webhook payload");
      return NextResponse.json({ received: true }, { status: 200 });
    }

    // Try to find payment by providerRef
    let payment = await prisma.payment.findUnique({
      where: {
        provider_providerRef: {
          provider: "FAPSHI",
          providerRef,
        },
      },
    });

    // If not found, try alternative lookup methods
    if (!payment) {
      console.warn("Payment not found with providerRef:", providerRef);
      
      // Try finding by transId if different
      if (payload.transId && payload.transId !== providerRef) {
        console.log("Trying to find payment by transId:", payload.transId);
        payment = await prisma.payment.findFirst({
          where: {
            provider: "FAPSHI",
            providerRef: payload.transId,
          },
        });
      }

      // If still not found, try finding by externalId
      if (!payment && payload.externalId && payload.externalId !== providerRef) {
        console.log("Trying to find payment by externalId:", payload.externalId);
        payment = await prisma.payment.findFirst({
          where: {
            provider: "FAPSHI",
            providerRef: payload.externalId,
          },
        });
      }

      if (!payment) {
        console.error("Payment not found after all lookup attempts. Available fields:", {
          reference: payload.reference,
          externalId: payload.externalId,
          transId: payload.transId,
          providerRef,
        });
        return NextResponse.json({ received: true }, { status: 200 });
      }
    }

    const newStatus = (payload.status || "").toUpperCase();
    const isSuccess = newStatus === "SUCCESS" || newStatus.startsWith("SUCCESS");

    console.log("Updating payment status:", {
      paymentId: payment.id,
      oldStatus: payment.status,
      newStatus: isSuccess ? "SUCCESS" : "FAILED",
      rawStatus: payload.status,
    });

    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: isSuccess ? "SUCCESS" : "FAILED",
        rawPayload: payload as unknown as object,
      },
    });

    if (updatedPayment.status === "SUCCESS") {
      console.log("Payment successful, updating team status to PAID for team:", payment.teamId);
      await prisma.team.update({
        where: { id: payment.teamId },
        data: { status: "PAID" },
      });
      console.log("Team status updated successfully");
    }

    console.log("=== WEBHOOK PROCESSING COMPLETE ===");
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error) {
    console.error("Fapshi webhook error", error);
    return NextResponse.json({ error: "Webhook handler error" }, { status: 500 });
  }
}


