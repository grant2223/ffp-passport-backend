// FFP Passport — Express Server (Vercel, CommonJS) — v59
// v59 (2026-06-03): REFERRAL → WALLET CREDITING. A confirmed paid signup through a referral link
//      now (a) marks the referrals row 'paid' (= earned/credited) and (b) inserts an 'in' transaction
//      (category 'referrals', status 'paid') so the referrer's Available Balance reflects the reward
//      immediately. Balance = sum(in.paid) − sum(out paid/pending); payouts already add 'out' rows on
//      execution, so the balance now adjusts BOTH as earnings come in and as payouts go out. (Grant)
//      (Existing pending referrals were back-filled into transactions via SQL.) NOTE: amounts stored
//      in AED; dashboard converts to USD for display (platform = USD, payouts = local currency).
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
      const email = (session.customer_details && session.customer_details.email) || session.customer_email;
      const name  = (session.customer_details && session.customer_details.name) || '';
      if (!email) {
        console.error('Stripe webhook: no email in session', session.id);
        return res.status(200).json({ received: true, warning: 'no email' });
      }
      const { data: existing } = await supabase
        .from('members')
        .select('id, access_code')
        .eq('email', email)
        .maybeSingle();
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
            paid: true
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

app.post('/api/onboard/from-stripe', async (req, res) => {
  try {
    const {
      session_id, surname, given_names, date_of_birth,
      nationality, country, city, skills, gender, photo_url, ref
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
    const email = (session.customer_details && session.customer_details.email) || session.customer_email;
    const stripeName = (session.customer_details && session.customer_details.name) || '';
    const customerId = session.customer || null;
    if (!email) {
      return res.status(400).json({ error: 'No email on Stripe session' });
    }
    // 2) Build full_name (form values take priority over Stripe's single field)
    const fullName = ((given_names || '') + ' ' + (surname || '')).trim() || stripeName;
    // 3) Find existing member by email
    //    v4: select profile_complete too, so we know whether this is a
    //    first-time onboarding (welcome email should fire) or a returning
    //    user re-submitting (welcome email should NOT fire).
    const { data: existing } = await supabase
      .from('members')
      .select('id, paid, profile_complete')
      .eq('email', email)
      .maybeSingle();
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

    // 3b) Referral attribution (non-blocking): if this signup came through someone's
    //     referral link, credit them. ref = the referrer's referral_code (from the
    //     landing page's ffp_ref, passed by profile-complete).
    let referrerName = null;
    if (ref) {
      try {
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
          // Tier-based reward (pct of $99 membership, converted to AED)
          const pct = ({ member: 5, supporter: 10, ambassador: 20 })[String(referrer.tier || 'member').toLowerCase()] || 5;
          const rewardAed = Math.round((pct / 100) * 99 * 3.6725 * 100) / 100;
          // One referral row per referred member
          const { data: dup } = await supabase.from('referrals')
            .select('id').eq('referred_member_id', memberId).maybeSingle();
          if (!dup) {
            // v59: this onboard fires on a CONFIRMED paid signup, so the referral reward is
            // EARNED now. Mark the referral 'paid' (= credited/earned) AND mirror it into the
            // wallet ledger as an 'in' transaction so the member's Available Balance reflects it.
            // (Balance = sum(in.paid) − sum(out paid/pending); payouts add 'out' rows on execution.)
            await supabase.from('referrals').insert({
              referrer_id: referrer.id,
              referred_email: email,
              referred_member_id: memberId,
              status: 'paid',
              reward_aed: rewardAed,
              paid_at: new Date().toISOString()
            });
            const { error: refTxErr } = await supabase.from('transactions').insert({
              member_id: referrer.id,
              type: 'in',
              amount_aed: rewardAed,
              source: 'Referral — ' + (fullName || email),
              category: 'referrals',
              status: 'paid',
              related_id: memberId
            });
            if (refTxErr) console.warn('Onboard: referral wallet credit failed (non-blocking):', refTxErr.message);
            // Tell the passport holder they earned a referral (non-blocking)
            if (referrer.email) {
              try { await sendReferralEmail(referrer.email, referrer.full_name, fullName); }
              catch (e) { console.warn('Onboard: referral email failed (non-blocking):', e.message); }
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
      jwt: mintSupabaseJwt(finalMember),   // v57: real Supabase JWT → auth.uid() resolves in RLS
      member: finalMember,
      is_new: isNew
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
async function sendReferralEmail(toEmail, referrerName, newMemberName) {
  var body = '<div style="font-size:24px;font-weight:800;color:#0f2c47;margin-bottom:6px;letter-spacing:-0.3px;">You have a new referral</div>'
   +'<p style="font-size:14px;color:#5b7186;line-height:1.6;margin:0 0 18px;">Nice work'+(referrerName?(', '+escapeHtml(referrerName)):'')+'. <strong style="color:#0f2c47;">'+escapeHtml(newMemberName||'Someone')+'</strong> just joined FFP Passport using your referral link.</p>'
   +'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0;"><tr><td style="background:#FFCC00;border-radius:10px;"><a href="https://ffppassport.com/ffp-member-dashboard.html#referrals" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:800;color:#0f2c47;text-decoration:none;">View your referrals</a></td></tr></table>';
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
    const { email, full_name, role = 'member' } = req.body;
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
    const { email, code } = req.body;
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
      jwt: mintSupabaseJwt(member),   // v57: real Supabase JWT → auth.uid() resolves in RLS (admin dashboard etc.)
      member: memberSafe,
      redirect: member.profile_complete
        ? (member.role === 'admin' ? '/ffp-admin.html'
           : member.role === 'provider' ? '/ffp-provider.html'
           : '/ffp-member-dashboard.html')
        : '/ffp-profile-complete.html'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
app.post('/api/auth/reset', async (req, res) => {
  try {
    const { email } = req.body;
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
    exp: now + 60 * 60 * 24 * 30   // 30-day token (applied as a static header client-side)
  };
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = enc(header) + '.' + enc(payload);
  const sig  = crypto.createHmac('sha256', SUPABASE_JWT_SECRET).update(data).digest('base64url');
  return data + '.' + sig;
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
        role: 'provider', status: 'active', verified: false, passport_no,
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

    const apiBase = `https://${req.get('host')}`;
    const verifyUrl = `${apiBase}/api/provider/verify?token=${encodeURIComponent(signProviderToken(member.id))}`;
    try {
      await sendProviderVerifyEmail(cleanEmail, biz, contact, verifyUrl);
    } catch (e) {
      console.error('[provider/signup] email failed:', e);
      return res.json({ success: true, email: cleanEmail, email_sent: false });
    }
    res.json({ success: true, email: cleanEmail, email_sent: true });
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
      .select('id, activity, category, venue, provider_id, duration_min, intensity, calories, notes, logged_at, city, country, verified, checkin_lat, checkin_lng')
      .eq('member_id', id)
      .order('logged_at', { ascending: false })
      .limit(500);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, logs: logs || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
      var rk = (r.total>=3) ? ('#'+r.rank+' of '+r.total+(grp.city?(' in '+grp.city):'')) : 'Your personal best';
      return ssRankRow(r.label, r.display, rk, i===rankings.length-1);
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
  // Cron runs daily but only SENDS on Sunday (UTC). A manual ?only= test bypasses the day gate.
  if (!only && new Date().getUTCDay() !== 0) return res.json({ success: true, skipped: 'not Sunday', sent: 0 });
  try {
    var qy = supabase.from('members').select('id, full_name, given_names, email, preferences, tier');
    if (only) {
      qy = (only.indexOf('@') > -1) ? qy.eq('email', only) : qy.eq('id', only);
    } else {
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
          subject: 'Your FFP Sunday Summary',
          html: renderSundaySummary(first, d)
        });
        sent++;
      } catch (e) { skipped++; }
    }
    res.json({ success: true, sent: sent, skipped: skipped, total: (members || []).length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = app;
