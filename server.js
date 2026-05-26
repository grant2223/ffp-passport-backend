// ============================================================================
// FFP Passport — Backend (v2 — minimal)
// ============================================================================
// Single purpose: handle Stripe webhook → create Supabase Auth user + members row.
//
// Everything else is now handled by:
//   - Supabase Auth (login, OTP codes, session tokens)
//   - Supabase JS client directly from the frontend (all data reads/writes)
//
// All previous endpoints (/api/auth/*, /api/members/*, /api/meetups/*, /api/calorie/*,
// /api/visits/*) have been retired. They return 410 Gone if accidentally hit.
//
// Env vars required:
//   STRIPE_SECRET_KEY        — Stripe API secret key
//   STRIPE_WEBHOOK_SECRET    — Stripe webhook signing secret (whsec_...)
//   SUPABASE_URL             — Supabase project URL
//   SUPABASE_SERVICE_KEY     — Supabase service_role key (NOT the anon key)
// ============================================================================

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const app = express();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2022-08-01'
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

// CORS — allow browser calls for health check and future direct calls
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ────────────────────────────────────────────────────────────────────────────
// STRIPE WEBHOOK — must come BEFORE express.json() because Stripe signature
// verification requires the raw request body bytes.
// ────────────────────────────────────────────────────────────────────────────
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  // 1. Verify signature
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, secret);
  } catch (err) {
    console.error('[stripe-webhook] signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // 2. Only care about completed checkouts
  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, ignored: event.type });
  }

  const session = event.data.object;
  const email = session.customer_details?.email;
  const fullName = session.customer_details?.name || null;
  const stripeSessionId = session.id;
  const stripeCustomerId = session.customer || null;

  if (session.payment_status !== 'paid') {
    return res.status(200).json({ received: true, ignored: 'not_paid' });
  }
  if (!email) {
    console.error('[stripe-webhook] no email in session:', stripeSessionId);
    return res.status(400).json({ error: 'No email in session' });
  }

  try {
    // 3. Idempotency check — has this email already been processed?
    const { data: existing, error: lookupError } = await supabase
      .from('members')
      .select('id, paid')
      .eq('email', email)
      .maybeSingle();

    if (lookupError) {
      console.error('[stripe-webhook] lookup failed:', lookupError);
      return res.status(500).json({ error: 'Lookup failed' });
    }

    let userId;

    if (existing) {
      // Member exists — just mark paid if not already
      userId = existing.id;
      if (!existing.paid) {
        await supabase
          .from('members')
          .update({
            paid: true,
            stripe_session_id: stripeSessionId,
            stripe_customer_id: stripeCustomerId
          })
          .eq('id', userId);
      }
      console.log('[stripe-webhook] existing member updated:', email);
    } else {
      // 4. Create Supabase Auth user (email_confirm=true — payment proves identity)
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: fullName }
      });

      if (authError) {
        console.error('[stripe-webhook] auth user creation failed:', authError);
        return res.status(500).json({ error: 'Auth creation failed' });
      }

      userId = authData.user.id;

      // 5. Generate referral code: first name + 4-char UUID slice
      //    Example: "Grant Goes" + uuid abc12... → "GRANTABC1"
      const firstName = (fullName || 'FFP').split(' ')[0];
      const namePart = firstName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'FFP';
      const idPart = userId.replace(/-/g, '').toUpperCase().slice(0, 4);
      const referralCode = namePart + idPart;

      // 6. Generate passport number: FFP-2026-XXXX
      const passportNo = `FFP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9999 + 1)).padStart(4, '0')}`;

      // 7. Insert members row
      const { error: insertError } = await supabase.from('members').insert({
        id: userId,
        email,
        full_name: fullName,
        passport_no: passportNo,
        tier: 'member',
        balance_aed: 0,
        referral_code: referralCode,
        paid: true,
        stripe_session_id: stripeSessionId,
        stripe_customer_id: stripeCustomerId,
        profile_complete: false
      });

      if (insertError) {
        console.error('[stripe-webhook] member insert failed:', insertError);
        // Rollback: clean up the orphaned auth user
        await supabase.auth.admin.deleteUser(userId);
        return res.status(500).json({ error: 'Member insert failed' });
      }

      console.log('[stripe-webhook] new member created:', email, userId);
    }

    // 8. Trigger welcome email with 6-digit OTP code via Supabase Auth.
    //    Supabase sends this through your configured SMTP (Resend).
    //    The email template MUST include {{ .Token }} for the 6-digit code.
    //    Configure at: Supabase Dashboard → Authentication → Email Templates → Magic Link
    const { error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email
    });

    if (linkError) {
      // Non-fatal — member is created, they can request a code from login.html
      console.error('[stripe-webhook] welcome email failed (non-fatal):', linkError);
    }

    return res.status(200).json({ received: true, member_id: userId });
  } catch (err) {
    console.error('[stripe-webhook] unexpected error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// JSON parser for all other routes (health check, retired endpoints)
app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ffp-passport-backend',
    version: '2.0',
    note: 'Backend reduced to Stripe webhook only. All data + auth now via Supabase.'
  });
});

// Catch retired endpoints with a helpful message instead of a 404
app.all('/api/*', (req, res) => {
  res.status(410).json({
    error: 'This endpoint has been retired.',
    detail: 'Data access now happens directly via Supabase JS client from the frontend. Auth is handled by Supabase Auth (email OTP). This backend only handles the Stripe webhook.',
    retired_endpoint: `${req.method} ${req.path}`
  });
});

export default app;
