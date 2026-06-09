// FFP Passport — Express Server (Vercel, CommonJS) — v87
// v87 (2026-06-09): QUESTS — /api/quests + /api/quests/:id now return created_by (so the member dashboard
//      can show the Edit-quest button to the owner — the photo can only be changed via Edit, so this also
//      unblocks swapping a quest photo). New POST /api/quests/:id/invite — a member invites chosen FFP
//      connections to "join me" on a quest; each invitee gets a bell row + phone push (via notifyMember)
//      with a deep link that opens the quest. Self-invites and the inviter are skipped.
// v86 (2026-06-09): MEET-UP REMINDERS — two windows: a DAY-BEFORE nudge (2–24h out) gated to daytime
//      (05–18 UTC = 9am–10pm UAE, so it never buzzes at 3am), and a STARTING-SOON nudge ~2h before (own
//      flag reminder_2h_sent_at so both fire). Each delivers bell + push + email. Vercel cron moved 3am→6am
//      UTC (10am UAE). NOTE: the 2h reminder needs the cron to run HOURLY — Vercel Hobby only runs it daily,
//      so an hourly external ping is required for the 2h one (day-before works on the daily run).
// v85 (2026-06-09): IN-APP BELL + PUSH together. New notifyMember(memberId, {title,body,icon,link}) helper
//      inserts a notifications-table row (bell) AND sends the phone push in one call. All event triggers now
//      use it, so meet-up request/confirm/cancel/24h-reminder, event RSVP and /api/notify/member each land in
//      the in-app bell, on the lock screen, and (where applicable) by email. Admin broadcast already did both.
// v84 (2026-06-09): PUSH TRIGGERS wired into real events — meet-up request (to host), confirmed/approved,
//      cancelled (to all attendees), the 24h "coming up" reminder cron, event RSVP, and the generic
//      /api/notify/member. Each now also fires a phone push alongside its existing email.
// v83 (2026-06-09): WEB PUSH (phone notifications). New push_subscriptions table + endpoints
//      /api/push/subscribe (upsert + welcome push), /api/push/unsubscribe, /api/push/test. Helpers
//      sendPushToMember / sendPushToAll (web-push + VAPID from env; prune dead 404/410 endpoints). Admin
//      broadcast now also delivers as a phone push to opted-in members. Needs env VAPID_PUBLIC_KEY /
//      VAPID_PRIVATE_KEY / VAPID_SUBJECT (public key has a baked default). PUSH_READY=false → safe no-op.
// v82 (2026-06-08): 7-DAY FREE TRIAL. /api/billing/checkout now starts every subscription with
//      trial_period_days:7 — the card is captured upfront (Stripe Checkout default) and the first real charge
//      lands on day 7. No other change needed: setMemberFromSubscription already treats status 'trialing' as
//      active (membership='passport'), passport_expires_at tracks current_period_end (= trial end, so an
//      un-converted trial auto-expires the gate at day 7), a cancel during trial flips membership→free via
//      customer.subscription.deleted, and creditReferralForInvoice already skips the $0 trial invoice
//      (paidUsd<=0 → no referral until real money flows at conversion).
// v81 (2026-06-08): REFERRALS — recurring + 60-day Ambassador. A referred signup gets referred_by + 60 days at
//      Ambassador tier (applyReferralOnSignup). The referrer earns their (effective) tier% of EVERY invoice on
//      that member's ORIGINAL subscription (creditReferralForInvoice in invoice.paid) — idempotent per invoice
//      (transactions.stripe_invoice_id unique). If the member lapses and re-subscribes, the new sub earns
//      nothing (referrals.stripe_subscription_id pins the original). onboard now does attribution+Ambassador and
//      only credits the legacy one-time $99 (non-subscription); subscriptions credit per-invoice. Signup checkout
//      also creates the member on payment (success → profile-complete). effectiveTier() lapses an expired
//      Ambassador back to 5%.
// v80 (2026-06-08): PASSPORT SUBSCRIPTIONS (Annual $149/yr · Monthly $20/mo). New POST /api/billing/checkout
//      creates a Stripe subscription Checkout Session tied to the signed-in member (client_reference_id +
//      metadata.member_id/plan/ref). Webhook now handles mode=subscription (checkout.session.completed →
//      grant), invoice.paid (renew → extend passport_expires_at to current_period_end), and
//      customer.subscription.deleted/updated (lapse/adjust). setMemberFromSubscription is the single source of
//      truth (status + period end → membership/plan/expiry/sub id). members gained stripe_subscription_id + plan.
//      Price IDs in env STRIPE_PRICE_ANNUAL / STRIPE_PRICE_MONTHLY (defaults baked). Legacy one-time $99 flow
//      untouched. (Enable invoice.paid + customer.subscription.* on the Stripe webhook.)
// v79 (2026-06-08): ACCOUNT EMAIL from profile-complete. The account email is now the one the member
//      confirms on profile-complete (field prefilled from the Stripe email, editable) — fixes Apple Pay /
//      wallet emails overriding what they typed. onboard accepts account_email, matches the paid row by
//      stripe_session_id (so no duplicate when the email differs), sets the row's email, and guards against
//      stealing an email already owned by another account. The Stripe webhook also matches by session_id
//      first. New GET /api/onboard/session-email prefills the field. Future: edit email from profile (syncs
//      both sites via the shared members row).
// v78 (2026-06-08): PAID-GATE FIX (urgent). The passport gate RPC (member_passport_active) requires
//      membership='passport' AND passport_expires_at>now — but the Stripe webhook + /api/onboard/from-stripe
//      only set paid=true, never membership/expiry. So paying members (Sunjay Vyas, John Haraki) were shown
//      the Join/upgrade gate despite paying. All 4 payment writes (webhook update+insert, onboard update+insert)
//      now also set membership='passport' + passport_expires_at = now+1yr. (Two stuck rows back-filled in DB.)
//      NOTE: resets expiry to +1yr on any repeat checkout — revisit when the annual/monthly plans land.
// v77 (2026-06-08): LOG ACTIVITY — distance + avg heart rate. activity_logs gained distance_km +
//      avg_heart_rate (migration); log_activity RPC takes p_distance_km + p_avg_hr (old 9-arg overload
//      dropped to avoid ambiguity). GET /api/members/:id/activity-logs now also returns distance_km +
//      avg_heart_rate so the Fitness Stats → Activity "Recent activity" list can show them.
// v76 (2026-06-08): PARTNER INSTANT SIGN-IN. POST /api/provider/signup now creates the account (verified:true,
//      providers row approved), mints a full session (token + Supabase jwt + refresh) and returns it + the
//      member row + redirect '/ffp-provider-dashboard.html', so provider-signup.html drops the new partner
//      straight into their dashboard — no email-verify click, no 6-digit code step. The email is now a WELCOME
//      guide (sendProviderWelcomeEmail): upload Experiences/Events/Trips to findfitpeople.com, create Quests /
//      Challenges. (Old sendProviderVerifyEmail + /api/provider/verify kept, now unused by the live flow.)
// v75 (2026-06-05): EMAIL CASE-INSENSITIVITY (login lockout fix). Sign-in matched email case-SENSITIVELY
//      (.eq('email', email)) while stored emails are lowercase, so a capitalized email (e.g. autocapitalized
//      first letter) made /api/auth/reset return exists:false → the v8 login screen's new gate showed "account
//      does not exist" and blocked sign-in. Now every member-touch point normalizes email to .trim().toLowerCase()
//      before lookup/insert: /api/auth/signin, /api/auth/reset, /api/auth/signup, the Stripe webhook, and
//      /api/onboard/from-stripe. (Verified all 9 existing emails were already lowercase, so this matches every
//      account and breaks none.) Pairs with login.html v9 (lowercases email client-side too).
// v74 (2026-06-05): SHARED member-notify endpoint POST /api/notify/member { to_member_id, subject, heading,
//      body } → looks up the member email + sends via Resend (branded shell). Find Fit People calls this for
//      booking-confirmation emails; pairs with a notifications-table insert for the Passport bell. (Header was
//      stale at v70 — v71 auth refresh, v72 meetup approval emails, v73 event RSVP emails were already in the
//      file; marker now reconciled to v74.)
// v70 (2026-06-04): /api/quests + /api/quests/:id now also return joined_count (how many members
//      are on each quest) for the member-created quest social hook (P2b).
// v69 (2026-06-04): MEMBER QUEST DISCOVERY — added GET /api/quests (live quests + this member's
//      progress) and GET /api/quests/:id (quest + its venues with provider names + progress). The
//      member Quests panel already calls these; they were never built, so members saw no quests.
//      Now surfaces provider venue quests (scope='venue') too. Service-role reads.
// v68 (2026-06-04): GET /api/members/:id/activity-logs now also returns duration_sec (the 0-59
//      second remainder) so the passport journey can show activity durations with seconds precision
//      (Log Activity now captures H/M/S; log_activity RPC stores duration_sec). duration_min unchanged.
// v67 (2026-06-04): ROUTE FIX — the member bell calls GET /api/notifications/<member_id> (path param),
//      but v65 defined it as /api/notifications?member_id= (query). The path-style call never matched →
//      bell got nothing → "notification not showing". Route is now /api/notifications/:member_id (still
//      reads ?member_id as fallback). Keeps no-store (v66). THIS is the fix that makes the bell populate.
// v65 (2026-06-04): NOTIFICATIONS backend (step 1 of the notifications build). The member bell UI +
//      `notifications` table already existed but the endpoints it calls were missing. Added:
//      GET /api/notifications?member_id (targeted rows + broadcast rows where member_id IS NULL; unread =
//      newer than members.notifs_seen_at — new column), POST /api/notifications/seen (sets notifs_seen_at),
//      POST /api/admin/broadcast (admin-gated; audience 'all' → member_id NULL row, or member_ids[] → one
//      targeted row each). Next: #2 handle_connection trigger, #3 host_meetup→followers, #4 broadcast UI.
// v64 (2026-06-04): Referral reward now = tier% × the ACTUAL amount the new member paid (Stripe
//      session.amount_total/100, USD) — AFTER any discount code — NOT the $99 list price. (Barry/Mike
//      paid $19.80 each via a discount → 20% = $3.96 each, not $19.80. Existing two were corrected in DB.)
// v63 (2026-06-03): USD-ONLY wallet (Grant: "platform is only USD, stop the AED"). Referral reward is
//      now computed in USD (pct × $99, no ×3.6725) and stored directly in reward_aed/amount_aed (legacy
//      column names now hold USD). Email balance summed directly (no /3.6725). admin_referral_leaderboard
//      earned_usd = sum(reward) directly. DB wallet columns (transactions/referrals/payouts/members/
//      content_submissions) had their values converted AED→USD once. No peg/conversion anywhere now.
// v62 (2026-06-03): MEET & MOVE lifecycle emails. New senders sendMeetupConfirmEmail / ReminderEmail /
//      CancelEmail (brandEmail, no emojis, meet-up detail card + Maps link, Dubai time). Event-driven via
//      POST /api/meetups/notify {kind:'confirm'|'cancel', meetup_id, member_id} — the meet-move loader
//      (v18) calls it after join_meetup (confirm to that member) and after cancel_meetup (cancel to all
//      attendees). Time-based reminder via GET /api/cron/meetup-reminders (secret-gated): meet-ups within
//      24h email each attendee once (new meetup_attendees.reminder_sent_at flag). vercel.json cron added
//      ("0 3 * * *"; sub-daily needs Vercel Pro).
// v61 (2026-06-03): REFERRAL CREDITING — AUTOMATED (Grant: "I want things automated, not waiting for
//      admin"). On a confirmed paid signup via a referral link we now credit the referrer immediately:
//      referral 'paid' + an 'in' wallet transaction, and email the holder "You have a new referral — +$X
//      added — your balance is $Y" (sendReferralEmail now takes rewardUsd + balanceUsd; payout-at-$250
//      line included). Balance = sum(in.paid) − sum(out paid/pending). The admin Referrals panel is now a
//      record + an 'Invalid' clawback (admin_invalidate_referral removes the credit). (v60's admin-gated
//      model was per Grant's later call to automate; admin_verify_referral kept for any edge 'pending'.)
// v58 (2026-06-03): SUNDAY SUMMARY redesigned to the approved DARK FFP brand (matches the homepage +
// v58 (2026-06-03): SUNDAY SUMMARY redesigned to the approved DARK FFP brand (matches the homepage +
//      FFP-SUNDAY-SUMMARY mockup): bold yellow status banner up top, "My fitness stats" rank rows,
//      "Your passport" metric rows (places/cities/connections/meet-ups/activities with weekly ▲ deltas
//      where real), passport-status progress bar, blue CTA. Replaced the rejected light/radar layout.
//      Email-safe (tables + inline styles), no icon fonts, no emojis (geometric ▲ only). Uses the SAME
//      data the cron already gathers (rankings/places/connections/tier_progress). NOTE: per-stat
//      City/Gender/Age cohorts + week-over-week fitness deltas shown in the mockup need a ranking-data
//      build (member_stat_rankings currently returns one rank); rendered as single city rank for now.
// v57 (2026-06-03): AUTH FIX — admin dashboard (and all RLS-gated reads/writes) showed NO DATA
//      because the client was never given a Supabase JWT: /api/auth/signin returned {token, member}
//      but NO `jwt`, so window.supabase ran as anon for everyone and auth.uid() was always null
//      (which is why feedback etc. needed SECURITY DEFINER workarounds). Now signin AND
//      /api/onboard/from-stripe return jwt = mintSupabaseJwt(member): a real HS256 token signed with
//      the project's JWT secret (sub=member.id, role/aud='authenticated', 30-day exp). ffp-api-integration
//      already stores+applies res.jwt, so auth.uid() now resolves to member.id in RLS — admin panels load.
//      REQUIRES new Vercel env var SUPABASE_JWT_SECRET (Supabase → Settings → API → JWT Secret).
//      Until that env is set, mintSupabaseJwt() returns null and behaviour is unchanged (safe fallback).
// v56 (2026-06-03): Sunday Summary REBUILT around FFP's 3 pillars (Grant). (1) YOUR FITNESS vs the
//      community — a radar chart scored from the member's OWN values vs healthy ranges (meaningful even
//      solo, varies by their stats) + their PRs with community rank. (2) YOUR WORLD — cities + partner
//      venues visited + people connected (member_places RPC + connections). (3) PASSPORT STATUS — real
//      tier progress vs the Earnings 8-section / 4-of-8 / 30-day rule (member_tier_progress(p_me) RPC),
//      progress bar + the closest sections to your next tier. Replaced the generic 8-box grid. New RPCs:
//      member_tier_progress(p_me), member_places(p_me); member_stat_rankings now returns key+value.
// v55 (2026-06-03): Sunday Summary upgrades + signup emails. (a) Rankings now render as REAL CHARTS
//      (QuickChart PNGs: horizontal "where you rank" bar, active-minutes-vs-peers bar, macros doughnut)
//      built per member; charts only show when the data exists. (b) Sends to ALL active members —
//      inactive members get an encouraging nudge instead of being skipped. (c) New-signup alert email to
//      ADMIN_EMAIL (default grant@findfitpeople.com) + "You have a new referral" email to the referrer,
//      both wired into /api/onboard/from-stripe. Optional env QUICKCHART_KEY for chart rate limits;
//      optional ADMIN_EMAIL to change the alert recipient. (Sunday Summary header still uses ffp-logo.png;
//      swap to ffp-passport-cover.png once that asset is committed.)
// v54 (2026-06-03): SUNDAY SUMMARY weekly digest email. GET /api/cron/sunday-summary (secured by
//      CRON_SECRET — Vercel Cron sends Authorization: Bearer; ?secret= for manual tests) loops active
//      members, calls member_weekly_digest RPC, renders the all-8-areas email (renderSundaySummary,
//      no emojis, per FFP-EMAIL-STANDARD) and sends via the existing Resend mailer. Skips opted-out
//      (preferences.no_weekly_email) + members with zero activity that week. Scheduled in vercel.json
//      ('0 4 * * 0' = Sun 08:00 UAE). Needs env CRON_SECRET. (Weekly cron requires Vercel Pro.)
// v53 (2026-06-02): /api/members/:id/activity-logs also returns checkin_lat/checkin_lng so the
//      passport "Your journey" Leaflet map can drop exact pins for venue check-ins.
// v52 (2026-06-02): /api/auth/reset now returns an `exists` boolean. The login screen uses it
//      on the sign-in flow to notify "no account found" and stay on the email step instead of
//      advancing to the code screen for an unregistered email. (Code is still only sent if the
//      account exists — no email enumeration via the code itself.)
// v51 (2026-06-02): GET /api/members/:id/activity-logs — returns a member's activity_logs
//      (passport "journey"). The member dashboard's loadJourneyLogs() relies on this; without
//      it the passport can't show saved logs or venue check-ins. Service-role read.
// v50 (2026-06-02): GET /api/geo/resolve?url= — follows a Google Maps short-link redirect
//      and extracts lat/lng (parseLatLng). Used by the provider profile to set the venue pin
//      from a pasted Maps link (member check-in GPS verification + member Directions).
// v49 (2026-06-01): provider self-signup is now INSTANT + self-serve — the providers row is
//      created status='approved' (no admin account-approval step). Account is usable immediately
//      after email confirm + login. (Individual listings still save as 'pending' per their own flow.)
// v48 (2026-06-01): provider signup trimmed — category no longer required (set later).
// v47 (2026-06-01): PROVIDER SELF-SIGNUP (Phase 1). Added POST /api/provider/signup
//      (creates member role=provider/status=active/verified=false + providers row
//      status='pending' + emails a verify link) and GET /api/provider/verify
//      (HMAC-signed token → sets members.verified=true → 302 to /login?verified=1).
//      Helpers: signProviderToken/verifyProviderToken, sendProviderVerifyEmail.
// v46: PUT now also persists phone_country_code + country (were silently dropped, so the
//      phone country code and home country never saved). v45: height_cm.
// v45: /api/members/:id PUT now persists height_cm (column added) so member Height saves.
// v44: Referral loop wired — onboard now generates members.referral_code for new members,
//      reads `ref` (referrer's code) and on a match sets referred_by + inserts a pending
//      referrals row (tier-based reward_aed). New GET /api/referrer/:code powers the
//      landing-page invite banner. So every member can refer from their first second.
// v43: /api/members/:id PUT now persists `preferences` (jsonb) so member preference toggles
//      (notifications, newsletter, public profile, hide DOB on card) actually save. Also
//      relies on the new members.skills + members.preferences jsonb columns.
// v42: /api/onboard/from-stripe now persists gender, skills (to members.skills) and
//      photo_url directly on the member row, so the passport card renders gender,
//      sports and the photo correctly on the very first dashboard entry (previously
//      gender was dropped and skills went only to profile_meta -> card blank).
// v9: /api/auth/signin now returns the FULL member object (excluding the
//     hashed access_code for safety) instead of only 7 hand-picked fields.
//     Previously the signin response stripped surname, given_names,
//     nationality, date_of_birth, country, city, gender, photo_url, bio,
//     interests, fitness_level, tier and everything else — so the passport-
//     card loader (which reads localStorage.ffp_member) had nothing to
//     render with after signin, leaving the card blank. Fix: spread the
//     full member row in the response.
// v8: Adds status: 'active' to all three member-insert paths (Stripe webhook,
//     /api/onboard/from-stripe, /api/auth/signup). Without this, new members
//     got the DB-column default (null) for status, which fails the signin
//     check `if (member.status !== 'active')` → 403 "Account suspended". So
//     no one could ever sign in after a fresh signup. Discovered 2026-05-28
//     when grant tested admin@ffptravels.com — the code email arrived (good)
//     but verifyCode returned 403. Existing affected accounts need a one-off
//     SQL UPDATE to set status='active' (delivered alongside this v8).
// v7: Removes the access-code email from the Stripe webhook handler. Grant
//     specifically asked that no login-code email fire after Stripe payment
//     completion. The user gets the welcome email after profile-complete
//     instead. If they later need a code to sign in, they request it via
//     the /login "send me a code" flow which calls /api/auth/reset.
//     The access_code is still GENERATED and stored on the member row when
//     the webhook creates them — just no longer emailed at that moment.
//     (The /api/onboard/from-stripe endpoint still has its own code-email
//     send for the rare race-case where profile-complete beats the webhook.
//     Almost never fires in practice; kept as defensive backup.)
// v6: welcome email content matches Grant's spec EXACTLY — no embellishments,
//     no closing sign-off, no mailto, no language not in his brief.
//     Greeting: "Hey, [First]." → "You are now officially an FFP Passport
//     holder - so cool!" → "As a new member of the community, let's get you
//     set up and connected with the best experiences:" → three steps
//     (1 mandatory profile with location/gender/age/interests+level/few words,
//     2 Meet & Move panel, 3 join or host) → "What's a Meet?" explainer with
//     skill-pairing examples → CTA "Go To Dashboard" → brand footer only.
//     NOTE: v5 was drafted but never deployed — replaced wholesale by v6.
// v5: [never deployed] rewrote welcome email to Grant's spec but added
//     content (closing sign-off, mailto, alternate wording) Grant hadn't
//     asked for. Replaced by v6.
// v4: adds welcome email send-call to /api/onboard/from-stripe (fires once,
//     on first-time profile completion only — distinct from the access code email).
//     Welcome email is separate orientation message: "you're officially in, here's
//     how to start". Access-code-email behaviour from v3 preserved exactly.
//     Also updated existing-member lookup to include profile_complete so the
//     welcome email never duplicates for returning users.
// v3: adds /api/onboard/from-stripe endpoint (atomic onboarding without webhook dependency)
//     v2 webhook update behaviour retained as a fallback (no longer on critical path)
//     (v1 returned early without update, which broke profile-complete v7
//     lookup for any repeat or test payment with an existing email)
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const Stripe = require('stripe');
const app = express();
// CORS - Handle preflight
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.sendStatus(200);
});
// CORS - Apply to all requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
// ────────────────────────────────────────────────────────────
// STRIPE WEBHOOK — must be defined BEFORE express.json()
// ────────────────────────────────────────────────────────────
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('STRIPE_WEBHOOK_SECRET not set');
    return res.status(500).send('Webhook secret not configured');
  }
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('Stripe webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    try {
      const session = event.data.object;
      // v80: SUBSCRIPTION upgrade (Annual/Monthly) of an existing signed-in member — handled separately
      // from the legacy one-time $99 link flow below.
      if (session.mode === 'subscription') {
        await activateMemberSubscription(session);
        return res.status(200).json({ received: true, subscription: true });
      }
      const email = String((session.customer_details && session.customer_details.email) || session.customer_email || '').trim().toLowerCase(); // v75: normalize email case
      const name  = (session.customer_details && session.customer_details.name) || '';
      if (!email) {
        console.error('Stripe webhook: no email in session', session.id);
        return res.status(200).json({ received: true, warning: 'no email' });
      }
      // v79: match by stripe_session_id FIRST (the account email may differ from the payment email, e.g.
      // Apple Pay or a profile-complete email edit), then fall back to the payment email. Prevents a
      // duplicate row when onboard created the member under the typed email before this webhook fired.
      let existing = null;
      {
        const r = await supabase.from('members').select('id, access_code').eq('stripe_session_id', session.id).maybeSingle();
        existing = r.data || null;
      }
      if (!existing) {
        const r = await supabase.from('members').select('id, access_code').eq('email', email).maybeSingle();
        existing = r.data || null;
      }
      if (existing) {
        // v2: Update existing member with the new stripe_session_id so
        // ffp-profile-complete v7 can find them. Without this, repeat
        // payments (or test runs with an existing email) leave the
        // existing row with a stale/null stripe_session_id and the
        // profile-complete lookup fails.
        console.log('Stripe webhook: member already exists for', email, '- refreshing stripe session');
        const { error: updateErr } = await supabase
          .from('members')
          .update({
            stripe_session_id: session.id,
            stripe_customer_id: session.customer || null,
            paid: true,
            membership: 'passport',                                                          // v78: the gate (member_passport_active) keys off membership + expiry, NOT the paid flag
            passport_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1-year term ($99/yr). (Renewal note: resets to +1yr from now; revisit when annual/monthly plans land.)
          })
          .eq('id', existing.id);
        if (updateErr) {
          console.error('Stripe webhook: existing member update failed', updateErr.message);
          return res.status(500).json({ error: updateErr.message });
        }
        return res.status(200).json({ received: true, member_id: existing.id, already_exists: true, updated: true });
      }
      const { code, hash } = generateCode();
      const passport_no = `FFP-${new Date().getFullYear()}-${String(Math.floor(Math.random()*9999+1)).padStart(4,'0')}`;
      const { data: member, error: insertErr } = await supabase
        .from('members')
        .insert({
          email,
          full_name: name,
          access_code: hash,
          role: 'member',
          passport_no,
          paid: true,
          membership: 'passport',                                                          // v78: paid → passport so the gate recognises them
          passport_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1-year term ($99/yr)
          status: 'active', // v8: required for signin check `member.status !== 'active'`
          stripe_session_id: session.id,
          stripe_customer_id: session.customer || null
        })
        .select()
        .single();
      if (insertErr) {
        console.error('Stripe webhook: member insert failed', insertErr.message);
        return res.status(500).json({ error: insertErr.message });
      }
      // v7: Code email intentionally NOT sent here. Grant's directive — no
      // login-code email after Stripe payment. The access_code is generated
      // and stored on the member row above; user receives orientation via
      // the welcome email after profile-complete, and can request a code
      // any time via /login → "send me a code" (which calls /api/auth/reset).
      console.log('Stripe webhook: paid member created', email, member.id, '(code generated, email suppressed per v7)');
    } catch (err) {
      console.error('Stripe webhook handler error:', err.message);
      return res.status(500).json({ error: err.message });
    }
  }
  // v80: subscription lifecycle — renewals extend the passport; cancels/changes lapse or adjust it.
  if (event.type === 'invoice.paid') {
    try { await onInvoicePaid(event.data.object); } catch (e) { console.error('[webhook invoice.paid]', e.message); }
    return res.json({ received: true });
  }
  if (event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
    try { await onSubscriptionChange(event.data.object); } catch (e) { console.error('[webhook subscription change]', e.message); }
    return res.json({ received: true });
  }
  res.json({ received: true });
});
app.use(express.json({ limit: '50mb' }));
// ────────────────────────────────────────────────────────────
// v3 — ATOMIC ONBOARDING ENDPOINT  (v4 — adds welcome email)
// ────────────────────────────────────────────────────────────
// Single endpoint called by ffp-profile-complete-v8.html on form submit.
// Does NOT depend on the Stripe webhook having fired. Fetches the Stripe
// session directly, then UPSERTs the member row with everything in one
// database write. Returns the full member object for the frontend to
// cache in localStorage for the dashboard.
//
// v4 addition: sends a welcome email exactly once per member, on the
// first time they complete profile-complete. Distinct from the 6-digit
// access code email (which is still sent for brand new inserts only).
// v44: referral code generator — e.g. "GRANT" + 4 hex => GRANT5A91 (matches existing style)
function genReferralCode(name) {
  const base = String(name || 'FFP').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5) || 'FFP';
  const rand = Math.random().toString(16).slice(2, 6).toUpperCase().padEnd(4, '0');
  return base + rand;
}

