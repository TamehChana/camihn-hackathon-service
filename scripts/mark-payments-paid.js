/**
 * Mark hackathon payment(s) as SUCCESS and team(s) as PAID by providerRef.
 * Use when Fapshi shows payment successful but our webhook didn't update.
 *
 * Usage (from camihn-hackathon-service):
 *   node scripts/mark-payments-paid.js "CAMIHN-xxx-123" "CAMIHN-yyy-456"
 * Or with env:
 *   set MARK_PAID_REFS=CAMIHN-xxx-123,CAMIHN-yyy-456
 *   node scripts/mark-payments-paid.js
 *
 * Requires DATABASE_URL and prisma generate.
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const refsFromEnv = process.env.MARK_PAID_REFS;
  const refsFromArgs = process.argv.slice(2).filter((a) => a.startsWith("CAMIHN-"));
  const providerRefs = refsFromArgs.length
    ? refsFromArgs
    : refsFromEnv
      ? refsFromEnv.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

  if (providerRefs.length === 0) {
    console.log("Usage: node scripts/mark-payments-paid.js <providerRef1> [providerRef2 ...]");
    console.log("   Or: set MARK_PAID_REFS=ref1,ref2  then node scripts/mark-payments-paid.js");
    console.log("\nGet providerRefs from: npm run check-paid-teams (match with Fapshi dashboard)");
    process.exit(1);
  }

  for (const providerRef of providerRefs) {
    const payment = await prisma.payment.findFirst({
      where: { provider: "FAPSHI", providerRef },
      include: { team: { select: { teamName: true } } },
    });
    if (!payment) {
      console.warn("Not found:", providerRef);
      continue;
    }
    if (payment.status === "SUCCESS") {
      console.log("Already SUCCESS:", payment.team?.teamName, "|", providerRef);
      continue;
    }
    await prisma.$transaction([
      prisma.payment.update({
        where: { id: payment.id },
        data: { status: "SUCCESS" },
      }),
      prisma.team.update({
        where: { id: payment.teamId },
        data: { status: "PAID" },
      }),
    ]);
    console.log("Marked PAID:", payment.team?.teamName, "|", providerRef);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
