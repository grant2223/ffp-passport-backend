// FFP Passport — Express Server (Vercel, CommonJS) — v48
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
    if (ref) {
      try {
        const { data: referrer } = await supabase
          .from('members')
          .select('id, tier')
          .ilike('referral_code', String(ref).trim())
          .maybeSingle();
        if (referrer && referrer.id && referrer.id !== memberId) {
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
            await supabase.from('referrals').insert({
              referrer_id: referrer.id,
              referred_email: email,
              referred_member_id: memberId,
              status: 'pending',
              reward_aed: rewardAed
            });
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
    }
    // 6) Return the full member row for the frontend to cache
    const { data: finalMember } = await supabase
      .from('members')
      .select('*')
      .eq('id', memberId)
      .single();
    return res.json({
      success: true,
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
    if (!member) return res.json({ success: true, message: 'If that email exists, a new code has been sent.' });
    const { code, hash } = generateCode();
    await supabase.from('members').update({ access_code: hash }).eq('id', member.id);
    await sendCodeEmail(email, member.full_name, code, 'reset');
    res.json({ success: true, message: 'New code sent. Your old code no longer works.' });
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
// Listings they create stay 'pending' until an admin approves them — so signup is
// safe + free during the research-preview phase. Phase 2 hooks paid_until/tier.
// ─────────────────────────────────────────────────────────────────────────────
const SITE_URL = process.env.SITE_URL || 'https://ffppassport.com';
const VERIFY_SECRET = process.env.SUPABASE_SERVICE_KEY || 'ffp-fallback-secret';

function b64url(s) {
  return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
        website: website || null, about: about || null, status: 'pending'
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
module.exports = app;