// v44: public referrer lookup — the landing page calls this with ?ref=CODE to render the
// "<name> invited you" banner. Returns just the public-safe name + photo.
app.get('/api/referrer/:code', async (req, res) => {
  try {
    const code = String(req.params.code || '').trim();
    if (!code) return res.json({ success: false });
    const { data: m } = await supabase
      .from('members')
      .select('given_names, full_name, photo_url')
      .ilike('referral_code', code)
      .maybeSingle();
    if (!m) return res.json({ success: false });
    const first = (m.given_names || String(m.full_name || '').split(/\s+/)[0] || 'a friend');
    return res.json({ success: true, first_name: first, full_name: m.full_name || first, photo_url: m.photo_url || null });
  } catch (e) {
    return res.json({ success: false });
  }
});

// v79: prefill helper — profile-complete fetches the payment email to pre-fill the editable "Account email"
// field, so the verified Stripe email is the default but the member can correct an Apple Pay mismatch.
app.get('/api/onboard/session-email', async (req, res) => {
  try {
    const sid = String(req.query.session_id || '').trim();
    if (!sid) return res.json({ email: null });
    const session = await stripe.checkout.sessions.retrieve(sid);
    const email = String((session.customer_details && session.customer_details.email) || session.customer_email || '').trim().toLowerCase();
    return res.json({ email: email || null });
  } catch (e) {
    return res.json({ email: null });
  }
});

