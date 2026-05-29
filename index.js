// FFP Passport — Express Server (Vercel, CommonJS) — v24
// v24: quest_venues.task returned in GET /api/quests/:id (what to do at each venue).
// v23: GET /api/quests/provider/:provider_id/stats — aggregated quest-visitor
//      analytics (total check-ins, unique visitors, gender breakdown, top quests)
//      for the provider Analytics panel. Service-role aggregate; no PII. Additive.
// v22: Provider portal — GET /api/quests/provider/:provider_id/checkins
//      Lists a provider's quest check-ins (default pending) enriched with
//      member name + quest title via service-role read (RLS hides other
//      members from the provider's own Supabase queries). Additive.
// v21: QUESTS. Adds quest endpoints (additive — no existing route touched):
//      GET  /api/quests                      list live quests + member progress
//      GET  /api/quests/:id                  one quest + staked venues + progress
//      GET  /api/quests/venue/:provider_id   member's live quests at a venue (picker)
//      POST /api/quests/checkin              member creates a pending check-in request
//      GET  /api/quests/checkin/:id          poll status (waiting -> approved)
//      POST /api/quests/checkin/:id/approve  provider approves -> AWARD TRANSACTION
//      POST /api/quests/checkin/:id/decline  provider declines
//      Award: distinct-venue dedup -> +1 step -> on completion award stamp,
//      claim prize slot if first-N, recompute tier. Service-role client.
// v12: PUT /api/members/:id now accepts `country` and `phone_country_code`
//      in req.body so the Profile panel Save button can persist them.
//      Without this, the frontend save would silently drop those fields.
// v20: REMOVED /api/verify alias. /api/passport/:passport_no is the only
//      member-data endpoint. Old QRs encoding /verify.html?p=... still work
//      via Netlify _redirects rewrite to /my-passport.html, which calls
//      /api/passport. Clean single-source backend route.
// v19: Rename /api/verify/:passport_no → /api/passport/:passport_no for
//      semantic alignment with the page rename (verify.html → my-passport.html).
//      Both routes registered to the SAME handler so any deployed code
//      still calling /api/verify keeps working forever. Old QRs scanned
//      via /verify.html (which Netlify _redirects rewrites to
//      /my-passport.html) all keep working.
// v18: /api/verify/:passport_no response now ALSO returns full passport-
//      card fields: given_names, surname, nationality, gender, dob,
//      referral_code. Enables verify.html v2 to render the actual
//      FFP passport card (marketing-grade page where any scanner sees
//      the card + CTA to get their own, with the viewed member's
//      referral_code automatically attributed on signup).
// v17: /api/referrer/:code response now ALSO returns photo_url,
//      passport_no, tier, and full_name. Used by homepage v5 banner
//      to show a richer 'Invited by [name] [avatar]' card with a
//      'see their passport' link that opens /verify.html?p={passport_no}.
//      Photo + passport-card preview = social proof for the visitor.
// v16: REFERRAL SYSTEM. Adds GET /api/referrer/:code public endpoint
//      (returns referrer's first name for homepage banner). Adds
//      creditReferrer() helper called in /api/onboard/from-stripe
//      after successful member insert — reads Stripe session's
//      client_reference_id (the referrer's referral_code), looks up
//      the referrer, inserts referrals + transactions rows crediting
//      the referrer with tier-based amount (Member 25 / Supporter 50
//      / Ambassador 100 AED). FFPRealtime push lets the referrer's
//      Earnings panel update live.
// v15: /api/verify response now includes `verified` boolean (admin-set
//      identity verification). Separate from `status` which is membership
//      lifecycle (active/expired/etc). 'Verified' = admin confirmed the
//      member is a real person. Default false. See [[verification-vs-status]].
// v14: GET /api/verify/:passport_no — public endpoint backing the QR
//      Identity verification flow. Returns only public-safe member fields
//      (name, photo_url, status, tier, passport_no, member_since), never
//      email/phone/DOB/address. Uses service key to bypass RLS so anyone
//      scanning a QR can see verification info without authenticating.
// v13: JWT bridge for Supabase RLS — /api/auth/signin and /api/onboard/from-stripe
//      now ALSO return a Supabase-compatible HS256 JWT (signed with SUPABASE_JWT_SECRET).
//      The frontend stores this and calls supabase.auth.setSession({access_token: jwt,
//      refresh_token: ''}) so auth.uid() returns member.id inside Postgres. Every
//      existing RLS policy (member_id = auth.uid() OR is_admin()) then evaluates
//      correctly for custom-auth members — unblocking all four member-dashboard
//      loaders (Earnings/Calorie/Fitness Stats/Meet & Move) without touching RLS
//      and fixing the provider_hours_own RLS rejection as a side-effect.
//      Requires SUPABASE_JWT_SECRET env var (Supabase Dashboard → Settings → API →
//      JWT Settings → JWT Secret). No new npm dependency — signed with Node crypto.
// v12: PUT /api/members/:id now accepts country + phone_country_code (added 2026-05-29
//      to support member-dashboard v101 Profile save).
// v11: /api/auth/signin redirect logic — admin and provider roles now go
//      straight to their dashboards regardless of profile_complete value.
//      Previously: ALL roles required profile_complete=true before dashboard
//      redirect, otherwise punted to /ffp-profile-complete.html. But admins
//      and providers aren't created via Stripe + profile-complete form;
//      they're created via SQL with profile_complete left false. So they
//      were stuck in a redirect loop to the member-only profile-complete
//      form. v11: profile-complete check now only applies to role='member'.
// v10: /api/onboard/from-stripe now accepts `gender` in req.body and
//      writes it to the members table on both INSERT and UPDATE paths.
//      Without this, profile-complete v11 sends gender but backend silently
//      drops it (members.gender stays null, Profile panel renders blank
//      Gender field for every new user).
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
// ── JWT bridge (v13) ────────────────────────────────────────────────
// Mints a Supabase-compatible HS256 JWT so custom-auth members can use
// supabase-js with proper auth.uid() inside RLS policies. The secret is
// the same one Supabase uses to sign its own tokens — set in Vercel env
// as SUPABASE_JWT_SECRET (Supabase Dashboard → Settings → API → JWT
// Settings → JWT Secret). Sign-only, never verify — we trust our own
// signin/onboard flows and Postgres verifies the JWT on every query.
function base64urlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}
function mintSupabaseJwt(member) {
  const secret = process.env.SUPABASE_JWT_SECRET;
  if (!secret) {
    console.warn('[JWT v13] SUPABASE_JWT_SECRET not set — returning empty JWT. Loaders will not be able to read RLS-protected data until this env var is added.');
    return '';
  }
  if (!member || !member.id) {
    console.warn('[JWT v13] mintSupabaseJwt called with no member.id — returning empty JWT');
    return '';
  }
  const header  = { alg: 'HS256', typ: 'JWT' };
  const nowSec  = Math.floor(Date.now() / 1000);
  const payload = {
    aud:   'authenticated',
    role:  'authenticated',
    sub:   member.id,        // becomes auth.uid() inside Postgres RLS
    email: member.email || '',
    iat:   nowSec,
    exp:   nowSec + 60 * 60 * 24  // 24-hour session
  };
  const h = base64urlEncode(JSON.stringify(header));
  const p = base64urlEncode(JSON.stringify(payload));
  const sig = crypto
    .createHmac('sha256', secret)
    .update(h + '.' + p)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return h + '.' + p + '.' + sig;
}
// ────────────────────────────────────────────────────────────────────
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
app.post('/api/onboard/from-stripe', async (req, res) => {
  try {
    const {
      session_id, surname, given_names, date_of_birth,
      nationality, country, city, skills, gender
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
          gender: gender || null,    // v10
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
          gender: gender || null,    // v10
          passport_no,
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
    }
    // 6) Return the full member row for the frontend to cache
    const { data: finalMember } = await supabase
      .from('members')
      .select('*')
      .eq('id', memberId)
      .single();
    // v16: credit the referrer if this signup came via a referral link.
    // The frontend appends ?client_reference_id={referrer.referral_code} to
    // the Stripe checkout URL when the buyer clicks the Become A Member CTA
    // with an active ref code in localStorage. Stripe stores it on the
    // session; we read it back here. Best-effort — never blocks onboarding.
    try {
      let refCode = null;
      // refCode can arrive directly in req.body (frontend submit) OR via
      // the Stripe session metadata (webhook path). Check both.
      if (req.body && req.body.client_reference_id) {
        refCode = String(req.body.client_reference_id).trim() || null;
      } else if (session_id) {
        try {
          const sess = await stripe.checkout.sessions.retrieve(session_id);
          refCode = (sess && sess.client_reference_id) ? String(sess.client_reference_id).trim() : null;
        } catch (e) {
          console.warn('[onboard v16] could not retrieve Stripe session for refCode:', e.message);
        }
      }
      if (refCode && isNew) {
        await creditReferrer(finalMember, refCode);
      }
    } catch (e) {
      console.warn('[onboard v16] referral credit step failed (non-blocking):', e.message);
    }

    // v13: mint Supabase-compatible JWT so profile-complete can setSession()
    // and the dashboard it lands on can read RLS-protected loader data.
    const supabaseJwt = mintSupabaseJwt(finalMember);
    return res.json({
      success: true,
      member: finalMember,
      jwt: supabaseJwt,  // v13: Supabase Auth JWT for client setSession()
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
    // v13: mint Supabase-compatible JWT so the frontend can setSession()
    // and unlock RLS-protected loader queries.
    const supabaseJwt = mintSupabaseJwt(memberSafe);
    res.json({
      success: true,
      token,
      jwt: supabaseJwt,  // v13: Supabase Auth JWT for client setSession()
      member: memberSafe,
      // v11: role-based redirect — admin/provider go straight to their dashboard,
      // members still need profile_complete=true before reaching the dashboard.
      redirect: member.role === 'admin' ? '/ffp-admin-dashboard.html'
              : member.role === 'provider' ? '/ffp-provider-dashboard.html'
              : member.profile_complete ? '/ffp-member-dashboard.html'
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
    if (!member) return res.json({ success: true, message: 'If that email exists, a new code has been sent.' });
    const { code, hash } = generateCode();
    await supabase.from('members').update({ access_code: hash }).eq('id', member.id);
    await sendCodeEmail(email, member.full_name, code, 'reset');
    res.json({ success: true, message: 'New code sent. Your old code no longer works.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
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
app.put('/api/members/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      full_name, surname, given_names, email, phone, phone_country_code,
      city, country, nationality,
      photo_url, bio, interests, fitness_level, date_of_birth, gender, skills
    } = req.body;
    const { data: member, error } = await supabase
      .from('members')
      .update({
        full_name: full_name || undefined,
        surname: surname || undefined,
        given_names: given_names || undefined,
        email: email || undefined,
        phone: phone || undefined,
        phone_country_code: phone_country_code || undefined, // v12
        city: city || undefined,
        country: country || undefined, // v12
        nationality: nationality || undefined,
        photo_url: photo_url || undefined,
        bio: bio || undefined,
        interests: interests || undefined,
        fitness_level: fitness_level || undefined,
        date_of_birth: date_of_birth || undefined,
        gender: gender || undefined,
        skills: skills || undefined,
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

// ── v14: PUBLIC verify endpoint (QR scan target) ────────────────────
// GET /api/verify/:passport_no
// No auth required — anyone scanning a member's QR can see their
// identity card. Returns ONLY public-safe fields. Never email/phone/
// DOB/address/etc. Status is returned regardless of value (active /
// expired / suspended) so the scanner sees the real state, not just
// "exists or not".
app.get('/api/passport/:passport_no', async (req, res) => {
  try {
    const passportNo = String(req.params.passport_no || '').trim();
    if (!passportNo) {
      return res.status(400).json({ error: 'passport_no required' });
    }
    const { data: member, error } = await supabase
      .from('members')
      .select('passport_no, given_names, surname, full_name, photo_url, status, tier, country, nationality, gender, date_of_birth, created_at, verified, referral_code')
      .eq('passport_no', passportNo)
      .maybeSingle();
    if (error) {
      console.error('[verify] supabase error:', error);
      return res.status(500).json({ error: error.message });
    }
    if (!member) {
      return res.status(404).json({ error: 'Member not found', passport_no: passportNo });
    }
    // Compute expiry as created_at + 1 year (matches member-dashboard convention)
    let expiry = null;
    if (member.created_at) {
      const d = new Date(member.created_at);
      d.setFullYear(d.getFullYear() + 1);
      expiry = d.toISOString().slice(0, 10);
    }
    return res.json({
      success: true,
      member: {
        passport_no:   member.passport_no,
        full_name:     member.full_name || ((member.given_names || '') + ' ' + (member.surname || '')).trim(),
        given_names:   member.given_names || '',
        surname:       member.surname || '',
        photo_url:     member.photo_url || null,
        status:        member.status || 'unknown',
        tier:          member.tier || 'Member',
        country:       member.country || null,
        nationality:   member.nationality || null,
        gender:        member.gender || null,
        date_of_birth: member.date_of_birth || null,
        member_since:  member.created_at ? String(member.created_at).slice(0, 10) : null,
        expires:       expiry,
        verified:      !!member.verified,
        referral_code: member.referral_code || null
      }
    });
  } catch (e) {
    console.error('[verify] handler error:', e);
    return res.status(500).json({ error: e.message });
  }
});


// ── v16: REFERRAL SYSTEM ────────────────────────────────────────────
// Tier-based reward amounts (AED). Member is the default for new signups.
const REFERRAL_TIER_CREDITS = { Member: 25, Supporter: 50, Ambassador: 100 };

// GET /api/referrer/:code — public, returns referrer's first name only.
// Used by homepage banner: "Invited by Jamie — welcome to FFP Passport"
app.get('/api/referrer/:code', async (req, res) => {
  try {
    const code = String(req.params.code || '').trim();
    if (!code) return res.status(400).json({ error: 'code required' });
    // v17: extended select — homepage banner needs photo + passport_no + tier
    // to render a personalised card with link to the referrer's verify page.
    // Public-safe fields only — no email/phone/DOB.
    const { data: referrer, error } = await supabase
      .from('members')
      .select('given_names, surname, full_name, photo_url, passport_no, tier')
      .eq('referral_code', code)
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!referrer) return res.status(404).json({ error: 'Invalid referral code', code });
    const firstName = ((referrer.given_names || '').trim().split(/\s+/)[0])
                   || ((referrer.full_name   || '').trim().split(/\s+/)[0])
                   || 'a friend';
    const fullName  = (referrer.full_name && referrer.full_name.trim())
                   || ((referrer.given_names || '') + ' ' + (referrer.surname || '')).trim()
                   || firstName;
    return res.json({
      success:     true,
      first_name:  firstName,
      full_name:   fullName,
      photo_url:   referrer.photo_url   || null,
      passport_no: referrer.passport_no || null,
      tier:        referrer.tier        || 'Member'
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Credit a referrer based on their tier — called from /api/onboard/from-stripe
// once a new member has been successfully inserted. refCode comes from the
// Stripe session's client_reference_id (which we set via the Stripe link URL
// on the frontend before redirecting the buyer to checkout). Best-effort:
// any failure here logs + continues — we never want a credit hiccup to
// break the onboard flow for a paying member.
async function creditReferrer(newMember, refCode) {
  if (!refCode || !newMember || !newMember.id) return;
  try {
    const { data: referrer } = await supabase
      .from('members')
      .select('id, tier, given_names, full_name')
      .eq('referral_code', refCode)
      .maybeSingle();
    if (!referrer) {
      console.warn('[referral v16] no referrer for code:', refCode);
      return;
    }
    if (referrer.id === newMember.id) {
      console.warn('[referral v16] self-referral blocked for member:', newMember.id);
      return;
    }
    const amount = REFERRAL_TIER_CREDITS[referrer.tier] || REFERRAL_TIER_CREDITS.Member;
    const newName = newMember.full_name
                 || ((newMember.given_names || '') + ' ' + (newMember.surname || '')).trim()
                 || 'new member';

    // 1) referrals row — tracks the relationship
    const { error: rErr } = await supabase.from('referrals').insert({
      referrer_id:        referrer.id,
      referred_member_id: newMember.id,
      referral_code:      refCode,
      credit_amount:      amount,
      status:             'credited',
      credited_at:        new Date().toISOString()
    });
    if (rErr) console.warn('[referral v16] referrals insert error:', rErr.message);

    // 2) transactions row — surfaces in Earnings panel via existing loader
    const { error: tErr } = await supabase.from('transactions').insert({
      member_id:   referrer.id,
      type:        'credit',
      category:    'referrals',
      amount_aed:  amount,
      description: 'Referral reward — ' + newName + ' joined',
      status:      'completed'
    });
    if (tErr) console.warn('[referral v16] transactions insert error:', tErr.message);

    console.log('[referral v16] credited', amount, 'AED to', referrer.id, '(tier:', (referrer.tier || 'Member') + ')', 'for referring', newMember.id);
  } catch (e) {
    console.warn('[referral v16] creditReferrer threw:', e.message);
  }
}

// ── QUESTS (v21) ───────────────────────────────────────────────────────
// Member reads + check-in request, and the provider approve/decline award
// transaction. Uses the service-role `supabase` client (bypasses RLS);
// member/provider identity is passed explicitly, same as the other endpoints.

// Tier ladder by total stamps collected.
function questTier(stampCount) {
  if (stampCount >= 12) return 'Navigator';
  if (stampCount >= 6)  return 'Adventurer';
  return 'Explorer';
}

// GET /api/quests?member_id=&scope=&category= — live quests + this member's progress
app.get('/api/quests', async (req, res) => {
  try {
    const { member_id, scope, category } = req.query;
    let query = supabase
      .from('quests')
      .select('*, sponsors(name, logo)')
      .eq('status', 'live');
    if (scope)    query = query.eq('scope', scope);
    if (category) query = query.eq('category', category);
    const { data: quests, error } = await query.order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: error.message });

    const progressByQuest = {};
    if (member_id) {
      const { data: prog } = await supabase
        .from('quest_progress')
        .select('quest_id, completed_count, status, completed_at')
        .eq('member_id', member_id);
      (prog || []).forEach((p) => { progressByQuest[p.quest_id] = p; });
    }
    const withProgress = (quests || []).map((q) => ({
      ...q,
      progress: progressByQuest[q.id] || { completed_count: 0, status: 'not_started' }
    }));
    res.json({ success: true, quests: withProgress });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/quests/:id?member_id= — one quest + staked venues + member progress + checkins
app.get('/api/quests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { member_id } = req.query;
    const { data: quest, error } = await supabase
      .from('quests')
      .select('*, sponsors(name, logo)')
      .eq('id', id)
      .single();
    if (error || !quest) return res.status(404).json({ error: 'Quest not found' });

    const { data: venues } = await supabase
      .from('quest_venues')
      .select('provider_id, task, providers(business_name, letter_mark)')
      .eq('quest_id', id);

    let progress = { completed_count: 0, status: 'not_started' };
    let checkins = [];
    if (member_id) {
      const { data: p } = await supabase
        .from('quest_progress')
        .select('completed_count, status, completed_at')
        .eq('quest_id', id).eq('member_id', member_id).maybeSingle();
      if (p) progress = p;
      const { data: c } = await supabase
        .from('quest_checkins')
        .select('id, provider_id, status, approved_at')
        .eq('quest_id', id).eq('member_id', member_id);
      checkins = c || [];
    }
    res.json({ success: true, quest, venues: venues || [], progress, checkins });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/quests/venue/:provider_id?member_id= — member's live quests staked to this
// venue (powers the post-scan picker)
app.get('/api/quests/venue/:provider_id', async (req, res) => {
  try {
    const { provider_id } = req.params;
    const { member_id } = req.query;
    const { data: stakes, error } = await supabase
      .from('quest_venues')
      .select('quest_id, quests!inner(id, title, category, scope, target_count, reward_type, status)')
      .eq('provider_id', provider_id);
    if (error) return res.status(500).json({ error: error.message });
    let quests = (stakes || []).map((s) => s.quests).filter((q) => q && q.status === 'live');

    if (member_id && quests.length) {
      const ids = quests.map((q) => q.id);
      const { data: prog } = await supabase
        .from('quest_progress')
        .select('quest_id, completed_count, status')
        .eq('member_id', member_id).in('quest_id', ids);
      const byId = {};
      (prog || []).forEach((p) => { byId[p.quest_id] = p; });
      quests = quests.map((q) => ({ ...q, progress: byId[q.id] || { completed_count: 0, status: 'not_started' } }));
    }
    res.json({ success: true, provider_id, quests });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/quests/checkin  { member_id, quest_id, provider_id } — create a pending request
app.post('/api/quests/checkin', async (req, res) => {
  try {
    const { member_id, quest_id, provider_id } = req.body || {};
    if (!member_id || !quest_id || !provider_id)
      return res.status(400).json({ error: 'member_id, quest_id and provider_id required' });

    // venue must be staked into this quest, and the quest must be live
    const { data: stake } = await supabase
      .from('quest_venues')
      .select('quest_id, quests!inner(status)')
      .eq('quest_id', quest_id).eq('provider_id', provider_id).maybeSingle();
    if (!stake) return res.status(400).json({ error: 'This venue is not part of that quest' });
    if (!stake.quests || stake.quests.status !== 'live')
      return res.status(400).json({ error: 'Quest is not live' });

    // collapse duplicate pending requests at the same venue
    const { data: existing } = await supabase
      .from('quest_checkins')
      .select('id')
      .eq('member_id', member_id).eq('quest_id', quest_id)
      .eq('provider_id', provider_id).eq('status', 'pending').maybeSingle();
    if (existing) return res.json({ success: true, checkin_id: existing.id, already_pending: true });

    const { data: checkin, error } = await supabase
      .from('quest_checkins')
      .insert({ member_id, quest_id, provider_id, status: 'pending' })
      .select().single();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, checkin_id: checkin.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/quests/checkin/:id — poll status (drives the member waiting → approved screen)
app.get('/api/quests/checkin/:id', async (req, res) => {
  try {
    const { data: checkin, error } = await supabase
      .from('quest_checkins')
      .select('id, quest_id, member_id, provider_id, status, approved_at')
      .eq('id', req.params.id).single();
    if (error || !checkin) return res.status(404).json({ error: 'Check-in not found' });
    res.json({ success: true, checkin });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/quests/checkin/:id/decline — provider declines a pending request
app.post('/api/quests/checkin/:id/decline', async (req, res) => {
  try {
    const { error } = await supabase
      .from('quest_checkins')
      .update({ status: 'declined' })
      .eq('id', req.params.id).eq('status', 'pending');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/quests/checkin/:id/approve  { approved_by } — THE AWARD TRANSACTION.
// Provider approves a pending check-in: stamps the step, and on completion awards
// the stamp, claims a prize slot if first-N, and recomputes tier. Server-side only.
app.post('/api/quests/checkin/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { approved_by } = req.body || {};

    const { data: ci, error: ciErr } = await supabase
      .from('quest_checkins')
      .select('id, quest_id, member_id, provider_id, status')
      .eq('id', id).single();
    if (ciErr || !ci) return res.status(404).json({ error: 'Check-in not found' });
    if (ci.status !== 'pending') return res.status(409).json({ error: 'Check-in already ' + ci.status });

    const { data: quest, error: qErr } = await supabase
      .from('quests').select('*').eq('id', ci.quest_id).single();
    if (qErr || !quest) return res.status(404).json({ error: 'Quest not found' });

    // distinct-venue rule: reject a repeat approved check-in at the same venue
    if (quest.require_distinct_venues) {
      const { data: dup } = await supabase
        .from('quest_checkins')
        .select('id')
        .eq('quest_id', ci.quest_id).eq('member_id', ci.member_id)
        .eq('provider_id', ci.provider_id).eq('status', 'approved').maybeSingle();
      if (dup) {
        await supabase.from('quest_checkins').update({ status: 'declined' }).eq('id', id);
        return res.status(409).json({ error: 'Already stamped at this venue (distinct-venue quest)' });
      }
    }

    // 1) approve the check-in
    await supabase
      .from('quest_checkins')
      .update({ status: 'approved', approved_at: new Date().toISOString(), approved_by: approved_by || null })
      .eq('id', id);

    // 2) advance progress (+1 step)
    const { data: prog } = await supabase
      .from('quest_progress')
      .select('id, completed_count')
      .eq('quest_id', ci.quest_id).eq('member_id', ci.member_id).maybeSingle();
    let completed_count = 1;
    if (prog) {
      completed_count = (prog.completed_count || 0) + 1;
      await supabase.from('quest_progress')
        .update({ completed_count, updated_at: new Date().toISOString() })
        .eq('id', prog.id);
    } else {
      await supabase.from('quest_progress')
        .insert({ member_id: ci.member_id, quest_id: ci.quest_id, completed_count: 1, status: 'in_progress' });
    }

    let completed = false, stamp_awarded = false, prize_won = false;

    // 3) completion
    if (completed_count >= quest.target_count) {
      completed = true;
      await supabase.from('quest_progress')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('quest_id', ci.quest_id).eq('member_id', ci.member_id);

      // award the stamp (one per quest; idempotent)
      const { error: msErr } = await supabase.from('member_stamps')
        .upsert(
          { member_id: ci.member_id, stamp_id: quest.stamp_id, quest_id: ci.quest_id, earned_at: new Date().toISOString() },
          { onConflict: 'member_id,quest_id' }
        );
      if (!msErr) stamp_awarded = true;

      // claim a prize slot if first-N and not already a winner
      if (quest.reward_type === 'prize') {
        const { data: alreadyWon } = await supabase.from('prize_winners')
          .select('quest_id').eq('quest_id', ci.quest_id).eq('member_id', ci.member_id).maybeSingle();
        if (!alreadyWon && (quest.prize_remaining || 0) > 0) {
          const { error: pwErr } = await supabase.from('prize_winners')
            .insert({ quest_id: ci.quest_id, member_id: ci.member_id });
          if (!pwErr) {
            prize_won = true;
            await supabase.from('quests')
              .update({ prize_remaining: quest.prize_remaining - 1 }).eq('id', quest.id);
          }
        }
      }
    }

    // 4) recompute tier from total stamps
    const { count: stampCount } = await supabase
      .from('member_stamps')
      .select('quest_id', { count: 'exact', head: true })
      .eq('member_id', ci.member_id);
    const tier = questTier(stampCount || 0);

    res.json({
      success: true, completed, completed_count, target: quest.target_count,
      stamp_awarded, prize_won, stamps_total: stampCount || 0, tier
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// ───────────────────────────────────────────────────────────────────────


// GET /api/quests/provider/:provider_id/checkins?status=pending — enriched list for
// the provider portal. Service-role read (RLS hides other members from the provider),
// so it can return member names + quest titles the provider dashboard can't fetch directly.
app.get('/api/quests/provider/:provider_id/checkins', async (req, res) => {
  try {
    const { provider_id } = req.params;
    const status = req.query.status || 'pending';
    const { data: rows, error } = await supabase
      .from('quest_checkins')
      .select('id, quest_id, member_id, provider_id, status, requested_at, approved_at, members(full_name, given_names, photo_url), quests(title, target_count, reward_type)')
      .eq('provider_id', provider_id)
      .eq('status', status)
      .order('requested_at', { ascending: true })
      .limit(100);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, checkins: rows || [] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/quests/provider/:provider_id/stats — aggregated quest-visitor analytics for
// the provider portal. Service-role read so member gender can be tallied server-side
// (providers can't read other members directly). Returns only aggregates, no PII.
app.get('/api/quests/provider/:provider_id/stats', async (req, res) => {
  try {
    const { provider_id } = req.params;
    const { data: rows, error } = await supabase
      .from('quest_checkins')
      .select('member_id, quests(title), members(gender)')
      .eq('provider_id', provider_id)
      .eq('status', 'approved')
      .limit(5000);
    if (error) return res.status(500).json({ error: error.message });
    const list = rows || [];

    const total = list.length;
    const memberGender = {};   // unique member -> gender (last seen)
    const byQuest = {};
    list.forEach((r) => {
      memberGender[r.member_id] = (r.members && r.members.gender) || null;
      const t = (r.quests && r.quests.title) || 'Quest';
      byQuest[t] = (byQuest[t] || 0) + 1;
    });

    const gender = { male: 0, female: 0, other: 0 };
    Object.keys(memberGender).forEach((mid) => {
      const g = memberGender[mid];
      if (g === 'Male') gender.male++;
      else if (g === 'Female') gender.female++;
      else gender.other++;
    });

    const top_quests = Object.keys(byQuest)
      .map((t) => ({ title: t, count: byQuest[t] }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    res.json({
      success: true,
      total_checkins: total,
      unique_visitors: Object.keys(memberGender).length,
      gender: gender,
      top_quests: top_quests
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = app;
