# camihn-hackathon-service

This is the **backend service** for CAMIHN Hackathon registrations and payments.

It is a Next.js (App Router) app that exposes APIs for:

- Creating team registrations for the hackathon
- Initiating a team registration payment (Fapshi)
- Handling Fapshi webhooks to mark teams as PAID
- Volunteer referral links: admins create volunteers (name, email, phone) and get unique registration links; teams using those links are attributed to the volunteer for statistics

## Tech stack

- Next.js 16 (App Router)
- TypeScript
- Prisma + PostgreSQL
- Fapshi Payments API

## Getting Started (local)

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

Create a `.env` file:

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
APP_BASE_URL=http://localhost:5173
FAPSHI_API_BASE_URL=https://sandbox.fapshi.com
FAPSHI_API_USER=your_api_user
FAPSHI_API_KEY=your_api_key
# Required in production: verifies webhook requests are from Fapshi (HMAC-SHA256).
FAPSHI_WEBHOOK_SECRET=your_webhook_secret
# Admin credentials for hackathon admin panel
HACKATHON_ADMIN_USERNAME=your_admin_username
HACKATHON_ADMIN_PASSWORD=your_admin_password
HACKATHON_ADMIN_TOKEN=your_random_long_token
```

3. Run Prisma migrations:

```bash
npx prisma migrate dev --name init
# If you have existing data and are adding volunteers:
npx prisma migrate dev --name add_volunteers
```

4. Start the dev server:

```bash
npm run dev
```

The service will be available at `http://localhost:3000`.

## Payment security

- **Amount**: The payment amount is set only on the server (`register-team`). The client cannot change it.
- **Secrets**: `FAPSHI_API_USER`, `FAPSHI_API_KEY`, and `FAPSHI_WEBHOOK_SECRET` are read from the environment and never exposed to the frontend.
- **Webhook verification**: When `FAPSHI_WEBHOOK_SECRET` is set, incoming Fapshi webhooks are verified with HMAC-SHA256. Requests with a missing or invalid signature are rejected (401). **Set this in production** so only Fapshi can mark payments as successful.
- **Idempotency**: The webhook handler does not overwrite a payment that is already `SUCCESS` with `FAILED`, avoiding issues from out-of-order or duplicate webhooks.