app.post('/api/onboard/from-stripe', async (req, res) => {
  try {
    const {
      session_id, surname, given_names, date_of_birth,
      nationality, country, city, skills, gender, photo_url, ref, account_email
    } = req.body;
    if (!session_id) {
      return res.status(400).json({ error: 'session_id required' });
    }
    // 1) Pull the Stripe checkout session for email + name + customer id
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(session_id);
    } catch (stripeErr) {
      console.error('Onboard: Stripe session retrieve failed:', stripeErr.message);
      return res.status(400).json({ error: 'Invalid Stripe session: ' + stripeErr.message });
    }
    const stripeEmail = String((session.customer_details && session.customer_details.email) || session.customer_email || '').trim().toLowerCase(); // payment-captured email (Apple Pay can override what they typed on the Stripe page)
    const stripeName = (session.customer_details && session.customer_details.name) || '';
    const customerId = session.customer || null;
    // v79: ACCOUNT EMAIL = what the member confirmed on profile-complete (the field is prefilled with the
    // Stripe email but is editable). This is the email they sign in with + receive codes at. Falls back to
    // the Stripe email if blank/invalid.
    const typedEmail = String(account_email || '').trim().toLowerCase();
    let email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(typedEmail) ? typedEmail : stripeEmail;
    if (!email) {
      return res.status(400).json({ error: 'No email on Stripe session' });
    }
    // 2) Build full_name (form values take priority over Stripe's single field)
    const fullName = ((given_names || '') + ' ' + (surname || '')).trim() || stripeName;
    // 3) Find the member created at payment. Match by stripe_session_id FIRST (reliable even when the
    //    payment email differs from the typed one — e.g. Apple Pay), then by either email as a fallback.
    //    Selecting profile_complete tells us first-time vs returning (gates the welcome email).
    let existing = null;
    if (session_id) {
      const r = await supabase.from('members').select('id, paid, profile_complete, email').eq('stripe_session_id', session_id).maybeSingle();
      existing = r.data || null;
    }
    if (!existing && stripeEmail) {
      const r = await supabase.from('members').select('id, paid, profile_complete, email').eq('email', stripeEmail).maybeSingle();
      existing = r.data || null;
    }
    if (!existing && email !== stripeEmail) {
      const r = await supabase.from('members').select('id, paid, profile_complete, email').eq('email', email).maybeSingle();
      existing = r.data || null;
    }
    // Conflict guard: never steal an email already owned by a DIFFERENT account. If the chosen account
    // email is taken by someone else, keep the safe (payment) email instead and flag it.
    let emailConflict = false;
    {
      const safeEmail = existing ? (existing.email || stripeEmail) : stripeEmail;
      if (email !== safeEmail) {
        const { data: clash } = await supabase.from('members').select('id').eq('email', email).maybeSingle();
        if (clash && (!existing || clash.id !== existing.id)) { email = safeEmail; emailConflict = true; }
      }
    }
    // v4: First-time onboarding = no existing row, OR existing row that hasn't
    // completed profile yet (e.g. paid via Stripe webhook but never finished
    // profile-complete). Either way, this is the moment they become a real,
    // usable member — and the moment the welcome email should fire.
    const firstTimeOnboarding = !existing || !existing.profile_complete;
    let memberId;
    let isNew = false;
    let accessCode = null;
    if (existing) {
      // UPDATE path: existing email (could be an admin, repeat customer, prior test)
      const { error: updateErr } = await supabase
        .from('members')
        .update({
          email: email,                                 // v79: account email the member confirmed on profile-complete
          full_name: fullName,
          surname: surname || null,
          given_names: given_names || null,
          date_of_birth: date_of_birth || null,
          nationality: nationality || null,
          country: country || null,
          city: city || null,
          gender: gender || null,
          skills: (Array.isArray(skills) && skills.length) ? skills : null,
          photo_url: photo_url || null,
          paid: true,
          membership: 'passport',                                                          // v78: paid → passport so the gate recognises them
          passport_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1-year term ($99/yr)
          stripe_session_id: session_id,
          stripe_customer_id: customerId,
          profile_complete: true
        })
        .eq('id', existing.id);
      if (updateErr) {
        console.error('Onboard: member UPDATE failed:', updateErr.message);
        return res.status(500).json({ error: 'Update failed: ' + updateErr.message });
      }
      memberId = existing.id;
    } else {
      // INSERT path: brand new member
      const generated = generateCode();
      accessCode = generated.code;
      isNew = true;
      const passport_no = `FFP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9999 + 1)).padStart(4, '0')}`;
      const { data: inserted, error: insertErr } = await supabase
        .from('members')
        .insert({
          email,
          full_name: fullName,
          surname: surname || null,
          given_names: given_names || null,
          date_of_birth: date_of_birth || null,
          nationality: nationality || null,
          country: country || null,
          city: city || null,
          gender: gender || null,
          skills: (Array.isArray(skills) && skills.length) ? skills : null,
          photo_url: photo_url || null,
          passport_no,
          referral_code: genReferralCode(given_names || fullName),
          access_code: generated.hash,
          role: 'member',
          paid: true,
          membership: 'passport',                                                          // v78: paid → passport so the gate recognises them
          passport_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1-year term ($99/yr)
          status: 'active', // v8: required for signin check `member.status !== 'active'`
          stripe_session_id: session_id,
          stripe_customer_id: customerId,
          profile_complete: true
        })
        .select()
        .single();
      if (insertErr) {
        console.error('Onboard: member INSERT failed:', insertErr.message);
        return res.status(500).json({ error: 'Insert failed: ' + insertErr.message });
      }
      memberId = inserted.id;
    }

    // v80: SUBSCRIPTION term — if they paid via a subscription (Annual/Monthly), set membership/plan/expiry
    // from the actual subscription (period end), overwriting the default 1-year above. Non-blocking.
    if (session.subscription) {
      try {
        const sub = await stripe.subscriptions.retrieve(session.subscription);
        const subPlan = (session.metadata && session.metadata.plan) || null;
        await setMemberFromSubscription(sub, subPlan, memberId, email);
      } catch (subErr) { console.warn('Onboard: subscription apply failed (non-blocking):', subErr.message); }
    }

    // 3b) Referral attribution (non-blocking): if this signup came through someone's
    //     referral link, credit them. ref = the referrer's referral_code (from the
    //     landing page's ffp_ref, passed by profile-complete).
    let referrerName = null;
    if (ref) {
      try {
        await applyReferralOnSignup(memberId, ref);   // v81: referred_by + 60-day Ambassador (first attribution)
        // Subscriptions credit the referrer per-invoice (recurring) in the webhook; only the legacy one-time
        // $99 flow credits the referrer here.
        if (!session.subscription) {
        const { data: referrer } = await supabase
          .from('members')
          .select('id, tier, email, full_name')
          .ilike('referral_code', String(ref).trim())
          .maybeSingle();
        if (referrer && referrer.id && referrer.id !== memberId) {
          referrerName = referrer.full_name || null;
          // Set referred_by only if not already attributed
          await supabase.from('members')
            .update({ referred_by: referrer.id })
            .eq('id', memberId)
            .is('referred_by', null);
          // Tier-based reward = pct of the ACTUAL amount the new member paid (USD), AFTER any discount
          // code — NOT the $99 list price. session.amount_total is in cents of the session currency.
          const pct = ({ member: 5, supporter: 10, ambassador: 20 })[String(referrer.tier || 'member').toLowerCase()] || 5;
          const paidUsd = Math.round((Number(session.amount_total) || 0)) / 100;   // actual paid, USD
          const rewardUsd = Math.round((pct / 100) * paidUsd * 100) / 100;
          // One referral row per referred member
          const { data: dup } = await supabase.from('referrals')
            .select('id').eq('referred_member_id', memberId).maybeSingle();
          if (!dup) {
            // v63: AUTOMATED crediting, USD-only. Confirmed paid signup → credit the referrer now:
            // referral 'paid' + an 'in' wallet transaction (amounts stored in USD; the *_aed column
            // names are legacy and now hold USD — no conversion anywhere). Then email the holder.
            await supabase.from('referrals').insert({
              referrer_id: referrer.id,
              referred_email: email,
              referred_member_id: memberId,
              status: 'paid',
              reward_aed: rewardUsd,
              paid_at: new Date().toISOString()
            });
            const { error: refTxErr } = await supabase.from('transactions').insert({
              member_id: referrer.id, type: 'in', amount_aed: rewardUsd,
              source: 'Referral — ' + (fullName || email), category: 'referrals',
              status: 'paid', related_id: memberId
            });
            if (refTxErr) console.warn('Onboard: referral wallet credit failed (non-blocking):', refTxErr.message);
            // Referrer's new USD balance for the email (sum in.paid − out paid/pending) — values already USD
            let balanceUsd = 0;
            try {
              const { data: txs } = await supabase.from('transactions').select('type, amount_aed, status').eq('member_id', referrer.id);
              (txs || []).forEach(function (t) {
                if (t.type === 'in' && t.status === 'paid') balanceUsd += Number(t.amount_aed) || 0;
                else if (t.type === 'out' && (t.status === 'paid' || t.status === 'pending')) balanceUsd -= Number(t.amount_aed) || 0;
              });
              balanceUsd = Math.round(balanceUsd * 100) / 100;
            } catch (e) {}
            if (referrer.email) {
              try { await sendReferralEmail(referrer.email, referrer.full_name, fullName, rewardUsd, balanceUsd); }
              catch (e) { console.warn('Onboard: referral email failed (non-blocking):', e.message); }
            }
          }
        }
        }
      } catch (refErr) {
        console.warn('Onboard: referral attribution failed (non-blocking):', refErr.message);
      }
    }

    // 4) Upsert skills / chronological age into profile_meta (non-blocking on failure)
    if (Array.isArray(skills) && skills.length > 0) {
      let chronoAge = null;
      if (date_of_birth) {
        const birth = new Date(date_of_birth);
        const today = new Date();
        chronoAge = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) chronoAge--;
      }
      const { error: metaErr } = await supabase
        .from('profile_meta')
        .upsert({
          member_id: memberId,
          chrono_age: chronoAge,
          skills
        }, { onConflict: 'member_id' });
      if (metaErr) {
        // Don't fail onboarding for a meta error — log and continue
        console.warn('Onboard: profile_meta upsert failed (non-blocking):', metaErr.message);
      }
    }
    // 5) Onboarding emails — first-time only, never duplicated for returning users.
    //    Both sends are non-blocking: a mail failure must NOT break onboarding,
    //    because the member is already saved at this point.
    if (firstTimeOnboarding) {
      // 5a) Access code email — only for members CREATED by this endpoint.
      //     Members previously inserted by the Stripe webhook already received
      //     their code at that point, so we skip resending.
      if (isNew && accessCode) {
        try {
          await sendCodeEmail(email, fullName, accessCode, 'signup');
        } catch (mailErr) {
          console.warn('Onboard: access code email failed (non-blocking):', mailErr.message);
        }
      }
      // 5b) Welcome email — fires on every first-time profile completion,
      //     regardless of insert vs update path. This is the orientation
      //     message ("you're officially in, start matching").
      try {
        const firstName = (given_names || fullName || '').trim().split(/\s+/)[0] || 'there';
        await sendWelcomeEmail(email, firstName, city);
      } catch (mailErr) {
        console.warn('Onboard: welcome email failed (non-blocking):', mailErr.message);
      }
      // 5c) Admin alert — notify the FFP team of every new signup (non-blocking).
      try {
        await sendAdminNewSignupEmail({ full_name: fullName, email: email, city: city, referrer_name: referrerName });
      } catch (mailErr) {
        console.warn('Onboard: admin signup alert failed (non-blocking):', mailErr.message);
      }
    }
    // 6) Return the full member row for the frontend to cache
    const { data: finalMember } = await supabase
      .from('members')
      .select('*')
      .eq('id', memberId)
      .single();
    return res.json({
      success: true,
      jwt: mintSupabaseJwt(finalMember),       // v57: short (7d) Supabase JWT → auth.uid() resolves in RLS
      refresh: mintRefreshToken(finalMember),  // v71: long-lived refresh token → /api/auth/refresh
      member: finalMember,
      is_new: isNew,
      email: email,                  // v79: the account email actually saved (may differ from what they typed if a conflict was caught)
      email_conflict: emailConflict  // v79: true → typed email was already in use, so we kept the payment email
    });
  } catch (error) {
    console.error('Onboard endpoint error:', error);
    return res.status(500).json({ error: error.message });
  }
});
const mailer = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  }
});
function generateCode() {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const hash = crypto.createHash('sha256').update(code).digest('hex');
  return { code, hash };
}
async function sendCodeEmail(email, name, code, type) {
  const subject = type === 'signup'
    ? 'Your FFP Passport Access Code'
    : 'Your FFP Passport — New Access Code';
  const html = `
    <div style="font-family:Montserrat,sans-serif;max-width:480px;margin:0 auto;background:#081420;color:#fff;padding:32px;border-radius:16px;">
      <div style="font-size:22px;font-weight:900;letter-spacing:3px;margin-bottom:8px;">FFP <span style="color:#2ba8e0;">PASSPORT</span></div>
      <div style="font-size:12px;color:#6a90a8;letter-spacing:2px;text-transform:uppercase;margin-bottom:32px;">Find Fit People</div>
      <p style="font-size:16px;color:#9dbdd0;">Hi ${name || 'there'},</p>
      <p style="font-size:14px;color:#9dbdd0;line-height:1.7;">
        ${type === 'signup'
          ? 'Welcome to FFP Passport! Here is your 6-digit access code. This is your permanent login code — keep it somewhere safe.'
          : 'Here is your new 6-digit access code. Your old code has been deactivated.'}
      </p>
      <div style="background:rgba(43,168,224,.08);border:1px solid rgba(43,168,224,.2);border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
        <div style="font-size:42px;font-weight:900;letter-spacing:12px;color:#fff;">${code}</div>
        <div style="font-size:11px;color:#6a90a8;margin-top:8px;text-transform:uppercase;letter-spacing:1px;">Your access code</div>
      </div>
      <p style="font-size:12px;color:#6a90a8;line-height:1.7;">
        To sign in: enter your email + this 6-digit code at ffppassport.com<br/>This code does not expire until you reset it.
      </p>
      <div style="margin-top:32px;padding-top:24px;border-top:1px solid rgba(43,168,224,.1);font-size:11px;color:#6a90a8;">
        FFP Passport · UAE 2026 · ffppassport.com
      </div>
    </div>
  `;
  await mailer.sendMail({
    from: '"FFP Passport" <noreply@ffppassport.com>',
    to: email,
    subject,
    html
  });
}
// v6 — Welcome email content matches Grant's spec EXACTLY. No closing sign-off,
// no mailto, no embellishment. Sent on first-time profile-complete only.
// Separate from the access code email.
// city param kept on the signature for future personalisation; currently unused.
async function sendWelcomeEmail(email, firstName, city) {
  const safeName = escapeHtml(firstName);
  const subject = `Welcome to FFP Passport, ${firstName}`;
  const html = `
    <div style="font-family:Montserrat,sans-serif;max-width:480px;margin:0 auto;background:#081420;color:#fff;padding:32px;border-radius:16px;">
      <div style="font-size:22px;font-weight:900;letter-spacing:3px;margin-bottom:8px;">FFP <span style="color:#2ba8e0;">PASSPORT</span></div>
      <div style="font-size:12px;color:#6a90a8;letter-spacing:2px;text-transform:uppercase;margin-bottom:32px;">Find Fit People</div>

      <p style="font-size:18px;color:#fff;font-weight:700;margin:0 0 14px;">Hey, ${safeName}.</p>

      <p style="font-size:14px;color:#9dbdd0;line-height:1.7;margin:0 0 14px;">
        You are now officially an FFP Passport holder - so cool!
      </p>

      <p style="font-size:14px;color:#9dbdd0;line-height:1.7;margin:0 0 18px;">
        As a new member of the community, let's get you set up and connected with the best experiences:
      </p>

      <!-- Step 1 -->
      <div style="padding:14px 16px;background:rgba(43,168,224,.08);border:1px solid rgba(43,168,224,.2);border-radius:10px;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:800;color:#fff;margin-bottom:4px;">1. Complete your profile</div>
        <div style="font-size:12px;color:#9dbdd0;line-height:1.5;">This one matters most &mdash; your profile helps match you. Add: location, gender, age, interests + level, a few words.</div>
      </div>

      <!-- Step 2 -->
      <div style="padding:14px 16px;background:rgba(43,168,224,.08);border:1px solid rgba(43,168,224,.2);border-radius:10px;margin-bottom:10px;">
        <div style="font-size:13px;font-weight:800;color:#fff;margin-bottom:4px;">2. Open the Meet &amp; Move panel</div>
        <div style="font-size:12px;color:#9dbdd0;line-height:1.5;">Where you'll see your matches and can start connecting with your people.</div>
      </div>

      <!-- Step 3 -->
      <div style="padding:14px 16px;background:rgba(43,168,224,.08);border:1px solid rgba(43,168,224,.2);border-radius:10px;margin-bottom:18px;">
        <div style="font-size:13px;font-weight:800;color:#fff;">3. Join a Meet, or host your own</div>
      </div>

      <!-- What's a Meet? -->
      <div style="padding:14px 16px;background:rgba(255,204,0,.06);border:1px solid rgba(255,204,0,.2);border-radius:10px;margin-bottom:24px;">
        <div style="font-size:11px;font-weight:800;color:#FFCC00;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:6px;">What's a Meet?</div>
        <div style="font-size:12px;color:#9dbdd0;line-height:1.5;">They are small active meet ups (max 8 persons) to connect you to people with the same skill + ability. Eg; Yoga - beginner, Tennis - intermediate, Powerlifting - Advanced, etc.</div>
      </div>

      <div style="text-align:center;margin:24px 0 28px;">
        <a href="https://ffppassport.com/ffp-member-dashboard.html#profile" style="display:inline-block;background:#2ba8e0;color:#081420;text-decoration:none;font-weight:800;font-size:14px;padding:14px 32px;border-radius:8px;letter-spacing:.5px;">Go To Dashboard</a>
      </div>

      <div style="margin-top:32px;padding-top:24px;border-top:1px solid rgba(43,168,224,.1);font-size:11px;color:#6a90a8;">
        FFP Passport · UAE 2026 · ffppassport.com
      </div>
    </div>
  `;
  await mailer.sendMail({
    from: '"FFP Passport" <noreply@ffppassport.com>',
    to: email,
    subject,
    html
  });
}
// v4 helper — escapes user-supplied text before interpolating into HTML emails.
// First name and city come from the profile form, so we never want raw input
// rendered as markup inside an email client.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
// ── New-signup + referral emails (light/branded shell, matches FFP-EMAIL-STANDARD) ──
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'grant@findfitpeople.com';
function brandEmail(kicker, bodyHtml) {
  return ''
  +'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#dfe6ed;"><tr><td align="center" style="padding:24px;">'
  +'<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border:1px solid #e4ebf1;border-radius:16px;overflow:hidden;font-family:Montserrat,Arial,sans-serif;">'
  +'<tr><td style="padding:30px 32px 0;text-align:center;"><img src="https://ffppassport.com/assets/ffp-logo.png" alt="FFP Passport" width="132" style="display:inline-block;border:0;"></td></tr>'
  +'<tr><td style="padding:14px 32px 0;text-align:center;"><div style="height:3px;width:46px;background:#2ba8e0;border-radius:2px;margin:0 auto;"></div>'+(kicker?'<div style="font-size:10px;color:#8196a6;letter-spacing:2.5px;text-transform:uppercase;margin-top:14px;">'+kicker+'</div>':'')+'</td></tr>'
  +'<tr><td style="padding:22px 32px 8px;">'+bodyHtml+'</td></tr>'
  +'<tr><td style="padding:18px 32px 28px;"><div style="border-top:1px solid #eef2f6;padding-top:18px;font-size:11px;color:#8196a6;line-height:1.7;">FFP Passport · UAE 2026 · <a href="https://ffppassport.com" style="color:#2ba8e0;text-decoration:none;">ffppassport.com</a></div></td></tr>'
  +'</table></td></tr></table>';
}
async function sendAdminNewSignupEmail(m) {
  var body = '<div style="font-size:22px;font-weight:800;color:#0f2c47;margin-bottom:6px;letter-spacing:-0.3px;">New member signed up</div>'
   +'<p style="font-size:14px;color:#5b7186;line-height:1.6;margin:0 0 16px;">A new passport holder just joined FFP.</p>'
   +'<table role="presentation" width="100%" style="background:#f7fafc;border:1px solid #e7eef4;border-radius:10px;"><tr><td style="padding:14px 16px;font-size:13px;color:#44586a;line-height:2;">'
   +'<span style="color:#8196a6;">Name</span> &nbsp; <strong style="color:#0f2c47;">'+escapeHtml(m.full_name||'—')+'</strong><br>'
   +'<span style="color:#8196a6;">Email</span> &nbsp; '+escapeHtml(m.email||'—')+'<br>'
   +'<span style="color:#8196a6;">City</span> &nbsp; '+escapeHtml(m.city||'—')+'<br>'
   +'<span style="color:#8196a6;">Referred by</span> &nbsp; '+escapeHtml(m.referrer_name||'Direct signup')
   +'</td></tr></table>';
  await mailer.sendMail({ from: '"FFP Passport" <noreply@ffppassport.com>', to: ADMIN_EMAIL, subject: 'New FFP signup: ' + (m.full_name || m.email || ''), html: brandEmail('New signup', body) });
}
async function sendReferralEmail(toEmail, referrerName, newMemberName, rewardUsd, balanceUsd) {
  var hasReward = (typeof rewardUsd === 'number' && rewardUsd > 0);
  var fUsd = function (n) { n = Number(n) || 0; return (Math.round(n * 100) % 100 === 0) ? String(Math.round(n)) : n.toFixed(2); };
  var statBlock = hasReward
    ? '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 18px;"><tr>'
      + '<td width="50%" style="padding:0 5px 0 0;"><table role="presentation" width="100%" style="background:#f7fafc;border:1px solid #e7eef4;border-radius:12px;"><tr><td style="padding:14px 16px;"><div style="font-size:10px;color:#8196a6;text-transform:uppercase;letter-spacing:1.2px;font-weight:700;">Added</div><div style="font-size:22px;font-weight:900;color:#22a06b;margin-top:4px;">+$'+fUsd(rewardUsd)+'</div></td></tr></table></td>'
      + '<td width="50%" style="padding:0 0 0 5px;"><table role="presentation" width="100%" style="background:#f7fafc;border:1px solid #e7eef4;border-radius:12px;"><tr><td style="padding:14px 16px;"><div style="font-size:10px;color:#8196a6;text-transform:uppercase;letter-spacing:1.2px;font-weight:700;">Your balance</div><div style="font-size:22px;font-weight:900;color:#0f2c47;margin-top:4px;">$'+fUsd(balanceUsd)+'</div></td></tr></table></td>'
      + '</tr></table>'
    : '';
  var body = '<div style="font-size:24px;font-weight:800;color:#0f2c47;margin-bottom:6px;letter-spacing:-0.3px;">You have a new referral</div>'
   +'<p style="font-size:14px;color:#5b7186;line-height:1.6;margin:0 0 18px;">Nice work'+(referrerName?(', '+escapeHtml(referrerName)):'')+'. <strong style="color:#0f2c47;">'+escapeHtml(newMemberName||'Someone')+'</strong> just joined FFP Passport using your referral link'+(hasReward?' — your reward has been added to your balance.':'.')+'</p>'
   + statBlock
   +'<p style="font-size:13px;color:#5b7186;line-height:1.6;margin:0 0 14px;">You can request a payout once your balance reaches <strong style="color:#0f2c47;">$250 USD</strong>.</p>'
   +'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0;"><tr><td style="background:#FFCC00;border-radius:10px;"><a href="https://ffppassport.com/ffp-member-dashboard.html#referrals" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:800;color:#0f2c47;text-decoration:none;">View your earnings</a></td></tr></table>';
  await mailer.sendMail({ from: '"FFP Passport" <noreply@ffppassport.com>', to: toEmail, subject: 'You have a new referral on FFP Passport', html: brandEmail('Referral', body) });
}

