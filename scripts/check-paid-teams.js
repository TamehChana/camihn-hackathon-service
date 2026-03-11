/**
 * Check how many hackathon teams have a successful payment in the DB.
 * Run from repo root: cd camihn-hackathon-service && npm run prisma:generate && node scripts/check-paid-teams.js
 * Requires DATABASE_URL in .env or environment.
 */
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const byStatus = await prisma.payment.groupBy({
    by: ["status"],
    _count: { id: true },
  });
  const successPayments = await prisma.payment.findMany({
    where: { status: "SUCCESS" },
    include: {
      team: {
        select: {
          id: true,
          teamName: true,
          leadEmail: true,
          status: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const allPayments = await prisma.payment.findMany({
    include: {
      team: { select: { teamName: true, leadEmail: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  console.log("\n--- Hackathon payment counts by status ---");
  byStatus.forEach((s) => console.log(`  ${s.status}: ${s._count.id}`));
  console.log("\n--- All hackathon payments (match providerRef with Fapshi) ---");
  console.log("  Total records:", allPayments.length);
  allPayments.forEach((p, i) => {
    console.log(
      `  ${i + 1}. [${p.status}] ${p.team?.teamName ?? p.teamId} | ${p.amount} ${p.currency} | providerRef: ${p.providerRef} | id: ${p.id}`
    );
  });
  console.log("\n--- Teams with at least one SUCCESS payment ---");
  console.log("  Count:", successPayments.length);
  if (successPayments.length > 0) {
    console.log("\n  List:");
    successPayments.forEach((p, i) => {
      console.log(
        `  ${i + 1}. ${p.team?.teamName ?? p.teamId} | ${p.amount} ${p.currency} | providerRef: ${p.providerRef} | updated: ${p.updatedAt.toISOString()}`
      );
    });
  }
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