app.get('/', (req, res) => {
  res.json({ status: 'FFP Passport API running' });
});
app.post('/api/auth/signup', async (req, res) => {
  if (process.env.ALLOW_FREE_SIGNUP !== 'true') {
    return res.status(403).json({
      error: 'Account creation requires payment. Please complete checkout to become a member.',
      checkout_url: process.env.STRIPE_CHECKOUT_URL || 'https://ffppassport.com'
    });
  }
  try {
    const { full_name, role = 'member' } = req.body;
    const email = String(req.body.email || '').trim().toLowerCase(); // v75: normalize email case (login/lookup is case-insensitive)
    if (!email) return res.status(400).json({ error: 'Email required' });
    const { data: existing } = await supabase
      .from('members')
      .select('id')
      .eq('email', email)
      .single();
    if (existing) return res.status(409).json({ error: 'Account already exists. Sign in instead.' });
    const { code, hash } = generateCode();
    const passport_no = `FFP-${new Date().getFullYear()}-${String(Math.floor(Math.random()*9999+1)).padStart(4,'0')}`;
    const { data: member, error } = await supabase
      .from('members')
      .insert({ email, full_name, access_code: hash, role, passport_no, status: 'active' }) // v8: status required for signin
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    await sendCodeEmail(email, full_name, code, 'signup');
    res.json({
      success: true,
      message: 'Account created. Check your email for your access code.',
      member_id: member.id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/auth/signin', async (req, res) => {
  try {
    const code = req.body.code;
    const email = String(req.body.email || '').trim().toLowerCase(); // v75: case-insensitive sign-in — stored emails are lowercase
    if (!email || !code) return res.status(400).json({ error: 'Email and code required' });
    const hash = crypto.createHash('sha256').update(String(code)).digest('hex');
    const { data: member, error } = await supabase
      .from('members')
      .select('*')
      .eq('email', email)
      .eq('access_code', hash)
      .single();
    if (error || !member) return res.status(401).json({ error: 'Invalid email or code' });
    if (member.status !== 'active') return res.status(403).json({ error: 'Account suspended' });
    const token = crypto.randomBytes(32).toString('hex');
    await supabase.from('members').update({
      last_login: new Date().toISOString()
    }).eq('id', member.id);
    // v9: return the full member row so the dashboard loader has everything
    // it needs to populate the passport card (surname, given_names, DOB,
    // nationality, country, city, gender, photo_url, etc.). Strip the
    // hashed access_code for safety — frontend never needs it.
    const { access_code: _ac, ...memberSafe } = member;
    res.json({
      success: true,
      token,
      jwt: mintSupabaseJwt(member),       // v57: short (7d) Supabase JWT → auth.uid() resolves in RLS
      refresh: mintRefreshToken(member),  // v71: long-lived (365d) refresh token → /api/auth/refresh
      member: memberSafe,
      redirect: member.profile_complete
        ? ((member.role === 'admin' || member.role === 'super_admin') ? '/ffp-admin.html'
           : member.role === 'provider' ? '/ffp-provider.html'
           : '/ffp-member-dashboard.html')
        : '/ffp-profile-complete.html'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// v71: SILENT SESSION REFRESH — the client exchanges its long-lived ffp_refresh token for a fresh
// short access JWT (+ a rotated refresh token). Called on app boot and on a 401. No code/email needed.
// Stateless: the refresh token is HMAC-signed, so we just verify it, re-check the member is active, and
// re-mint. (Future: a server-side revocation list if we ever need "log out everywhere".)
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refresh } = req.body || {};
    if (!refresh) return res.status(400).json({ error: 'Missing refresh token' });
    const v = verifyRefreshToken(refresh);
    if (!v) return res.status(401).json({ error: 'Invalid or expired session' });
    const { data: member, error } = await supabase
      .from('members').select('*').eq('id', v.memberId).single();
    if (error || !member) return res.status(401).json({ error: 'Account not found' });
    if (member.status !== 'active') return res.status(403).json({ error: 'Account suspended' });
    const { access_code: _ac, ...memberSafe } = member;
    res.json({
      success: true,
      jwt: mintSupabaseJwt(member),       // fresh 7-day access JWT
      refresh: mintRefreshToken(member),  // rotate the refresh token
      member: memberSafe
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/auth/reset', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase(); // v75: case-insensitive lookup — fixes "account does not exist" on capitalized email
    if (!email) return res.status(400).json({ error: 'Email required' });
    const { data: member } = await supabase
      .from('members')
      .select('id, full_name')
      .eq('email', email)
      .single();
    // v52: return an `exists` flag so the login screen can tell the member their
    // email isn't registered (sign-in flow) instead of advancing to the code screen.
    if (!member) return res.json({ success: true, exists: false, message: 'No account found for that email.' });
    const { code, hash } = generateCode();
    await supabase.from('members').update({ access_code: hash }).eq('id', member.id);
    await sendCodeEmail(email, member.full_name, code, 'reset');
    res.json({ success: true, exists: true, message: 'New code sent. Your old code no longer works.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER SELF-SIGNUP — Phase 1 ("Try for free")  [added 2026-06-01]
// A provider self-registers → we create a MEMBER (role=provider, status=active,
// verified=false) + a PROVIDERS row (owner_user_id = member.id, status='pending').
// We email a verification link; clicking it marks the member verified and sends
// them to the login page, where they sign in with the normal email→code flow.
// The account is INSTANT + self-serve (providers row status='approved') — there is NO
// admin account-approval step. Free during the research-preview phase. Phase 2 hooks paid_until/tier.
// ─────────────────────────────────────────────────────────────────────────────
const SITE_URL = process.env.SITE_URL || 'https://ffppassport.com';

// ── v80: PASSPORT SUBSCRIPTIONS (Annual $149/yr · Monthly $20/mo) ─────────────────────────────
// Stripe product "FFP Passport 2026" → two recurring prices. A signed-in member upgrades via
// /api/billing/checkout (subscription Checkout Session tied to their account); the webhook below grants /
// extends / lapses their passport from the subscription's status + current_period_end.
const PRICE_ANNUAL  = process.env.STRIPE_PRICE_ANNUAL  || 'price_1Tg3o8BnpbSTlIOBIj5eIl8D';  // $149 / year
const PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY || 'price_1Tg3pBBnpbSTlIOB1EEs9LJc';  // $20 / month

// Apply a Stripe subscription to the member row (grant/extend/lapse). Source of truth = the sub's status +
// current_period_end. Finds the member by id (metadata/client_reference_id), then existing sub id, email, customer.
async function setMemberFromSubscription(sub, plan, hintMemberId, hintEmail) {
  if (!sub) return;
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
  const active = (sub.status === 'active' || sub.status === 'trialing');
  const upd = {
    paid: true,
    membership: active ? 'passport' : 'free',
    passport_expires_at: periodEnd,
    plan: plan || null,
    stripe_subscription_id: sub.id,
    stripe_customer_id: sub.customer || null
  };
  let target = null;
  if (hintMemberId) target = { col: 'id', val: hintMemberId };
  if (!target) { const { data } = await supabase.from('members').select('id').eq('stripe_subscription_id', sub.id).maybeSingle(); if (data) target = { col: 'id', val: data.id }; }
  if (!target && hintEmail) target = { col: 'email', val: String(hintEmail).trim().toLowerCase() };
  if (!target && sub.customer) { const { data } = await supabase.from('members').select('id').eq('stripe_customer_id', sub.customer).maybeSingle(); if (data) target = { col: 'id', val: data.id }; }
  if (!target) { console.warn('[sub] no member match for subscription', sub.id); return; }
  const { error } = await supabase.from('members').update(upd).eq(target.col, target.val);
  if (error) console.error('[sub] member update failed', error.message);
}
async function activateMemberSubscription(session) {
  const memberId = session.client_reference_id || (session.metadata && session.metadata.member_id) || null;
  const plan = (session.metadata && session.metadata.plan) || null;
  const email = String((session.customer_details && session.customer_details.email) || session.customer_email || '').trim().toLowerCase();
  if (!session.subscription) return;
  const sub = await stripe.subscriptions.retrieve(session.subscription);
  const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
  const ref = (session.metadata && session.metadata.ref) || '';
  // Locate the member: by id (in-app upgrade) → by email (new signup).
  let id = memberId;
  if (!id && email) { const { data } = await supabase.from('members').select('id').eq('email', email).maybeSingle(); if (data) id = data.id; }
  if (id) {
    await setMemberFromSubscription(sub, plan, id, email);
  } else if (email) {
    // SIGNUP via subscription — create the member (mirrors the legacy $99 webhook insert). profile-complete
    // fills in name/DOB/etc. afterwards; access code is generated now, emailed on first /api/auth/reset.
    const { hash } = generateCode();
    const passport_no = `FFP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9999 + 1)).padStart(4, '0')}`;
    const { data: inserted, error } = await supabase.from('members').insert({
      email,
      full_name: (session.customer_details && session.customer_details.name) || '',
      access_code: hash, role: 'member', status: 'active', passport_no,
      paid: true, membership: 'passport', passport_expires_at: periodEnd, plan: plan || null,
      stripe_subscription_id: sub.id, stripe_customer_id: sub.customer || null
    }).select('id').single();
    if (error) { console.error('[sub] signup member insert failed', error.message); return; }
    id = inserted ? inserted.id : null;
  } else {
    console.warn('[sub] subscription with no member + no email', sub.id); return;
  }
  if (id && ref) await applyReferralOnSignup(id, ref);   // referred_by + 60-day Ambassador (first attribution)
}
async function onInvoicePaid(invoice) {
  if (!invoice || !invoice.subscription) return;                 // only subscription invoices (renewals)
  const sub = await stripe.subscriptions.retrieve(invoice.subscription);
  const memberId = (sub.metadata && sub.metadata.member_id) || null;
  const plan = (sub.metadata && sub.metadata.plan) || null;
  await setMemberFromSubscription(sub, plan, memberId, invoice.customer_email);
  try { await creditReferralForInvoice(invoice, sub); } catch (e) { console.warn('[referral credit]', e.message); }  // recurring referral commission
}
async function onSubscriptionChange(sub) {
  const memberId = (sub.metadata && sub.metadata.member_id) || null;
  const plan = (sub.metadata && sub.metadata.plan) || null;
  await setMemberFromSubscription(sub, plan, memberId, null);
}

// ── v81: REFERRALS (recurring) ───────────────────────────────────────────────────────────────
const REFERRAL_PCT = { member: 5, supporter: 10, ambassador: 20 };
// An Ambassador grant that has lapsed earns at the base 'member' rate again.
function effectiveTier(referrer) {
  const t = String((referrer && referrer.tier) || 'member').toLowerCase();
  if (t === 'ambassador' && referrer && referrer.tier_expires_at && new Date(referrer.tier_expires_at) < new Date()) return 'member';
  return t;
}
// Referred signup → attribute the referrer + grant the NEW member 60 days at Ambassador tier (20% earnings).
// First attribution only (guarded by referred_by IS NULL) — never re-granted on renewals/re-runs.
async function applyReferralOnSignup(newMemberId, refCode) {
  if (!newMemberId || !refCode) return;
  const { data: referrer } = await supabase.from('members').select('id').ilike('referral_code', String(refCode).trim()).maybeSingle();
  if (!referrer || referrer.id === newMemberId) return;
  const expires = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('members')
    .update({ referred_by: referrer.id, tier: 'ambassador', tier_expires_at: expires })
    .eq('id', newMemberId).is('referred_by', null);
}
// RECURRING referral commission — credit the referrer their (effective) tier% of THIS invoice's amount, on
// EVERY payment of the member's ORIGINAL subscription. Idempotent per invoice (unique stripe_invoice_id). If
// the member lapsed and re-subscribed (a new sub id), it earns nothing — the referral is tied to the first sub.
async function creditReferralForInvoice(invoice, sub) {
  if (!invoice || !invoice.id || !sub) return;
  const refCode = (sub.metadata && sub.metadata.ref) || '';
  if (!refCode) return;
  let mid = (sub.metadata && sub.metadata.member_id) || null;
  if (!mid) { const { data } = await supabase.from('members').select('id').eq('stripe_subscription_id', sub.id).maybeSingle(); if (data) mid = data.id; }
  let refRow = null;
  if (mid) { const { data } = await supabase.from('referrals').select('id, stripe_subscription_id').eq('referred_member_id', mid).maybeSingle(); refRow = data || null; }
  if (refRow && refRow.stripe_subscription_id && refRow.stripe_subscription_id !== sub.id) return;  // re-subscribe after a lapse → no earnings
  const { data: dupTx } = await supabase.from('transactions').select('id').eq('stripe_invoice_id', invoice.id).maybeSingle();
  if (dupTx) return;                                                                                // already credited this invoice
  const { data: referrer } = await supabase.from('members').select('id, tier, tier_expires_at, full_name, email').ilike('referral_code', String(refCode).trim()).maybeSingle();
  if (!referrer || (mid && referrer.id === mid)) return;
  const pct = REFERRAL_PCT[effectiveTier(referrer)] || 5;
  const paidUsd = Math.round((Number(invoice.amount_paid) || 0)) / 100;                              // what they actually paid this cycle, USD
  if (paidUsd <= 0) return;
  const rewardUsd = Math.round((pct / 100) * paidUsd * 100) / 100;
  let payerName = invoice.customer_email || 'a member';
  if (mid) { const { data: mm } = await supabase.from('members').select('full_name, email').eq('id', mid).maybeSingle(); if (mm) payerName = mm.full_name || mm.email; }
  const { error: txErr } = await supabase.from('transactions').insert({
    member_id: referrer.id, type: 'in', amount_aed: rewardUsd,
    source: 'Referral — ' + payerName, category: 'referrals', status: 'paid',
    related_id: mid || null, stripe_invoice_id: invoice.id
  });
  if (txErr) return;                                                                                // unique index tripped (race) → already credited
  // First conversion → referrals row (records the ORIGINAL sub id) + a single email (no spam on renewals).
  if (mid && !refRow) {
    await supabase.from('referrals').insert({
      referrer_id: referrer.id, referred_email: invoice.customer_email || null, referred_member_id: mid,
      status: 'paid', reward_aed: rewardUsd, paid_at: new Date().toISOString(), stripe_subscription_id: sub.id
    });
    try {
      let bal = 0; const { data: txs } = await supabase.from('transactions').select('type, amount_aed, status').eq('member_id', referrer.id);
      (txs || []).forEach(function (t) { if (t.type === 'in' && t.status === 'paid') bal += Number(t.amount_aed) || 0; else if (t.type === 'out' && (t.status === 'paid' || t.status === 'pending')) bal -= Number(t.amount_aed) || 0; });
      if (referrer.email) await sendReferralEmail(referrer.email, referrer.full_name, payerName, rewardUsd, Math.round(bal * 100) / 100);
    } catch (e) { console.warn('[referral email]', e.message); }
  }
}

// POST /api/billing/checkout — a signed-in member upgrades to Passport. Creates a Stripe subscription
// Checkout Session tied to their account (client_reference_id + metadata.member_id) so the webhook can flip
// THAT member to passport. Returns { url } for the browser to redirect to.
app.post('/api/billing/checkout', async (req, res) => {
  try {
    const { plan, member_id, email, ref } = req.body || {};
    const price = plan === 'monthly' ? PRICE_MONTHLY : (plan === 'annual' ? PRICE_ANNUAL : null);
    if (!price) return res.status(400).json({ error: 'Choose annual or monthly.' });
    const isUpgrade = !!member_id;   // signed-in member upgrading vs a brand-new "Become A Member" signup
    const meta = { member_id: member_id ? String(member_id) : '', plan: String(plan), ref: ref ? String(ref) : '' };
    const params = {
      mode: 'subscription',
      line_items: [{ price, quantity: 1 }],
      customer_email: email || undefined,
      metadata: meta,
      // 7-day free trial on every plan. Card captured now (Checkout default), first charge on day 7. metadata
      // propagates to the subscription so invoice.paid / subscription.* find the member.
      subscription_data: { metadata: meta, trial_period_days: 7 },
      allow_promotion_codes: true
    };
    if (isUpgrade) {
      params.client_reference_id = String(member_id);
      params.success_url = SITE_URL + '/ffp-member-dashboard.html?upgraded=1';
      params.cancel_url  = SITE_URL + '/ffp-member-dashboard.html?upgrade=cancel';
    } else {
      // new member — Stripe collects the email at checkout; on success → profile-complete (creates/finishes
      // the member). The webhook also creates them as a backup, matched by email.
      params.success_url = SITE_URL + '/ffp-profile-complete.html?session_id={CHECKOUT_SESSION_ID}';
      params.cancel_url  = SITE_URL + '/login.html#signup';
    }
    const session = await stripe.checkout.sessions.create(params);
    return res.json({ url: session.url });
  } catch (e) {
    console.error('[billing/checkout]', e.message);
    return res.status(500).json({ error: e.message });
  }
});
const VERIFY_SECRET = process.env.SUPABASE_SERVICE_KEY || 'ffp-fallback-secret';

function b64url(s) {
  return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── v57: mint a REAL Supabase-valid HS256 JWT so auth.uid() resolves in RLS ──
// The project's anon/service keys are HS256 tokens signed with the project's
// JWT secret. A token we sign with that SAME secret (sub=member.id,
// role/aud='authenticated') is accepted by PostgREST, so auth.uid() = member.id
// inside every RLS policy. This is what makes the admin dashboard (and any other
// RLS-gated read/write) work without per-feature SECURITY DEFINER workarounds.
// REQUIRES env: SUPABASE_JWT_SECRET = Supabase → Settings → API → JWT Secret.
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET || '';
function mintSupabaseJwt(member) {
  if (!SUPABASE_JWT_SECRET) return null;            // safe no-op until the env var is set
  const now = Math.floor(Date.now() / 1000);
  const header  = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: String(member.id),
    role: 'authenticated',
    aud: 'authenticated',
    email: member.email || null,
    iat: now,
    exp: now + 60 * 60 * 24 * 7    // v71: 7-day ACCESS token (short-lived). Renewed silently via
                                   // /api/auth/refresh using the long-lived ffp_refresh token below.
  };
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = enc(header) + '.' + enc(payload);
  const sig  = crypto.createHmac('sha256', SUPABASE_JWT_SECRET).update(data).digest('base64url');
  return data + '.' + sig;
}

// ── v71: REFRESH TOKEN — long-lived, self-validating (HMAC, stateless; same pattern as
// signProviderToken). Exchanged at /api/auth/refresh for a fresh short access JWT. Format:
// b64url("<member.id>.<expMs>") + "." + hmacHex. Signed with VERIFY_SECRET (server-only).
const REFRESH_TTL_MS = 365 * 24 * 60 * 60 * 1000;   // 365 days
function mintRefreshToken(member) {
  const payload = `${member.id}.${Date.now() + REFRESH_TTL_MS}`;
  const sig = crypto.createHmac('sha256', VERIFY_SECRET).update(payload).digest('hex');
  return b64url(payload) + '.' + sig;
}
function verifyRefreshToken(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 2) return null;
    const payload = Buffer.from(parts[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const expect = crypto.createHmac('sha256', VERIFY_SECRET).update(payload).digest('hex');
    // constant-time compare
    const a = Buffer.from(parts[1]); const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const bits = payload.split('.');
    const memberId = bits[0];
    const expMs = Number(bits[1]);
    if (!memberId || !expMs || Date.now() > expMs) return null;   // tampered or expired
    return { memberId };
  } catch (e) { return null; }
}

function signProviderToken(memberId) {
  const payload = `${memberId}.${Date.now() + 7 * 24 * 60 * 60 * 1000}`; // 7-day expiry
  const sig = crypto.createHmac('sha256', VERIFY_SECRET).update(payload).digest('hex');
  return b64url(payload) + '.' + sig;
}
function verifyProviderToken(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 2) return null;
    const payload = Buffer.from(parts[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const expect = crypto.createHmac('sha256', VERIFY_SECRET).update(payload).digest('hex');
    const a = Buffer.from(parts[1]); const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const [memberId, expStr] = payload.split('.');
    if (!memberId || Number(expStr) < Date.now()) return null;
    return memberId;
  } catch (_) { return null; }
}

// ── v74: MEMBER IMAGE UPLOAD (proper, server-validated) ──────────────────────────────────────
// Members reach Supabase as the `anon` role (custom FFP JWT + anon key), so they can't write Storage
// under owner-scoped RLS. Instead of opening the bucket to anon/public, the browser POSTs the image
// here with the member's long-lived refresh token; we verify it → member id, then upload with the
// SERVICE key into the member's own folder. Storage write policies stay LOCKED (anon/public removed).
// Bucket allowlist + size cap guard abuse. Providers/admins keep uploading directly (real auth session).
const UPLOAD_BUCKETS = { 'quest-images': true };
app.post('/api/storage/upload', async (req, res) => {
  try {
    const { refresh, bucket, key, data } = req.body || {};
    const v = refresh ? verifyRefreshToken(refresh) : null;
    if (!v) return res.status(401).json({ error: 'Not signed in' });
    if (!UPLOAD_BUCKETS[bucket]) return res.status(400).json({ error: 'Bucket not allowed' });
    if (!data) return res.status(400).json({ error: 'No image data' });
    const b64 = String(data).replace(/^data:[^;]+;base64,/, '');
    const buf = Buffer.from(b64, 'base64');
    if (!buf.length) return res.status(400).json({ error: 'Empty image' });
    if (buf.length > 5 * 1024 * 1024) return res.status(413).json({ error: 'Image too large' });
    const safeKey = String(key || ('img-' + Date.now())).replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = v.memberId + '/' + safeKey + '.jpg';
    const up = await supabase.storage.from(bucket).upload(path, buf, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' });
    if (up.error) return res.status(500).json({ error: up.error.message });
    const pub = supabase.storage.from(bucket).getPublicUrl(path);
    const url = (pub && pub.data && pub.data.publicUrl) || null;
    return res.json({ success: true, url: url ? (url + '?v=' + Date.now()) : null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});
// v76: Partner WELCOME email — sent on instant self-signup (account is already live + signed in).
// Informational only: what they can do now. No verify link / no gate.
async function sendProviderWelcomeEmail(email, businessName, contactName, loginUrl) {
  const html = `
    <div style="font-family:Montserrat,sans-serif;max-width:480px;margin:0 auto;background:#081420;color:#fff;padding:32px;border-radius:16px;">
      <div style="font-size:22px;font-weight:900;letter-spacing:3px;margin-bottom:8px;">FFP <span style="color:#2ba8e0;">PASSPORT</span></div>
      <div style="font-size:12px;color:#6a90a8;letter-spacing:2px;text-transform:uppercase;margin-bottom:28px;">Partner Account</div>
      <p style="font-size:18px;color:#fff;font-weight:700;margin:0 0 14px;">Welcome to Find Fit People, ${escapeHtml(contactName || businessName || 'there')}.</p>
      <p style="font-size:14px;color:#9dbdd0;line-height:1.7;margin:0 0 14px;">
        Your partner account for <strong style="color:#fff;">${escapeHtml(businessName || '')}</strong> is live and you're signed in. Here's what you can do from your FFP Partner dashboard:
      </p>
      <ul style="font-size:14px;color:#9dbdd0;line-height:1.8;margin:0 0 18px;padding-left:18px;">
        <li><strong style="color:#fff;">Upload your services</strong> &mdash; Experiences (Classes / Tours), Events or Trips that go on the <a href="https://www.findfitpeople.com" style="color:#2ba8e0;">findfitpeople.com</a> booking platform.</li>
        <li><strong style="color:#fff;">Create Quests</strong> for your facility.</li>
        <li><strong style="color:#fff;">Create Challenges</strong> for others to come and compete in.</li>
      </ul>
      <div style="text-align:center;margin:26px 0 22px;">
        <a href="${loginUrl}" style="display:inline-block;background:#FFCC00;color:#082335;text-decoration:none;font-weight:800;font-size:14px;padding:14px 34px;border-radius:8px;letter-spacing:.4px;">Open my dashboard</a>
      </div>
      <p style="font-size:12px;color:#6a90a8;line-height:1.7;">
        Next time you visit, sign in at ${escapeHtml(loginUrl)} &mdash; choose Partner, enter this email, and we'll send you a 6-digit code.
      </p>
      <div style="margin-top:30px;padding-top:22px;border-top:1px solid rgba(43,168,224,.1);font-size:11px;color:#6a90a8;">
        FFP Passport · findfitpeople.com · If you didn't create this account, please email providers@findfitpeople.com.
      </div>
    </div>
  `;
  await mailer.sendMail({
    from: '"Find Fit People" <noreply@ffppassport.com>',
    to: email,
    subject: 'Welcome to Find Fit People — your partner account is ready',
    html
  });
}
async function sendProviderVerifyEmail(email, businessName, contactName, verifyUrl) {
  const html = `
    <div style="font-family:Montserrat,sans-serif;max-width:480px;margin:0 auto;background:#081420;color:#fff;padding:32px;border-radius:16px;">
      <div style="font-size:22px;font-weight:900;letter-spacing:3px;margin-bottom:8px;">FFP <span style="color:#2ba8e0;">PASSPORT</span></div>
      <div style="font-size:12px;color:#6a90a8;letter-spacing:2px;text-transform:uppercase;margin-bottom:28px;">Provider Partnerships</div>
      <p style="font-size:18px;color:#fff;font-weight:700;margin:0 0 14px;">Welcome, ${escapeHtml(contactName || businessName || 'there')}.</p>
      <p style="font-size:14px;color:#9dbdd0;line-height:1.7;margin:0 0 14px;">
        Your provider account for <strong style="color:#fff;">${escapeHtml(businessName || '')}</strong> is ready. Confirm your email to activate it and head to your dashboard.
      </p>
      <p style="font-size:14px;color:#9dbdd0;line-height:1.7;margin:0 0 8px;">
        You can build Events, Experiences and Challenges right away. They stay private until our team approves them to go live &mdash; free while we're in preview.
      </p>
      <div style="text-align:center;margin:26px 0 22px;">
        <a href="${verifyUrl}" style="display:inline-block;background:#FFCC00;color:#082335;text-decoration:none;font-weight:800;font-size:14px;padding:14px 34px;border-radius:8px;letter-spacing:.4px;">Confirm email &amp; log in</a>
      </div>
      <p style="font-size:12px;color:#6a90a8;line-height:1.7;">
        After confirming you'll land on the login page &mdash; enter your email, we'll send you a 6-digit code, and you're in.
      </p>
      <div style="margin-top:30px;padding-top:22px;border-top:1px solid rgba(43,168,224,.1);font-size:11px;color:#6a90a8;">
        FFP Passport · ffppassport.com · If you didn't request this, you can ignore this email.
      </div>
    </div>
  `;
  await mailer.sendMail({
    from: '"FFP Passport" <noreply@ffppassport.com>',
    to: email,
    subject: 'Confirm your FFP Passport provider account',
    html
  });
}

// ── v62: MEET & MOVE lifecycle emails (brandEmail wrapper, no emojis) ──────────
function mtgWhen(iso) {
  try { return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Dubai' }); }
  catch (e) { return iso || ''; }
}
function mtgDetailBlock(m) {
  var loc = [m.venue, m.city].filter(Boolean).join(' · ');
  var maps = m.maps_url ? ('<div style="margin-top:8px;"><a href="' + m.maps_url + '" style="color:#2ba8e0;font-weight:700;text-decoration:none;font-size:13px;">Open in Maps</a></div>') : '';
  return '<table role="presentation" width="100%" style="background:#f7fafc;border:1px solid #e7eef4;border-radius:12px;margin:4px 0 18px;"><tr><td style="padding:16px 18px;">'
    + '<div style="font-size:17px;font-weight:800;color:#0f2c47;">' + escapeHtml(m.title || m.sport || 'Meet-up') + '</div>'
    + (m.sport ? ('<div style="font-size:12px;color:#8196a6;font-weight:700;text-transform:uppercase;letter-spacing:.6px;margin-top:3px;">' + escapeHtml(m.sport) + '</div>') : '')
    + '<div style="font-size:14px;color:#44586a;margin-top:10px;"><strong style="color:#0f2c47;">When:</strong> ' + escapeHtml(mtgWhen(m.meets_at)) + '</div>'
    + (loc ? ('<div style="font-size:14px;color:#44586a;margin-top:4px;"><strong style="color:#0f2c47;">Where:</strong> ' + escapeHtml(loc) + '</div>') : '')
    + maps
    + '</td></tr></table>';
}
function mtgCta(label) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0;"><tr><td style="background:#FFCC00;border-radius:10px;"><a href="https://ffppassport.com/ffp-member-dashboard.html#meetmove" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:800;color:#0f2c47;text-decoration:none;">' + label + '</a></td></tr></table>';
}
async function sendMeetupConfirmEmail(toEmail, name, m, hostName) {
  var hi = name ? ('Hi ' + escapeHtml(name) + '. ') : '';
  var body = '<div style="font-size:24px;font-weight:800;color:#0f2c47;margin-bottom:6px;letter-spacing:-0.3px;">You’re going</div>'
   + '<p style="font-size:14px;color:#5b7186;line-height:1.6;margin:0 0 12px;">' + hi + 'You’re confirmed for this meet-up' + (hostName ? (' hosted by <strong style="color:#0f2c47;">' + escapeHtml(hostName) + '</strong>') : '') + '. See you there.</p>'
   + mtgDetailBlock(m) + mtgCta('View meet-up');
  await mailer.sendMail({ from: '"FFP Passport" <noreply@ffppassport.com>', to: toEmail, subject: 'You’re going: ' + (m.title || m.sport || 'FFP meet-up'), html: brandEmail('Meet & Move', body) });
}
async function sendMeetupReminderEmail(toEmail, name, m, hostName) {
  var hi = name ? ('Hi ' + escapeHtml(name) + '. ') : '';
  var body = '<div style="font-size:24px;font-weight:800;color:#0f2c47;margin-bottom:6px;letter-spacing:-0.3px;">Coming up soon</div>'
   + '<p style="font-size:14px;color:#5b7186;line-height:1.6;margin:0 0 12px;">' + hi + 'A meet-up you joined is happening soon' + (hostName ? (' — hosted by <strong style="color:#0f2c47;">' + escapeHtml(hostName) + '</strong>') : '') + '. Here are the details.</p>'
   + mtgDetailBlock(m) + mtgCta('View meet-up');
  await mailer.sendMail({ from: '"FFP Passport" <noreply@ffppassport.com>', to: toEmail, subject: 'Reminder: ' + (m.title || m.sport || 'your FFP meet-up') + ' is coming up', html: brandEmail('Meet & Move', body) });
}
async function sendMeetupCancelEmail(toEmail, name, m) {
  var hi = name ? ('Hi ' + escapeHtml(name) + '. ') : '';
  var body = '<div style="font-size:24px;font-weight:800;color:#0f2c47;margin-bottom:6px;letter-spacing:-0.3px;">Meet-up cancelled</div>'
   + '<p style="font-size:14px;color:#5b7186;line-height:1.6;margin:0 0 12px;">' + hi + 'Unfortunately this meet-up has been cancelled by the host. Sorry for any inconvenience.</p>'
   + mtgDetailBlock(m)
   + '<p style="font-size:13px;color:#5b7186;line-height:1.6;margin:0 0 6px;">Plenty more happening on FFP — find another or host your own.</p>'
   + mtgCta('Find a meet-up');
  await mailer.sendMail({ from: '"FFP Passport" <noreply@ffppassport.com>', to: toEmail, subject: 'Cancelled: ' + (m.title || m.sport || 'FFP meet-up'), html: brandEmail('Meet & Move', body) });
}
// v72: emailed to the HOST when a member REQUESTS to join (they must approve before the member is confirmed).
async function sendMeetupRequestEmail(toEmail, hostName, requesterName, m) {
  var hi = hostName ? ('Hi ' + escapeHtml(hostName) + '. ') : '';
  var who = requesterName ? escapeHtml(requesterName) : 'Someone';
  var body = '<div style="font-size:24px;font-weight:800;color:#0f2c47;margin-bottom:6px;letter-spacing:-0.3px;">New request to join</div>'
   + '<p style="font-size:14px;color:#5b7186;line-height:1.6;margin:0 0 12px;">' + hi + '<strong style="color:#0f2c47;">' + who + '</strong> has requested to join your meet-up. Open the app to approve them — they won’t be confirmed until you do.</p>'
   + mtgDetailBlock(m) + mtgCta('Review request');
  await mailer.sendMail({ from: '"FFP Passport" <noreply@ffppassport.com>', to: toEmail, subject: who + ' wants to join your meet-up', html: brandEmail('Meet & Move', body) });
}

// Event-driven notify: request→host (v72), confirmation on APPROVE, cancellation on host-cancel (client calls after the RPC).
app.post('/api/meetups/notify', async (req, res) => {
  try {
    var kind = (req.body && req.body.kind) || '';
    var meetupId = req.body && req.body.meetup_id;
    var memberId = req.body && req.body.member_id;
    if (!meetupId || !kind) return res.status(400).json({ error: 'kind and meetup_id required' });
    const { data: m } = await supabase.from('meetups').select('*').eq('id', meetupId).maybeSingle();
    if (!m) return res.status(404).json({ error: 'meetup not found' });
    let hostName = null;
    if (m.host_member_id) { const { data: h } = await supabase.from('members').select('full_name').eq('id', m.host_member_id).maybeSingle(); hostName = h && h.full_name; }
    if (kind === 'request') {
      // v72: a member requested to join → email the HOST so they can approve.
      if (!memberId) return res.status(400).json({ error: 'member_id required' });
      if (!m.host_member_id) return res.json({ success: true });
      const { data: host } = await supabase.from('members').select('email, full_name').eq('id', m.host_member_id).maybeSingle();
      const { data: reqr } = await supabase.from('members').select('full_name').eq('id', memberId).maybeSingle();
      if (host && host.email) { try { await sendMeetupRequestEmail(host.email, host.full_name, reqr && reqr.full_name, m); } catch (e) { console.warn('meetup request email:', e.message); } }
      try { await notifyMember(m.host_member_id, { title: 'New meet-up request', body: ((reqr && reqr.full_name) || 'Someone') + ' wants to join ' + (m.title || 'your meet-up'), icon: 'group_add', link: '/ffp-member-dashboard.html#panel-meetups' }); } catch (e) {}
      return res.json({ success: true });
    }
    if (kind === 'confirm') {
      if (!memberId) return res.status(400).json({ error: 'member_id required' });
      const { data: mem } = await supabase.from('members').select('email, full_name').eq('id', memberId).maybeSingle();
      if (mem && mem.email) { try { await sendMeetupConfirmEmail(mem.email, mem.full_name, m, hostName); } catch (e) { console.warn('meetup confirm email:', e.message); } }
      try { await notifyMember(memberId, { title: 'Meet-up confirmed', body: 'You are in for ' + (m.title || 'the meet-up') + (m.city ? ' in ' + m.city : ''), icon: 'event_available', link: '/ffp-member-dashboard.html#panel-meetups' }); } catch (e) {}
      return res.json({ success: true });
    }
    if (kind === 'cancel') {
      const { data: atts } = await supabase.from('meetup_attendees').select('member_id, member:member_id(email, full_name)').eq('meetup_id', meetupId);
      let sent = 0;
      for (const a of (atts || [])) {
        const em = a.member && a.member.email;
        if (em) { try { await sendMeetupCancelEmail(em, a.member.full_name, m); sent++; } catch (e) { console.warn('meetup cancel email:', e.message); } }
        try { await notifyMember(a.member_id, { title: 'Meet-up cancelled', body: (m.title || 'A meet-up') + ' has been cancelled', icon: 'event_busy', link: '/ffp-member-dashboard.html#panel-meetups' }); } catch (e) {}
      }
      return res.json({ success: true, emailed: sent });
    }
    return res.status(400).json({ error: 'unknown kind' });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ── v73: EVENT RSVP emails. ev = events row (+ pname = provider business name). Reuses the meet-move
// email layout (mtgDetailBlock builds the When/Where card). Event QR check-in records attendance later.
function evtAsBlock(ev) {
  return { title: ev.title, sport: ev.activity || ev.category, meets_at: ev.starts_at,
           venue: ev.venue, city: ev.city, maps_url: ev.maps_url || null };
}
function evtCta(label) {
  return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0;"><tr><td style="background:#FFCC00;border-radius:10px;"><a href="https://ffppassport.com/ffp-member-dashboard.html#panel-events" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:800;color:#0f2c47;text-decoration:none;">' + label + '</a></td></tr></table>';
}
async function sendEventRsvpMemberEmail(toEmail, name, ev) {
  var hi = name ? ('Hi ' + escapeHtml(name) + '. ') : '';
  var body = '<div style="font-size:24px;font-weight:800;color:#0f2c47;margin-bottom:6px;letter-spacing:-0.3px;">You’re confirmed to attend</div>'
   + '<p style="font-size:14px;color:#5b7186;line-height:1.6;margin:0 0 12px;">' + hi + 'You’re confirmed for this event' + (ev.pname ? (' at <strong style="color:#0f2c47;">' + escapeHtml(ev.pname) + '</strong>') : '') + '. On the day, check in with your FFP Passport at the venue to mark your attendance.</p>'
   + mtgDetailBlock(evtAsBlock(ev)) + evtCta('View event');
  await mailer.sendMail({ from: '"FFP Passport" <noreply@ffppassport.com>', to: toEmail, subject: 'You’re confirmed: ' + (ev.title || 'FFP event'), html: brandEmail('Events', body) });
}
async function sendEventRsvpProviderEmail(toEmail, providerName, attendeeName, ev) {
  var hi = providerName ? ('Hi ' + escapeHtml(providerName) + '. ') : '';
  var who = attendeeName ? escapeHtml(attendeeName) : 'Someone';
  var body = '<div style="font-size:24px;font-weight:800;color:#0f2c47;margin-bottom:6px;letter-spacing:-0.3px;">New RSVP to your event</div>'
   + '<p style="font-size:14px;color:#5b7186;line-height:1.6;margin:0 0 12px;">' + hi + '<strong style="color:#0f2c47;">' + who + '</strong> has RSVP’d to your event. Their FFP Passport is on your guest list — they’ll check in with it when they arrive.</p>'
   + mtgDetailBlock(evtAsBlock(ev)) + evtCta('View event');
  await mailer.sendMail({ from: '"FFP Passport" <noreply@ffppassport.com>', to: toEmail, subject: who + ' RSVP’d to your event', html: brandEmail('Events', body) });
}
// Event-driven notify: member confirmation + provider alert on RSVP (loader calls after rsvp_event RPC).
app.post('/api/events/notify', async (req, res) => {
  try {
    var kind = (req.body && req.body.kind) || '';
    var eventId = req.body && req.body.event_id;
    var memberId = req.body && req.body.member_id;
    if (!eventId || !kind) return res.status(400).json({ error: 'kind and event_id required' });
    const { data: ev } = await supabase.from('events').select('*').eq('id', eventId).maybeSingle();
    if (!ev) return res.status(404).json({ error: 'event not found' });
    if (kind === 'rsvp') {
      if (!memberId) return res.status(400).json({ error: 'member_id required' });
      let provName = null, provEmail = null;
      if (ev.provider_id) {
        const { data: pr } = await supabase.from('providers').select('business_name, contact_email, owner_user_id').eq('id', ev.provider_id).maybeSingle();
        if (pr) {
          provName = pr.business_name; provEmail = pr.contact_email;
          if (!provEmail && pr.owner_user_id) { const { data: ow } = await supabase.from('members').select('email').eq('id', pr.owner_user_id).maybeSingle(); provEmail = ow && ow.email; }
        }
      }
      ev.pname = provName;
      const { data: mem } = await supabase.from('members').select('email, full_name').eq('id', memberId).maybeSingle();
      if (mem && mem.email) { try { await sendEventRsvpMemberEmail(mem.email, mem.full_name, ev); } catch (e) { console.warn('event rsvp member email:', e.message); } }
      try { await notifyMember(memberId, { title: 'You are confirmed', body: 'You are confirmed for ' + (ev.title || 'the event'), icon: 'event', link: '/ffp-member-dashboard.html' }); } catch (e) {}
      if (provEmail) { try { await sendEventRsvpProviderEmail(provEmail, provName, mem && mem.full_name, ev); } catch (e) { console.warn('event rsvp provider email:', e.message); } }
      return res.json({ success: true });
    }
    return res.status(400).json({ error: 'unknown kind' });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// v74: SHARED member-email endpoint. Find Fit People (and any FFP surface) calls this to email a member
// via the branded Resend shell — pairs with a notifications-table insert for the in-app Passport bell, so a
// booking confirmation reaches both. Body: { to_member_id, subject, heading, body }. `body` is HTML the
// caller provides. (Mirrors the open /api/events/notify pattern; CORS is already '*'.)
app.post('/api/notify/member', async (req, res) => {
  try {
    var b = req.body || {};
    var toMemberId = b.to_member_id;
    var subject = (b.subject || '').toString().trim();
    var heading = (b.heading || '').toString().trim();
    var bodyHtml = (b.body || '').toString();
    if (!toMemberId || !subject || !bodyHtml.trim()) {
      return res.status(400).json({ error: 'to_member_id, subject and body required' });
    }
    const { data: mem } = await supabase.from('members').select('email, full_name').eq('id', toMemberId).maybeSingle();
    if (!mem || !mem.email) return res.status(404).json({ error: 'member or email not found' });
    var firstName = String((mem.full_name || '').split(' ')[0] || 'there').replace(/[<>]/g, '');
    var html = brandEmail(heading || subject, '<p style="margin:0 0 14px;">Hi ' + firstName + ',</p>' + bodyHtml);
    await mailer.sendMail({ from: '"FFP Passport" <noreply@ffppassport.com>', to: mem.email, subject: subject, html: html });
    try { var _pb = bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 140); await notifyMember(toMemberId, { title: subject, body: _pb, icon: 'notifications', link: '/ffp-member-dashboard.html' }); } catch (e) {}
    return res.json({ success: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Reminder cron — meet-ups starting within 24h, email each attendee once (reminder_sent_at flag).
app.get('/api/cron/meetup-reminders', async (req, res) => {
  var secret = process.env.CRON_SECRET || '';
  var auth = req.headers['authorization'] || '';
  var ok = secret && (auth === ('Bearer ' + secret) || req.query.secret === secret);
  if (!ok) return res.status(401).json({ error: 'unauthorized' });
  try {
    // TWO reminder windows, each tracked by its own flag so a member gets BOTH (day-before + starting-soon).
    // For the 2-hour reminder to be timely this endpoint must be called HOURLY (see deploy notes). Calling it
    // only once a day still delivers the day-before nudge; the 2h one just won't be precise.
    const now = Date.now();
    const sendHour = new Date(now).getUTCHours();   // gate the day-before nudge to UAE daytime (no 3am buzzes)
    const nowIso = new Date(now).toISOString();
    const soonIso = new Date(now + 24 * 60 * 60 * 1000).toISOString();
    const { data: ms } = await supabase.from('meetups').select('*').gte('meets_at', nowIso).lte('meets_at', soonIso).neq('status', 'cancelled');
    let dayBefore = 0, startingSoon = 0;
    for (const m of (ms || [])) {
      const hoursAway = (new Date(m.meets_at).getTime() - now) / 3600000;
      let hostName = null;
      if (m.host_member_id) { const { data: h } = await supabase.from('members').select('full_name').eq('id', m.host_member_id).maybeSingle(); hostName = h && h.full_name; }
      const { data: atts } = await supabase.from('meetup_attendees').select('id, member_id, reminder_sent_at, reminder_2h_sent_at, member:member_id(email, full_name)').eq('meetup_id', m.id);
      for (const a of (atts || [])) {
        const em = a.member && a.member.email;
        // DAY-BEFORE: anything 2–24h out, once — but only sent during daytime (05–18 UTC = 9am–10pm UAE),
        // so a reminder never buzzes someone at 3am. (UAE is the primary market; this is UAE-tuned.)
        if (hoursAway > 2 && hoursAway <= 24 && !a.reminder_sent_at && sendHour >= 5 && sendHour <= 18) {
          if (em) { try { await sendMeetupReminderEmail(em, a.member.full_name, m, hostName); } catch (e) { console.warn('meetup reminder email:', e.message); } }
          try { await notifyMember(a.member_id, { title: 'Upcoming meet-up', body: (m.title || 'Your meet-up') + ' is coming up' + (m.city ? ' in ' + m.city : ''), icon: 'event', link: '/ffp-member-dashboard.html#panel-meetups' }); } catch (e) {}
          try { await supabase.from('meetup_attendees').update({ reminder_sent_at: new Date().toISOString() }).eq('id', a.id); } catch (e) {}
          dayBefore++;
        }
        // STARTING SOON: within the next 2h, once.
        if (hoursAway > 0 && hoursAway <= 2 && !a.reminder_2h_sent_at) {
          if (em) { try { await sendMeetupReminderEmail(em, a.member.full_name, m, hostName); } catch (e) { console.warn('meetup 2h email:', e.message); } }
          try { await notifyMember(a.member_id, { title: 'Meet-up starting soon', body: (m.title || 'Your meet-up') + ' starts in about 2 hours' + (m.city ? ' in ' + m.city : ''), icon: 'schedule', link: '/ffp-member-dashboard.html#panel-meetups' }); } catch (e) {}
          try { await supabase.from('meetup_attendees').update({ reminder_2h_sent_at: new Date().toISOString() }).eq('id', a.id); } catch (e) {}
          startingSoon++;
        }
      }
    }
    return res.json({ success: true, day_before: dayBefore, starting_soon: startingSoon });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ── NOTIFICATIONS — member bell feed + seen + admin broadcast (step 1 of the notifications build) ──
// The notifications TABLE + bell UI already existed; these are the missing backend endpoints the bell
// calls. Table cols: audience, member_id (NULL = broadcast to all), title, body, icon, link, created_at.
// "unread" is tracked per member via members.notifs_seen_at (broadcasts are shared rows, so no per-row
// read flag). Service-role queries bypass RLS; member targeting is by member_id.
app.get('/api/notifications/:member_id', async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');   // v66: feed must never be cached (stale unread/badge)
    const memberId = req.params.member_id || req.query.member_id;       // v67: bell calls /api/notifications/<id> (path param)
    if (!memberId) return res.json({ success: true, notifications: [], unread: 0 });
    const { data: mem } = await supabase.from('members').select('notifs_seen_at').eq('id', memberId).maybeSingle();
    const seenAt = (mem && mem.notifs_seen_at) ? new Date(mem.notifs_seen_at).getTime() : 0;
    const { data: rows, error } = await supabase
      .from('notifications')
      .select('id, icon, title, body, link, created_at, member_id')
      .or('member_id.eq.' + memberId + ',member_id.is.null')
      .order('created_at', { ascending: false })
      .limit(40);
    if (error) { console.error('[notifications] list:', error.message); return res.json({ success: true, notifications: [], unread: 0 }); }
    const list = rows || [];
    const unread = list.filter(function (n) { return new Date(n.created_at).getTime() > seenAt; }).length;
    return res.json({ success: true, notifications: list, unread: unread });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

app.post('/api/notifications/seen', async (req, res) => {
  try {
    const memberId = req.body && req.body.member_id;
    if (!memberId) return res.status(400).json({ error: 'member_id required' });
    await supabase.from('members').update({ notifs_seen_at: new Date().toISOString() }).eq('id', memberId);
    return res.json({ success: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Admin broadcast — audience 'all' → one row with member_id NULL (everyone). member_ids[] → one row each.
app.post('/api/admin/broadcast', async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.admin_id) return res.status(400).json({ error: 'admin_id required' });
    const { data: adm } = await supabase.from('admin_users').select('id').eq('id', b.admin_id).maybeSingle();
    if (!adm) return res.status(403).json({ error: 'not admin' });
    if (!b.title) return res.status(400).json({ error: 'title required' });
    const icon = b.icon || 'campaign';
    let rows;
    if (Array.isArray(b.member_ids) && b.member_ids.length) {
      rows = b.member_ids.map(function (mid) { return { audience: 'member', member_id: mid, title: b.title, body: b.body || null, icon: icon, link: b.link || null }; });
    } else {
      rows = [{ audience: 'all', member_id: null, title: b.title, body: b.body || null, icon: icon, link: b.link || null }];
    }
    const { error } = await supabase.from('notifications').insert(rows);
    if (error) { console.error('[broadcast]', error.message); return res.status(500).json({ error: error.message }); }
    // v83: also deliver as a PHONE push to opted-in members (rides along with the in-app bell notification).
    try {
      const pl = { title: b.title, body: b.body || '', url: b.link || '/ffp-member-dashboard.html', icon: '/assets/icons/ffp-icon-192.png' };
      if (Array.isArray(b.member_ids) && b.member_ids.length) { for (const mid of b.member_ids) { await sendPushToMember(mid, pl); } }
      else { await sendPushToAll(pl); }
    } catch (e) { console.warn('[broadcast push]', e.message); }
    return res.json({ success: true, sent: rows.length });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ── WEB PUSH (v83) — phone notifications for installed PWAs ───────────────────────────────────
// VAPID keys come from env (VAPID_PRIVATE_KEY is a secret; the public key has a baked default since it's
// public by design). web-push is installed by Vercel from package.json. If keys aren't set yet, PUSH_READY
// stays false and every send is a safe no-op — the app still works, it just won't push until configured.
const webpush = require('web-push');
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  || 'BPx1WNwnR2fXuLgS6LFvUSRsT7Xhm-PkSyhROdfkzCOQImwKXiLk0R15Q8WWANEyeiGGQL2gy87QTzm2EU4bgE4';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@findfitpeople.com';
let PUSH_READY = false;
try {
  if (VAPID_PUBLIC && VAPID_PRIVATE) { webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE); PUSH_READY = true; }
  else console.warn('[push] VAPID_PRIVATE_KEY not set — push disabled until configured in Vercel env');
} catch (e) { console.warn('[push] VAPID setup failed:', e.message); }

// Send a payload to a set of subscription rows; prune dead endpoints (404/410 = gone).
async function _sendPushTo(subRows, payloadObj) {
  if (!PUSH_READY || !subRows || !subRows.length) return 0;
  const payload = JSON.stringify(payloadObj);
  let sent = 0;
  for (const s of subRows) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      sent++;
    } catch (err) {
      const code = err && err.statusCode;
      if (code === 404 || code === 410) { try { await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint); } catch (e) {} }
      else console.warn('[push] send failed', code, err && err.message);
    }
  }
  return sent;
}
async function sendPushToMember(memberId, payloadObj) {
  if (!PUSH_READY || !memberId) return 0;
  const { data } = await supabase.from('push_subscriptions').select('endpoint, p256dh, auth').eq('member_id', memberId);
  return _sendPushTo(data || [], payloadObj);
}
async function sendPushToAll(payloadObj) {
  if (!PUSH_READY) return 0;
  const { data } = await supabase.from('push_subscriptions').select('endpoint, p256dh, auth');
  return _sendPushTo(data || [], payloadObj);
}

// One call → BOTH the in-app bell row (notifications table) AND a phone push. n = { title, body, icon
// (material-symbol name for the bell), link }. Use this for event-driven member alerts so they show in the
// bell, on the lock screen, and (where the caller also sends one) by email.
async function notifyMember(memberId, n) {
  if (!memberId || !n || !n.title) return;
  try {
    await supabase.from('notifications').insert({
      audience: 'member', member_id: memberId, title: n.title, body: n.body || null,
      icon: n.icon || 'notifications', link: n.link || null
    });
  } catch (e) { console.warn('[notify] bell insert:', e.message); }
  try { await sendPushToMember(memberId, { title: n.title, body: n.body || '', url: n.link || '/ffp-member-dashboard.html', icon: '/assets/icons/ffp-icon-192.png' }); } catch (e) {}
}

// Member subscribes (after granting permission in the browser). Upsert by endpoint; send a welcome push.
app.post('/api/push/subscribe', async (req, res) => {
  try {
    const b = req.body || {};
    const memberId = b.member_id;
    const sub = b.subscription;
    if (!memberId || !sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
      return res.status(400).json({ error: 'member_id + full subscription required' });
    }
    const row = {
      member_id: memberId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth,
      user_agent: String(b.user_agent || '').slice(0, 300), last_used_at: new Date().toISOString()
    };
    const { error } = await supabase.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' });
    if (error) return res.status(500).json({ error: error.message });
    try { await sendPushToMember(memberId, { title: 'Notifications on', body: 'You will now get FFP Passport alerts on this device.', url: '/ffp-member-dashboard.html', icon: '/assets/icons/ffp-icon-192.png' }); } catch (e) {}
    return res.json({ success: true, push_ready: PUSH_READY });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

app.post('/api/push/unsubscribe', async (req, res) => {
  try {
    const ep = req.body && req.body.endpoint;
    if (!ep) return res.status(400).json({ error: 'endpoint required' });
    await supabase.from('push_subscriptions').delete().eq('endpoint', ep);
    return res.json({ success: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Send a test push to one member (used by the Profile "send test" + for our own verification).
app.post('/api/push/test', async (req, res) => {
  try {
    const memberId = req.body && req.body.member_id;
    if (!memberId) return res.status(400).json({ error: 'member_id required' });
    const n = await sendPushToMember(memberId, { title: 'FFP Passport', body: 'Test notification — you are all set.', url: '/ffp-member-dashboard.html', icon: '/assets/icons/ffp-icon-192.png' });
    return res.json({ success: true, sent: n, push_ready: PUSH_READY });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

app.post('/api/provider/signup', async (req, res) => {
  try {
    const {
      business_name, contact_name, email,
      country, city, category, provider_type,
      phone, phone_country_code, website, about
    } = req.body || {};

    const cleanEmail = String(email || '').trim().toLowerCase();
    const biz = String(business_name || '').trim();
    const contact = String(contact_name || '').trim();
    if (!biz || !contact || !cleanEmail || !country || !city) {
      return res.status(400).json({ error: 'Please fill in business name, contact name, email, country and city.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const { data: existing } = await supabase
      .from('members').select('id').eq('email', cleanEmail).maybeSingle();
    if (existing) {
      return res.status(409).json({ error: 'An account already exists for this email. Please log in instead.' });
    }

    const { hash } = generateCode(); // placeholder; replaced when they request a code at login
    const passport_no = `FFP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9999 + 1)).padStart(4, '0')}`;
    const { data: member, error: mErr } = await supabase
      .from('members')
      .insert({
        email: cleanEmail, full_name: contact, access_code: hash,
        role: 'provider', status: 'active', verified: true, passport_no, // v76: signed in directly → no email-verify gate
        phone: phone || null, phone_country_code: phone_country_code || null
      })
      .select('id').single();
    if (mErr) {
      console.error('[provider/signup] member insert:', mErr);
      return res.status(500).json({ error: 'Could not create your account. Please try again.' });
    }

    const { error: pErr } = await supabase
      .from('providers')
      .insert({
        owner_user_id: member.id, business_name: biz, category: category || null,
        provider_type: provider_type || null, country, city,
        contact_email: cleanEmail,
        contact_phone: (phone_country_code && phone) ? (phone_country_code + ' ' + phone) : (phone || null),
        website: website || null, about: about || null,
        status: 'approved', approved_at: new Date().toISOString() // instant, self-serve account — no admin approval step
      });
    if (pErr) {
      console.error('[provider/signup] provider insert:', pErr);
      await supabase.from('members').delete().eq('id', member.id); // roll back so they can retry
      return res.status(500).json({ error: 'Could not create your provider profile. Please try again.' });
    }

    // v76: INSTANT SIGN-IN. Mint the same session the login flow issues so the signup page can drop the
    // new partner straight into their dashboard — no email-verify click, no 6-digit code step. The email
    // is now informational (a welcome + what-you-can-do guide), not a gate.
    const { data: fullMember } = await supabase
      .from('members').select('*').eq('id', member.id).single();
    const sessionMember = fullMember || {
      id: member.id, email: cleanEmail, full_name: contact, role: 'provider', status: 'active'
    };
    const { access_code: _ac, ...memberSafe } = sessionMember;
    const token = crypto.randomBytes(32).toString('hex');

    let email_sent = false;
    try {
      await sendProviderWelcomeEmail(cleanEmail, biz, contact, `${SITE_URL}/login`);
      email_sent = true;
    } catch (e) {
      console.error('[provider/signup] welcome email failed (non-blocking):', e);
    }

    res.json({
      success: true,
      email: cleanEmail,
      email_sent,
      token,
      jwt: mintSupabaseJwt(sessionMember),      // short Supabase JWT for RLS (null until env set; refresh re-mints on dashboard boot)
      refresh: mintRefreshToken(sessionMember), // long-lived refresh → /api/auth/refresh
      member: memberSafe,
      redirect: '/ffp-provider-dashboard.html'
    });
  } catch (error) {
    console.error('[provider/signup] error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/provider/verify', async (req, res) => {
  const memberId = verifyProviderToken(req.query.token);
  if (!memberId) return res.redirect(302, `${SITE_URL}/login.html?verify=expired`);
  try {
    const { data: member } = await supabase
      .from('members').select('id, email').eq('id', memberId).single();
    if (!member) return res.redirect(302, `${SITE_URL}/login.html?verify=expired`);
    await supabase.from('members').update({ verified: true }).eq('id', memberId);
    return res.redirect(302, `${SITE_URL}/login.html?verified=1&email=${encodeURIComponent(member.email)}`);
  } catch (e) {
    console.error('[provider/verify] error:', e);
    return res.redirect(302, `${SITE_URL}/login.html?verify=error`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GEO — resolve a Google Maps link (short or full) to lat/lng  [added 2026-06-02]
// Provider pastes their Google Maps link in their profile; we follow any short-link
// redirect server-side and extract the venue pin used for member check-in GPS verification.
// ─────────────────────────────────────────────────────────────────────────────
function parseLatLng(s) {
  if (!s) return null; s = String(s);
  var m = s.match(/@(-?\d{1,3}\.\d{3,}),(-?\d{1,3}\.\d{3,})/)
       || s.match(/!3d(-?\d{1,3}\.\d{3,})!4d(-?\d{1,3}\.\d{3,})/)
       || s.match(/[?&](?:q|query|ll|center|daddr|destination)=(-?\d{1,3}\.\d{3,}),(-?\d{1,3}\.\d{3,})/)
       || s.match(/\/(-?\d{1,3}\.\d{3,}),(-?\d{1,3}\.\d{3,})/);
  if (!m) return null;
  var lat = parseFloat(m[1]), lng = parseFloat(m[2]);
  if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: lat, lng: lng };
}
app.get('/api/geo/resolve', async (req, res) => {
  try {
    var url = req.query.url;
    if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'A Google Maps link is required.' });
    if (!/(google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps|maps\.google|g\.co\/kgs)/i.test(url)) {
      return res.status(400).json({ error: 'That doesn’t look like a Google Maps link.' });
    }
    var coords = parseLatLng(url);
    var finalUrl = url;
    if (!coords) {
      var r = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; FFPbot/1.0)' } });
      finalUrl = r.url || url;
      coords = parseLatLng(finalUrl);
      if (!coords) { try { var body = await r.text(); coords = parseLatLng(body); } catch (e) {} }
    }
    if (!coords) return res.status(422).json({ error: 'Couldn’t find a map pin in that link. Open the place in Google Maps and copy the link again.', resolved_url: finalUrl });
    res.json({ lat: coords.lat, lng: coords.lng, resolved_url: finalUrl });
  } catch (e) {
    console.error('[geo/resolve]', e);
    res.status(500).json({ error: 'Could not resolve that link — please try again.' });
  }
});

app.get('/api/members/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: member, error } = await supabase
      .from('members')
      .select('id, email, full_name, passport_no, photo_url, bio, interests, fitness_level, date_of_birth, gender, points, tier, ambassador_tier, joined_at, visit_count, skills')
      .eq('id', id)
      .single();
    if (error || !member) return res.status(404).json({ error: 'Member not found' });
    res.json({ success: true, member });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// v51: member's activity logs (passport "journey"). The member dashboard's
// loadJourneyLogs() fetches this; without it the passport can't show saved logs
// or venue check-ins. Service-role read so it works for member sessions.
app.get('/api/members/:id/activity-logs', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: logs, error } = await supabase
      .from('activity_logs')
      .select('id, activity, category, venue, provider_id, duration_min, duration_sec, intensity, calories, distance_km, avg_heart_rate, notes, logged_at, city, country, verified, checkin_lat, checkin_lng')
      .eq('member_id', id)
      .order('logged_at', { ascending: false })
      .limit(500);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, logs: logs || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── MEMBER QUEST DISCOVERY (v69) ──
// The member Quests panel calls these. Service-role reads so member sessions work.
// Returns LIVE quests (incl. provider venue quests, scope='venue') + this member's progress.
app.get('/api/quests', async (req, res) => {
  try {
    const memberId = req.query.member_id || null;
    const { data: quests, error } = await supabase
      .from('quests')
      .select('id, title, description, category, scope, target_count, hero_image_url, reward_type, prize_total, prize_remaining, prize_text, active_to, provider_id, owner_type, created_by')
      .eq('status', 'live')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return res.status(500).json({ error: error.message });

    let progressByQuest = {};
    if (memberId) {
      const { data: prog } = await supabase
        .from('quest_progress')
        .select('quest_id, completed_count, status')
        .eq('member_id', memberId);
      (prog || []).forEach(p => { progressByQuest[p.quest_id] = { completed_count: p.completed_count, status: p.status }; });
    }
    // join counts (how many members are on each quest) — the social hook
    let joinByQuest = {};
    const { data: jc } = await supabase.from('quest_progress').select('quest_id');
    (jc || []).forEach(r => { joinByQuest[r.quest_id] = (joinByQuest[r.quest_id] || 0) + 1; });
    const out = (quests || []).map(q => Object.assign({}, q, {
      sponsors: null,
      progress: progressByQuest[q.id] || null,
      joined_count: joinByQuest[q.id] || 0
    }));
    res.json({ success: true, quests: out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Quest detail — the quest + its eligible venues (with provider name) + this member's progress.
app.get('/api/quests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const memberId = req.query.member_id || null;
    const { data: quest, error } = await supabase
      .from('quests')
      .select('id, title, description, category, scope, target_count, hero_image_url, reward_type, prize_total, prize_remaining, prize_text, active_to, provider_id, owner_type, created_by')
      .eq('id', id)
      .single();
    if (error || !quest) return res.status(404).json({ error: 'Quest not found' });

    const { data: venues } = await supabase
      .from('quest_venues')
      .select('provider_id, providers(business_name, city)')
      .eq('quest_id', id);

    let progress = null;
    if (memberId) {
      const { data: p } = await supabase
        .from('quest_progress')
        .select('completed_count, status')
        .eq('quest_id', id)
        .eq('member_id', memberId)
        .maybeSingle();
      progress = p || null;
    }
    const { count: joined_count } = await supabase
      .from('quest_progress')
      .select('*', { count: 'exact', head: true })
      .eq('quest_id', id);
    res.json({ success: true, quest, venues: venues || [], progress, joined_count: joined_count || 0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// v87: Invite FFP connections to "join me" on a quest — each invitee gets a bell row + phone push.
app.post('/api/quests/:id/invite', async (req, res) => {
  try {
    const questId = req.params.id;
    const fromId = (req.body && (req.body.from_member_id || req.body.member_id)) || null;
    let toIds = (req.body && req.body.to_member_ids) || [];
    if (!Array.isArray(toIds)) toIds = [];
    // de-dupe, drop blanks + don't invite yourself
    toIds = Array.from(new Set(toIds.filter(x => x && x !== fromId)));
    if (!fromId || !toIds.length) return res.status(400).json({ error: 'Missing inviter or recipients' });

    const { data: quest } = await supabase
      .from('quests').select('id, title, owner_type').eq('id', questId).single();
    if (!quest) return res.status(404).json({ error: 'Quest not found' });

    const { data: inviter } = await supabase
      .from('members').select('full_name').eq('id', fromId).maybeSingle();
    const who = (inviter && inviter.full_name) ? inviter.full_name : 'A friend';
    const title = quest.title || 'a quest';

    let sent = 0;
    for (const toId of toIds) {
      try {
        await notifyMember(toId, {
          title: who + ' invited you to a quest',
          body: 'Join me on “' + title + '” — tap to take a look',
          icon: 'explore',
          link: '/ffp-member-dashboard.html?quest=' + encodeURIComponent(questId) + '#panel-quests'
        });
        sent++;
      } catch (e) {}
    }
    res.json({ success: true, sent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.put('/api/members/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      full_name, surname, given_names, email, phone, phone_country_code, city, country, nationality,
      photo_url, bio, interests, fitness_level, date_of_birth, gender, skills, preferences, height_cm
    } = req.body;
    const { data: member, error } = await supabase
      .from('members')
      .update({
        full_name: full_name || undefined,
        surname: surname || undefined,
        given_names: given_names || undefined,
        email: email || undefined,
        phone: phone || undefined,
        phone_country_code: phone_country_code || undefined,
        city: city || undefined,
        country: country || undefined,
        nationality: nationality || undefined,
        photo_url: photo_url || undefined,
        bio: bio || undefined,
        interests: interests || undefined,
        fitness_level: fitness_level || undefined,
        date_of_birth: date_of_birth || undefined,
        gender: gender || undefined,
        skills: skills || undefined,
        preferences: preferences || undefined,
        height_cm: (height_cm === 0 || height_cm) ? height_cm : undefined,
        profile_complete: true
      })
      .eq('id', id)
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: 'Profile updated', member });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get('/api/members', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const { data: members, error } = await supabase
      .from('members')
      .select('id, full_name, photo_url, bio, interests, fitness_level, gender, city, points, profile_complete')
      .eq('status', 'active')
      .eq('profile_complete', true)
      .order('points', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, members, count: members.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/meetups', async (req, res) => {
  try {
    const { creator_id, title, description, location, date_time, max_attendees = 20 } = req.body;

    if (!creator_id || !title || !location || !date_time) {
      return res.status(400).json({ error: 'creator_id, title, location, and date_time required' });
    }
    const { data: meetup, error } = await supabase
      .from('meetups')
      .insert({ creator_id, title, description, location, date_time, max_attendees, status: 'active' })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    await supabase
      .from('meetup_attendees')
      .insert({ meetup_id: meetup.id, member_id: creator_id });
    res.json({ success: true, meetup });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get('/api/meetups', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const { data: meetups, error: meetupError } = await supabase
      .from('meetups')
      .select('*')
      .eq('status', 'active')
      .order('date_time', { ascending: true })
      .range(offset, offset + limit - 1);
    if (meetupError) return res.status(500).json({ error: meetupError.message });
    const meetupsWithAttendees = await Promise.all(
      meetups.map(async (meetup) => {
        const { data: attendees } = await supabase
          .from('meetup_attendees')
          .select('member_id')
          .eq('meetup_id', meetup.id);
        const { data: creator } = await supabase
          .from('members')
          .select('id, full_name, photo_url')
          .eq('id', meetup.creator_id)
          .single();
        return { ...meetup, attendee_count: (attendees && attendees.length) || 0, creator };
      })
    );
    res.json({ success: true, meetups: meetupsWithAttendees });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.get('/api/meetups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { data: meetup, error: meetupError } = await supabase
      .from('meetups')
      .select('*')
      .eq('id', id)
      .single();
    if (meetupError || !meetup) return res.status(404).json({ error: 'Meetup not found' });
    const { data: attendeeRecords } = await supabase
      .from('meetup_attendees')
      .select('member_id')
      .eq('meetup_id', id);
    const attendeeIds = (attendeeRecords || []).map(r => r.member_id);
    const { data: attendees } = await supabase
      .from('members')
      .select('id, full_name, photo_url, bio, interests')
      .in('id', attendeeIds);
    const { data: creator } = await supabase
      .from('members')
      .select('id, full_name, photo_url')
      .eq('id', meetup.creator_id)
      .single();
    res.json({
      success: true,
      meetup: { ...meetup, creator, attendees, attendee_count: (attendees && attendees.length) || 0 }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/meetups/:id/join', async (req, res) => {
  try {
    const { id } = req.params;
    const { member_id } = req.body;
    if (!member_id) return res.status(400).json({ error: 'member_id required' });
    const { data: existing } = await supabase
      .from('meetup_attendees')
      .select('id')
      .eq('meetup_id', id)
      .eq('member_id', member_id)
      .single();
    if (existing) return res.status(409).json({ error: 'Already joined this meetup' });
    const { data: attendee, error } = await supabase
      .from('meetup_attendees')
      .insert({ meetup_id: id, member_id })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: 'Joined meetup', attendee });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/meetups/:id/leave', async (req, res) => {
  try {
    const { id } = req.params;
    const { member_id } = req.body;
    if (!member_id) return res.status(400).json({ error: 'member_id required' });
    const { error } = await supabase
      .from('meetup_attendees')
      .delete()
      .eq('meetup_id', id)
      .eq('member_id', member_id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, message: 'Left meetup' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/calorie/save', async (req, res) => {
  try {
    const { member_id, calories, log_date } = req.body;
    if (!member_id || !calories) return res.status(400).json({ error: 'member_id and calories required' });
    const { data, error } = await supabase
      .from('calorie_logs')
      .insert({ member_id, calories, log_date: log_date || new Date().toISOString().split('T')[0] })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/visits/log', async (req, res) => {
  try {
    const { member_id, provider_id, qr_code } = req.body;
    if (!member_id || !provider_id) return res.status(400).json({ error: 'member_id and provider_id required' });
    const { data, error } = await supabase
      .from('visit_logs')
      .insert({ member_id, provider_id, qr_code, logged_at: new Date().toISOString() })
      .select()
      .single();
    if (error) return res.status(500).json({ error: error.message });
    await supabase
      .from('members')
      .update({ visit_count: supabase.raw('visit_count + 1') })
      .eq('id', member_id);
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// ============================================================
// v54: SUNDAY SUMMARY — weekly digest email (cron-triggered).
// One email per active member, all 8 areas + City/Gender/Age-group benchmarks,
// rendered per FFP-EMAIL-STANDARD (no emojis). Data from member_weekly_digest RPC.
// ============================================================
function ss_fmtMin(m){ m=Math.round(m||0); var h=Math.floor(m/60), mm=m%60; return h ? (h+'h'+(mm?(' '+mm+'m'):'')) : (mm+'m'); }
function ss_pct(you, avg){ you=Number(you)||0; if(!avg||avg<=0) return ''; var dd=Math.round((you/avg-1)*100); var col=dd>=0?'#1f8fd0':'#d65a5a'; return ' <span style="color:'+col+';font-weight:700;">'+(dd>=0?'+':'')+dd+'%</span>'; }
function ss_bench(you, b){
  function c(v){ return (v==null)?'—':v; }
  return '<table role="presentation" width="100%" style="margin-top:12px;font-size:11px;color:#44586a;"><tr>'
   + '<td style="padding:4px 0;"><span style="color:#8196a6;">City</span><br><span style="color:#0f2c47;font-weight:700;">avg '+c(b.city)+'</span>'+ss_pct(you,b.city)+'</td>'
   + '<td style="padding:4px 0;"><span style="color:#8196a6;">Gender</span><br><span style="color:#0f2c47;font-weight:700;">avg '+c(b.gender)+'</span>'+ss_pct(you,b.gender)+'</td>'
   + '<td style="padding:4px 0;"><span style="color:#8196a6;">Age group</span><br><span style="color:#0f2c47;font-weight:700;">avg '+c(b.age)+'</span>'+ss_pct(you,b.age)+'</td>'
   + '</tr></table>';
}
function ss_date(iso){ try { return new Date(iso+'T00:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short'}); } catch(e){ return iso; } }
function ss_cell(label, big, sub){ return '<table role="presentation" width="100%" style="background:#ffffff;border:1px solid #e7eef4;border-radius:10px;"><tr><td style="padding:13px 15px;"><div style="font-size:10px;color:#8196a6;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;">'+label+'</div><div style="font-size:19px;font-weight:800;color:#0f2c47;margin-top:5px;letter-spacing:-0.3px;">'+big+'</div>'+(sub?'<div style="font-size:11px;color:#8196a6;margin-top:2px;">'+sub+'</div>':'')+'</td></tr></table>'; }
function ss_rankCard(it, grp){
  var pill = (it.total>=3) ? ('#'+it.rank+' of '+it.total+(grp.city?(' in '+grp.city):'')) : 'Your best';
  return '<table role="presentation" width="100%" style="background:#ffffff;border:1px solid #e7eef4;border-left:3px solid #2ba8e0;border-radius:10px;"><tr><td style="padding:14px 16px;"><div style="font-size:10px;color:#8196a6;text-transform:uppercase;letter-spacing:1.2px;font-weight:600;">'+it.label+'</div><div style="font-size:27px;font-weight:900;color:#0f2c47;margin-top:4px;letter-spacing:-0.5px;">'+it.display+'</div><div style="margin-top:9px;"><span style="background:#eaf5fb;color:#1f8fd0;font-size:10px;font-weight:800;letter-spacing:0.4px;padding:4px 10px;border-radius:100px;">'+pill+'</span></div></td></tr></table>';
}
// QuickChart: render a Chart.js config to a PNG URL (works in all email clients). Optional API key for volume.
function qc(config, w, h){
  var url = 'https://quickchart.io/chart?bkg=white&version=4&devicePixelRatio=2&w='+w+'&h='+h+'&c='+encodeURIComponent(JSON.stringify(config));
  if (process.env.QUICKCHART_KEY) url += '&key='+process.env.QUICKCHART_KEY;
  return url;
}
function ssH(t){ return '<div style="font-size:12px;color:#0f2c47;text-transform:uppercase;letter-spacing:1.5px;font-weight:800;margin-top:20px;">'+t+'</div><div style="height:2px;width:32px;background:#FFCC00;border-radius:2px;margin:6px 0 8px;"></div>'; }
function ssImg(src, alt, max){ return '<img src="'+src+'" alt="'+alt+'" style="width:100%;max-width:'+max+'px;height:auto;display:block;margin:4px auto 0;border:0;">'; }
// per-metric score 0–100 from the member's own value vs a healthy range [lo,hi,dir] (dir -1 = lower is better)
var SS_SCALE = { vo2:[30,60,1], bench:[40,140,1], run5k:[1080,2400,-1], bioage:[25,55,-1], bodyfat:[8,35,-1], active:[0,420,1] };
function ss_score(it){ var s=SS_SCALE[it.key]; if(!s||it.value==null) return null; var pc=(it.value-s[0])/(s[1]-s[0])*100; if(s[2]<0) pc=100-pc; return Math.max(0,Math.min(100,Math.round(pc))); }
function ss_bar(pct, color){ pct=Math.max(0,Math.min(100,Math.round(pct))); return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;"><tr><td width="'+pct+'%" style="background:'+color+';height:8px;font-size:0;line-height:8px;border-radius:5px 0 0 5px;">&nbsp;</td><td width="'+(100-pct)+'%" style="background:#eef2f6;height:8px;font-size:0;line-height:8px;border-radius:0 5px 5px 0;">&nbsp;</td></tr></table>'; }
var SS_TARGETS = { members_referred:{s:2,a:8,u:'referral'}, connections_made:{s:2,a:8,u:'connection'}, meetups_hosted:{s:1,a:4,u:'meet-up hosted'}, provider_checkins:{s:2,a:8,u:'provider visit'}, quests_completed:{s:1,a:2,u:'quest'}, events_attended:{s:1,a:4,u:'event'}, activities_logged:{s:8,a:24,u:'activity'}, challenges_completed:{s:2,a:4,u:'challenge'} };
function renderSundaySummary(name, d){
  var mu=d.meetups||{}, cn=d.connections||{}, grp=d.group||{};
  var rankings = d.rankings || [];
  var places = d.places || {};
  var tp = d.tier_progress || {};
  var curTier = String(d.tier||'member').toLowerCase();

  var tierName = curTier.charAt(0).toUpperCase()+curTier.slice(1);
  // v58: DARK FFP-brand layout (matches homepage + approved FFP-SUNDAY-SUMMARY mockup).
  // Email-safe: tables + inline styles, no icon fonts, no emojis (geometric arrows only).
  var C = { accent:'#2ba8e0', yellow:'#FFCC00', white:'#ffffff', soft:'#b8d4e0', mut:'#9dbdd0', dim:'#6a90a8', green:'#22c55e', cell:'#0f1e2e', line:'rgba(43,168,224,.20)' };
  function ssEye(t){ return '<span style="display:inline-block;background:rgba(43,168,224,.12);border:1px solid rgba(43,168,224,.35);border-radius:100px;padding:6px 15px;font-size:10px;font-weight:800;letter-spacing:2.5px;text-transform:uppercase;color:'+C.accent+';">'+t+'</span>'; }
  function ssRule(){ return '<div style="height:2px;background:rgba(43,168,224,.45);border-radius:2px;margin:12px 0 0;"></div>'; }
  function ssMetric(label, value, delta, dCol, last){
    return '<table role="presentation" width="100%"'+(last?'':' style="border-bottom:1px solid rgba(43,168,224,.16);"')+'><tr><td style="padding:16px 0;">'
      +'<table role="presentation" width="100%"><tr>'
      +'<td valign="top"><div style="font-size:15px;font-weight:800;color:'+C.white+';letter-spacing:.5px;text-transform:uppercase;">'+label+'</div>'
      +(delta?('<div style="font-size:12px;font-weight:800;color:'+(dCol||C.green)+';margin-top:5px;">'+delta+'</div>'):'')+'</td>'
      +'<td align="right" valign="top"><div style="font-size:30px;font-weight:900;color:'+C.white+';letter-spacing:-1px;line-height:1;">'+value+'</div></td>'
      +'</tr></table></td></tr></table>';
  }
  function ssRankRow(label, value, rankTxt, last){
    return '<table role="presentation" width="100%"'+(last?'':' style="border-bottom:1px solid rgba(43,168,224,.16);"')+'><tr><td style="padding:16px 0;">'
      +'<table role="presentation" width="100%"><tr>'
      +'<td valign="top"><div style="font-size:15px;font-weight:800;color:'+C.white+';letter-spacing:.5px;text-transform:uppercase;">'+label+'</div>'
      +'<div style="margin-top:7px;"><span style="background:rgba(43,168,224,.14);color:'+C.accent+';font-size:11px;font-weight:800;padding:4px 10px;border-radius:100px;">'+rankTxt+'</span></div></td>'
      +'<td align="right" valign="top"><div style="font-size:30px;font-weight:900;color:'+C.white+';letter-spacing:-1px;line-height:1;">'+value+'</div></td>'
      +'</tr></table></td></tr></table>';
  }
  function ssBarDark(pct){ pct=Math.max(0,Math.min(100,Math.round(pct))); return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;"><tr><td width="'+pct+'%" style="background:'+C.yellow+';height:8px;font-size:0;line-height:8px;border-radius:5px 0 0 5px;">&nbsp;</td><td width="'+(100-pct)+'%" style="background:rgba(255,255,255,.10);height:8px;font-size:0;line-height:8px;border-radius:0 5px 5px 0;">&nbsp;</td></tr></table>'; }

  // ---- MY FITNESS STATS — real per-stat rank (City/Gender/Age cohorts pending a ranking-data build) ----
  var fitHtml;
  if (rankings.length >= 1) {
    var fr = rankings.map(function(r, i){
      var last = i===rankings.length-1;
      if (r.missing) {   // not logged yet → prompt them to add it (drives usage)
        return ssRankRow(r.label, '&#8212;', '<a href="https://ffppassport.com/ffp-member-dashboard.html" style="color:'+C.accent+';text-decoration:none;font-weight:800;">+ Add your number &#8250;</a>', last);
      }
      var rk = (r.total>=3) ? ('#'+r.rank+' of '+r.total+(grp.city?(' in '+grp.city):'')) : 'Your personal best';
      return ssRankRow(r.label, r.display, rk, last);
    }).join('');
    fitHtml = '<tr><td style="padding:28px 30px 0;">'+ssEye('My fitness stats')+'<div style="font-size:12px;color:'+C.dim+';margin:11px 0 0;font-weight:700;">how you rank'+(grp.city?(' in '+grp.city):' in the community')+'</div>'+ssRule()+'</td></tr>'
      +'<tr><td style="padding:0 30px;">'+fr+'</td></tr>';
  } else {
    fitHtml = '<tr><td style="padding:28px 30px 0;">'+ssEye('My fitness stats')+ssRule()
      +'<table role="presentation" width="100%" style="background:'+C.cell+';border:1px solid '+C.line+';border-radius:14px;margin-top:14px;"><tr><td style="padding:18px 20px;font-size:13px;color:'+C.soft+';line-height:1.6;">Add your numbers — VO2, bench, 5km, body fat — to see how you rank in the FFP community. <a href="https://ffppassport.com/ffp-member-dashboard.html" style="color:'+C.accent+';font-weight:700;text-decoration:none;">Update your records</a></td></tr></table></td></tr>';
  }

  // ---- YOUR PASSPORT — real places / people / activity (weekly deltas where we have them) ----
  var meetTotal = (mu.hosted||0)+(mu.joined||0);
  var pv = ''
    + ssMetric('Places visited', (places.venues_total||0), ((places.venues_new||0)>0?('&#9650; +'+places.venues_new+' this week'):''), C.green)
    + ssMetric('Cities', (places.cities_total||0), ((places.cities_new||0)>0?('&#9650; +'+places.cities_new+' this week'):''), C.green)
    + ssMetric('Connections made', (cn.total||0), ((cn.new_this_week||0)>0?('&#9650; +'+cn.new_this_week+' this week'):''), C.green)
    + ssMetric('Meet-ups', meetTotal, '')
    + ssMetric('Activities logged', (tp.activities_logged||0), 'last 30 days', C.dim, true);
  var worldHtml = '<tr><td style="padding:26px 30px 0;">'+ssEye('Your passport')+'<div style="font-size:12px;color:'+C.dim+';margin:11px 0 0;font-weight:700;">places, people &amp; activity</div>'+ssRule()+'</td></tr>'
    +'<tr><td style="padding:0 30px;">'+pv+'</td></tr>';

  // ---- PASSPORT STATUS — tier progress toward the next tier ----
  var statusHtml;
  var nextTier = curTier==='member' ? 'Supporter' : (curTier==='supporter' ? 'Ambassador' : null);
  if (nextTier) {
    var goal = nextTier==='Ambassador' ? 'a' : 's';
    var met=0, closest=[];
    Object.keys(SS_TARGETS).forEach(function(k){ var tgt=SS_TARGETS[k][goal], have=tp[k]||0; if(have>=tgt) met++; else { var rem=tgt-have; closest.push({rem:rem, txt:rem+' more '+SS_TARGETS[k].u+(rem>1?'s':'')}); } });
    closest.sort(function(a,b){ return a.rem-b.rem; });
    var pct = Math.min(100, Math.round(met/4*100));
    statusHtml = '<tr><td style="padding:26px 30px 0;">'+ssEye('Passport status')+ssRule()
      + '<table role="presentation" width="100%" style="background:'+C.cell+';border:1px solid '+C.line+';border-radius:14px;margin-top:14px;"><tr><td style="padding:16px 18px;">'
      + '<table role="presentation" width="100%"><tr><td style="font-size:15px;color:'+C.white+';font-weight:800;">'+tierName+'</td><td align="right" style="font-size:12px;color:'+C.mut+';font-weight:600;">'+met+' of 4 toward '+nextTier+'</td></tr></table>'
      + ssBarDark(pct)
      + (closest.length ? '<div style="font-size:12px;color:'+C.soft+';margin-top:12px;line-height:1.5;">Closest to '+nextTier+': <strong style="color:'+C.white+';">'+closest.slice(0,2).map(function(c){return c.txt;}).join(' &middot; ')+'</strong></div>' : '<div style="font-size:12px;color:'+C.green+';font-weight:700;margin-top:12px;">Every section is at '+nextTier+' level — you are there.</div>')
      + '</td></tr></table></td></tr>';
  } else {
    statusHtml = '<tr><td style="padding:26px 30px 0;">'+ssEye('Passport status')+ssRule()
      + '<table role="presentation" width="100%" style="background:'+C.cell+';border:1px solid '+C.line+';border-radius:14px;margin-top:14px;"><tr><td style="padding:16px 18px;font-size:13px;color:'+C.soft+';line-height:1.6;"><strong style="color:'+C.white+';">Ambassador</strong> — the top tier. Keep your sections active over the next 30 days to hold your status and your 20% referral rewards.</td></tr></table></td></tr>';
  }

  var didStuff = rankings.length || (places.venues_new||0) || (places.cities_new||0) || (cn.new_this_week||0) || meetTotal || (tp.activities_logged||0);
  var greet = (didStuff ? ('Well done, '+name) : ('Hey, '+name)) + '.';
  var sub = didStuff
    ? 'Here is your week — your fitness, your world, and your status.'
    : 'A fresh week starts today — get moving, connect with people, and climb your passport.';

  return ''
  +'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#050d16;"><tr><td align="center" style="padding:24px 14px;">'
  +'<table role="presentation" width="500" cellpadding="0" cellspacing="0" style="max-width:500px;width:100%;background:#081420;border:1px solid rgba(43,168,224,.25);border-radius:18px;overflow:hidden;font-family:Montserrat,Arial,sans-serif;">'
  +'<tr><td style="padding:32px 30px 0;text-align:center;"><img src="https://ffppassport.com/assets/ffp-emblem.png" alt="FFP" width="60" style="display:inline-block;border:0;"><div style="font-size:11px;color:'+C.accent+';letter-spacing:2.5px;text-transform:uppercase;font-weight:800;margin-top:14px;">Sunday Summary &nbsp;&middot;&nbsp; '+ss_date(d.week_start)+' &ndash; '+ss_date(d.week_end)+'</div></td></tr>'
  +'<tr><td style="padding:24px 30px 0;text-align:center;"><div style="font-size:11px;color:'+C.mut+';letter-spacing:2px;text-transform:uppercase;font-weight:700;">Your current status</div><div style="font-size:42px;font-weight:900;color:'+C.yellow+';letter-spacing:-1px;line-height:1;margin-top:8px;">'+tierName+'</div><div style="height:3px;width:46px;background:rgba(43,168,224,.5);border-radius:2px;margin:16px auto 0;"></div></td></tr>'
  +'<tr><td style="padding:24px 30px 0;"><div style="display:inline-block;font-size:25px;font-weight:900;color:'+C.white+';letter-spacing:-.5px;border-bottom:3px solid '+C.yellow+';padding-bottom:6px;">'+greet+'</div><div style="font-size:14px;color:'+C.soft+';line-height:1.6;margin-top:12px;">'+sub+'</div></td></tr>'
  + fitHtml
  + worldHtml
  + statusHtml
  +'<tr><td style="padding:30px 30px 6px;text-align:center;"><a href="https://ffppassport.com/ffp-member-dashboard.html" style="display:inline-block;background:'+C.accent+';color:#fff;text-decoration:none;font-size:16px;font-weight:800;padding:16px 44px;border-radius:12px;letter-spacing:.3px;">Open your passport</a></td></tr>'
  +'<tr><td style="padding:24px 30px 30px;text-align:center;"><div style="border-top:1px solid rgba(43,168,224,.12);padding-top:18px;font-size:12px;color:'+C.mut+';font-weight:600;">FFP Passport &middot; UAE 2026 &middot; ffppassport.com</div></td></tr>'
  +'</table></td></tr></table>';
}
// Cron endpoint (Vercel Cron sends Authorization: Bearer ${CRON_SECRET}). Also accepts ?secret= for manual test runs.
app.get('/api/cron/sunday-summary', async (req, res) => {
  var secret = process.env.CRON_SECRET || '';
  var auth = req.headers['authorization'] || '';
  var ok = secret && (auth === ('Bearer ' + secret) || req.query.secret === secret);
  if (!ok) return res.status(401).json({ error: 'unauthorized' });
  // ?only=<member_id OR email> → send to just that one member (SAFE TEST: doesn't email everyone)
  var only = (req.query.only || '').trim();
  var force = req.query.force === '1' || req.query.force === 'true';   // manual "send to everyone now", any day
  // Cron runs daily but only SENDS on Sunday (UTC). ?only=<member> (one) or ?force=1 (all) bypass the day gate.
  if (!only && !force && new Date().getUTCDay() !== 0) return res.json({ success: true, skipped: 'not Sunday', sent: 0 });
  try {
    var qy = supabase.from('members').select('id, full_name, given_names, email, preferences, tier');
    if (only) {
      qy = (only.indexOf('@') > -1) ? qy.eq('email', only) : qy.eq('id', only);
    } else {
      // MEMBERS ONLY — real passport members. grant@ is a member so he's included; admin@findfitpeople
      // (super_admin) and providers are system/partner accounts and are NOT emailed the member digest.
      qy = qy.eq('role', 'member').eq('status', 'active').eq('profile_complete', true);
    }
    var { data: members, error } = await qy;
    if (error) throw error;
    var sent = 0, skipped = 0;
    for (var i = 0; i < (members || []).length; i++) {
      var m = members[i];
      if (!m.email) { skipped++; continue; }
      var prefs = m.preferences || {};
      if (prefs.no_weekly_email === true) { skipped++; continue; }   // honours unsubscribe
      var dg = await supabase.rpc('member_weekly_digest', { p_me: m.id });
      if (dg.error || !dg.data) { skipped++; continue; }
      var d = dg.data;
      var rk = await supabase.rpc('member_stat_rankings', { p_me: m.id });
      d.rankings = (rk && !rk.error && rk.data) ? rk.data : [];
      var pl = await supabase.rpc('member_places', { p_me: m.id });
      d.places = (pl && !pl.error && pl.data) ? pl.data : {};
      var tprog = await supabase.rpc('member_tier_progress', { p_me: m.id });
      d.tier_progress = (tprog && !tprog.error && tprog.data) ? tprog.data : {};
      d.tier = m.tier || 'member';
      // Everyone gets the Sunday Summary — inactive members get a nudge (handled in the render), not a skip.
      var first = String(m.given_names || m.full_name || 'there').split(' ')[0];
      try {
        await mailer.sendMail({
          from: '"FFP Passport" <noreply@ffppassport.com>',
          to: m.email,
          subject: 'Your FFP Sunday Summary — week to ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
          html: renderSundaySummary(first, d)
        });
        sent++;
      } catch (e) { skipped++; }
    }
    res.json({ success: true, sent: sent, skipped: skipped, total: (members || []).length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = app;
