// FFP Passport — Express Server (Vercel, CommonJS) — v121
// v121 (2026-06-28): MILESTONES/PBs. New table member_milestones + detect_member_milestones (PB distance/duration
//      per activity, 7/14/30/50/100/365-day streaks, new-country) + member_mark_milestones_seen. POST /api/milestones/check
//      detects, phone-pushes NEW ones once (pushed_at dedup, capped >3 → one combined push), returns unseen for the
//      Passport celebration popup. Member app calls it on load + after Log Activity; shows popup; marks seen.
// v120 (2026-06-27): AI HARDENING — every Anthropic call now has a 25s AbortSignal.timeout so a hung model
//      can't hang the request (returns gracefully via each endpoint's try/catch; agent helper returns
//      {error:'ai_timeout'|'ai_unreachable'}). Endpoints already guard missing key (503) + API errors (502);
//      front-ends already show friendly fallbacks (503 / unparseable / network) and re-enable their buttons.
// v119 (2026-06-27): ADMIN BROADCAST TARGETING. POST /api/admin/broadcast now accepts a `segment`
//      { type:'membership'|'country'|'gender', value } resolved server-side to member_ids (status='active');
//      'all'/no segment still broadcasts to everyone. In-app rows + phone push both honour the segment.
// v118 (2026-06-27): ADMIN PROVIDER APPROVAL FIXED. Built the missing POST /api/admin/provision-provider (the
//      Applications-queue "Approve" button POSTed here but the route never existed → Approve silently failed).
//      Verifies the admin via their Supabase access JWT (new verifyAdminAccessJwt) + admin_users, then creates/
//      upgrades the member + provider with the chosen tier/expiry/fee, marks the application approved, emails the invite.
// v117 (2026-06-27): NOTIFICATION SEPARATION — notifications.scope ('professional'|'member', set by a BEFORE-INSERT
//      trigger from the link: *professional-dashboard* → professional, else member). GET /api/notifications/:id now
//      filters by ?scope= (defaults to 'member', so the Passport bell never shows pro-business alerts; the pro
//      dashboard passes ?scope=professional). Member app needs no change. Backfilled existing rows.
// v116 (2026-06-27): COACH support_ops streak/quiet now carry the friend's latest SHARED activity_id so the
//      "Support your crew" card opens their activity card (to high-five) instead of just their profile page.
//      pro_workout_log_session shares coach workouts to connections (shared=true). (No new endpoints.)
// v115 (2026-06-27): PRO WORKOUTS (foundation). DB pro_workouts (kind template/assigned/session, exercises jsonb) +
//      RPCs pro_workout_save / _list / _log_session / _delete. pro_workout_log_session resolves the client's email →
//      members.id and pushes a finished session to their Passport activity_logs (source='coach', metrics.exercises +
//      coach name) + notifies them; respects assert_pro_owner. NEW POST /api/pro/workout/draft — AI Coach drafts an
//      editable workout {title,notes,exercises:[{name,sets:[{reps,weight,effort}],note}]} for the coach to edit, log
//      live, or assign per day. Pro-dashboard UI is the next layer.
// v114 (2026-06-27): WHOOP SYNC HARDENING — fixes "Sync failed - try again". Root cause: a stale/rejected access token
//      (401 from WHOOP) had no retry, and any non-OK pull could 500 the whole sync with no visible reason. Now: the
//      sync's pull() helper force-refreshes the token once on a 401 and retries; non-OK responses record the HTTP
//      status into wearable_debug + the response `error` (visible, not silent); a dead refresh token returns
//      {ok:false, reconnect:true, error:'whoop_auth_expired'} (frontend tells the user to reconnect) instead of a
//      generic 500. getValidWhoopAccess(row, force) added + keeps the in-memory row token current after refresh.
// v113 (2026-06-27): COACH SOCIAL ACCOUNTABILITY (Phase 3). computeCoachProfile now also derives support_ops from
//      member_connections (accepted): a connection QUIET (last active 10-60d) → "check on them"; on a STREAK (≥3
//      consecutive days) → "high-five"; plus the member's own upcoming hosted meetups with open spots → "invite your
//      crew". Stored in member_coach_profile.support_ops + returned by /api/coach/profile. coach-nudges cron uses
//      socialNudge() as the fallback when no personal nudge fires. PRIVACY: only activity STATUS (active/quiet/streak)
//      crosses between members — NEVER another member's health metrics. (Phase 3 = backend + nudge; optional Passport
//      "Support your crew" card is a separate frontend step.)
// v112 (2026-06-27): COACH NUDGES (Phase 2). evalCoachNudge() — pure rules over member_coach_profile.facts + TODAY's
//      recovery + whether they logged today → 1 proactive message: recovery_low (ease off), recovery_high (push),
//      nudge_back (at-risk), momentum (slipping). GET /api/cron/coach-nudges (secret-gated daily @ 03:00 UTC; ?only=
//      <member|email>, ?dry=1 to preview). Delivered via notifyMember = bell + push, NO email. 1/day enforced by new
//      member_coach_profile.last_nudge_at/last_nudge_key cols. Honours preferences.no_coach_nudges. AI writes nothing here.
// v111 (2026-06-27): COACH MEMORY (Phase 1). NEW table member_coach_profile (summary + facts jsonb). computeCoachProfile()
//      distils each member's recent activities + wearable recovery/sleep/strain + connections into deterministic FACTS
//      (cadence, momentum, top activity, last-active, latest recovery/sleep, at_risk) + one cheap Haiku "memory" summary.
//      POST /api/coach/profile {refresh} (on-demand, cached 24h). GET /api/cron/coach-profiles (secret-gated nightly batch
//      — add to vercel.json). Sunday-summary coach_note now reads the profile so the note is personal. Phases 2 (nudges)
//      + 3 (social accountability) will read the same profile. Spec: FFP-COACH-MEMORY-SPEC.md.
// v110 (2026-06-27): WHOOP SLEEP + RECOVERY + STRAIN (builds #2/#3). Scopes += read:sleep read:recovery read:cycles
//      (must be ticked on the WHOOP app; existing users must RE-CONNECT). Sync now also pulls sleep/recovery/cycle
//      → public.member_wearable_daily (sleep_hours/efficiency/performance, recovery_pct, resting_hr, hrv_ms, strain),
//      merged per day. Webhook also handles sleep.updated. NEW POST /api/wearables/daily {refresh} → last 30 days.
//      Backfill stays OPEN (no date cap, per Grant).
// v109 (2026-06-27): WHOOP DURATION FIX — duration_sec must be the 0-59 SECONDS COMPONENT (check constraint
//      activity_logs_duration_sec_check), but we were writing the whole workout length in seconds → every insert
//      rejected. Now duration_min = floor(totalSec/60), duration_sec = totalSec % 60. (Found via wearable_debug.)
// v108 (2026-06-27): WHOOP SYNC RELIABILITY — whoopUpsertActivity now THROWS on an activity_logs insert/update
//      error (no longer swallows it; last_synced only set on real success). /api/wearables/whoop/sync counts only
//      truly-saved workouts and records the first error in public.wearable_debug + returns {error}. (Diagnosing
//      why inserts silently failed despite synced>0.)
// v107 (2026-06-26): WEARABLES — (1) NEW POST /api/wearables/whoop/sync {refresh} PULLS recent workouts with the
//      stored token → upserts (reconciliation/backfill, not just webhooks). (2) whoopUpsertActivity now stores
//      per-workout extras in activity_logs.metrics jsonb (max_hr, strain, hr_zones_ms, sport_id). (3) GET
//      /api/members/:id/activity-logs now also returns source + metrics (for the "via WHOOP" badge + richer card).
// v106 (2026-06-26): WHOOP SCOPES FIX — invalid_scope was caused by the bad name `read:cycle` (valid is
//      `read:cycles`). Trimmed the request to only what we use now: `offline read:profile read:workout`.
// v105 (2026-06-26): WHOOP CONNECT FIX — the OAuth `state` is now a SHORT random hex token stored server-side
//      (new table wearable_oauth_states: state→member_id, single-use, 10-min TTL) instead of a long signed token.
//      WHOOP was mangling the long state on the round-trip → callback failed with reason=state. connect inserts
//      the state; callback looks it up + deletes it. (mintWearableState/verifyWearableState now unused.)
// v104 (2026-06-26): CALORIE FOOD PARSE — /api/ai/parse kind:'food' now returns a per-item "meal"
//      (breakfast|lunch|dinner|snacks) assigned ONLY from what the user says (e.g. "eggs for breakfast and a
//      salad for lunch" → split across sections); "" when unstated (frontend falls back to time-of-day). No
//      longer dumps everything into the current-time bucket.
// v103 (2026-06-26): WEARABLES (WHOOP direct, OAuth 2.0 + webhooks). POST /api/wearables/connect {refresh,provider}
//      → authorize URL; GET /api/wearables/whoop/callback (token exchange + profile → upsert member_wearables);
//      POST /api/wearables/whoop/webhook (raw-body HMAC-SHA256 signature check → fetch workout → normalise into
//      activity_logs source='whoop', dedup by external_id); POST /api/wearables/disconnect + /status. Garmin
//      scaffolded (503 not_configured until GARMIN_* keys). Env: WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET
//      (+ optional WHOOP_REDIRECT_URI, MEMBER_APP_URL). DB: member_wearables (RLS-locked) + activity_logs.source/external_id.
// v102 (2026-06-26): NUTRITION PLAN — POST /api/nutrition/plan {prompt} → {plan:{title,summary,daily_kcal,
//      protein_g,carbs_g,fat_g,meals:[{meal,kcal,items[]}],tips[]}}. Powers the Calorie Tracker › Meal Planner
//      ("Ask Coach") tab. Same Anthropic key + WORKOUT_MODEL (Haiku) as /api/workout/generate; JSON-only output.
// v101 (2026-06-22): ACTIVITY MULTI-PHOTO — GET /api/members/:id/activity-logs now also returns the
//      photos text[] column (up to 8 images per activity). photo_url stays the cover (photos[0]).
// v100 (2026-06-20): MEET-UP LEAVE NOTIFY — /api/meetups/notify supports {kind:'leave', meetup_id, member_id, pending}
//      → emails the HOST that an attendee cancelled their spot / withdrew a request. The in-app host
//      notification is written transactionally by the leave_meetup RPC (so it fires even if the email POST is missed).
// v99 (2026-06-16): GAP #1 — generic POST /api/pay/booking-checkout {booking_id} → {url}. Charges any unpaid
//      bookings row (Experiences/Trips via create_booking, paid Events via book_event_order — both carry
//      provider_id + total_aed) on the listing's connected facility account; success → /api/pay/confirm
//      kind='booking' → mark_booking_paid (+ "Payment confirmed" notify). Same Connect Standard / zero-fee /
//      idempotent finalise as session-checkout; webhook backup covers kind='booking' too.
// v98 (2026-06-14): MULTI-CURRENCY minor-units. toMinorUnits(amount,currency) replaces hardcoded ×100 in all
//      charge endpoints + refund — zero-decimal currencies (JPY, VND, KRW, …) charge ×1 not ×100 (no 100×
//      overcharge). Refund response returns the native refunded amount + currency. Tourist-market currencies safe.
// v97 (2026-06-14): MULTI-CURRENCY (phase 1). connectedCheckout now charges in the PARTNER'S currency
//      (providers.currency / professionals.currency, default AED) instead of hardcoded 'aed' — the four
//      /api/pay/* charge endpoints read + pass it. Connect Standard settles natively in the partner's currency.
// v96 (2026-06-14): REFUNDS + PAID NOTIFICATION. (a) POST /api/pay/refund {booking_id} — issues the Stripe refund
//      on the SAME connected account as the charge (direct-charge refund) for the amount cancel_booking computed
//      (refunded_aed); resolves acct via providers/pro_slots->professionals; idempotent (idempotencyKey). (b)
//      finalisePaidCheckout now fires the "payment confirmed / membership active" bell+push via notifyMember ONCE
//      (guarded against the confirm+webhook double-call), so Passport owns the paid message and the booking site
//      should send only "booking received". No new env.
// v95 (2026-06-13): PRO Connect onboarding (/api/pro/connect/start|return|refresh) + BOOKING PAYMENTS — connected-
//      account Checkout for cash sessions & package purchases (/api/pay/session-checkout, /api/pay/pro-session-checkout,
//      /api/pay/buy-plan, /api/pay/buy-pro-package), idempotent finalise via /api/pay/confirm + the Stripe webhook
//      (mark_booking_paid / grant_member_plan / grant_pro_package). Direct charges, zero application fee. Env:
//      BOOKINGS_URL (booking-site return), PRO_DASH_URL (optional). NEW DB cols: provider_member_plans.stripe_session_id,
//      pro_client_packages.stripe_session_id (grant idempotency).
// v94 (2026-06-12): FACILITY PAYMENTS — switched Connect onboarding to ACCOUNT LINKS (Stripe-hosted), since new
//      platforms no longer get an OAuth client_id without platform-profile review. POST /api/facility/connect/start
//      (refresh-token auth → owner check → ensure a Standard account via accounts.create → accountLinks.create →
//      returns hosted onboarding URL) + GET /api/facility/connect/return (retrieve account → charges_enabled?
//      → payments_status 'connected'/'onboarding' → bounce to Billing) + GET /api/facility/connect/refresh (new
//      link when expired). NO client_id / redirect URI needed — only STRIPE_SECRET_KEY (set) + Connect enabled.
//      Optional env: PROVIDER_DASH_URL, BACKEND_BASE_URL. Zero application fee. (Replaces the v93 OAuth flow.)
// v92 (2026-06-10): MEET-UP INVITE — POST /api/meetups/:id/invite lets a member invite chosen FFP
//      connections to a meet-up (same as quest invites): each gets a bell + push deep-linking to it.
// v91 (2026-06-10): MEET-UP MATCH NOTIFY — POST /api/meetups/notify {kind:'new'} notifies every member
//      who matches the MEET-UP's own criteria (city · gender · age range, via meetup_match_members RPC),
//      not the host's profile. Host + notifications-off members are excluded. Bell + phone push, deep link.
// v90 (2026-06-10): Meet-up notification deep links — the host's "wants to join" + the attendee's
//      "confirmed" notifications now carry ?meetup=<id> so tapping opens that specific meet-up's detail
//      (host lands right on the Approve/Ignore request queue), not just the generic meet-ups panel.
// v89 (2026-06-10): Activity photos — /api/storage/upload now allows the 'activity-photos' bucket (was
//      quest-images only), so the Log Activity photo upload's server fallback works for members.
// v88 (2026-06-10): SHARED ACTIVITIES — POST /api/activity/notify lets a member who logged an activity
//      with "Share with my connections" ON notify everyone in their collection (member_connections):
//      each gets a bell + phone push ("<Name> logged an activity — tap to see how it went") that deep
//      links to the activity card. Self is skipped; only fires for a shared activity owned by the caller.
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
  // v97: this same URL backs TWO Stripe destinations — the platform "Your account" endpoint AND a separate
  // "Connected accounts" endpoint (required so partner account.updated + connected checkout.session.completed
  // reach us). Each destination has its OWN signing secret, so verify against whichever one matches.
  const secrets = [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_WEBHOOK_SECRET_CONNECT].filter(Boolean);
  if (!secrets.length) {
    console.error('STRIPE_WEBHOOK_SECRET not set');
    return res.status(500).send('Webhook secret not configured');
  }
  let event = null, lastErr = null;
  for (const s of secrets) {
    try { event = stripe.webhooks.constructEvent(req.body, sig, s); break; } catch (e) { lastErr = e; }
  }
  if (!event) {
    console.error('Stripe webhook signature failed:', lastErr && lastErr.message);
    return res.status(400).send(`Webhook Error: ${lastErr && lastErr.message}`);
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
      // v95: booking payments on connected accounts (backup to /api/pay/confirm — same idempotent finalise).
      if (session.mode === 'payment' && session.metadata && ['session','pro_session','booking','plan','pro_package','invoice'].indexOf(session.metadata.kind) >= 0) {
        try {
          const intent = (typeof session.payment_intent === 'string') ? session.payment_intent : (session.payment_intent && session.payment_intent.id) || null;
          if (session.payment_status === 'paid') await finalisePaidCheckout(session.metadata.kind, session.metadata, session, intent);
        } catch (e) { console.error('[webhook pay finalise]', e); }
        return res.status(200).json({ received: true, pay: true });
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
  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.deleted' || event.type === 'customer.subscription.updated') {
    try { await onSubscriptionChange(event.data.object); } catch (e) { console.error('[webhook subscription change]', e.message); }
    return res.json({ received: true });
  }
  if (event.type === 'invoice.payment_failed') {
    try { await onInvoicePaymentFailed(event.data.object); } catch (e) { console.error('[webhook invoice.payment_failed]', e.message); }
    return res.json({ received: true });
  }
  if (event.type === 'customer.subscription.trial_will_end') {
    try { await onTrialWillEnd(event.data.object); } catch (e) { console.error('[webhook trial_will_end]', e.message); }
    return res.json({ received: true });
  }
  // v97 (reliability): connected-account capability changed over time — keep our status truthful so a
  // partner who later becomes restricted / has payouts paused is reflected, instead of a stale 'connected'.
  if (event.type === 'account.updated') {
    try { await syncConnectAccount(event.data.object); } catch (e) { console.error('[webhook account.updated]', e.message); }
    return res.json({ received: true });
  }
  res.json({ received: true });
});
// ── WHOOP webhook — defined BEFORE express.json() so we can read the RAW body for signature validation ──
app.post('/api/wearables/whoop/webhook', express.raw({ type: '*/*' }), (req, res) => handleWhoopWebhook(req, res));

app.use(express.json({ limit: '50mb' }));

// ────────────────────────────────────────────────────────────
// ADMIN: re-sync passport_expires_at from Stripe truth. Fixes any member whose date got stuck
// (e.g. a 7-day trial that converted to paid before the invoice.paid / customer.subscription.*
// webhook events were being delivered). Re-reads each subscribed member's live subscription and
// writes the real status + period end via setMemberFromSubscription.
// Guard: send header  x-admin-key: <ADMIN_RESYNC_KEY>  (set ADMIN_RESYNC_KEY in the backend env).
//   curl -X POST https://ffp-passport-backend.vercel.app/api/billing/resync -H "x-admin-key: <KEY>"
// ────────────────────────────────────────────────────────────
app.post('/api/billing/resync', async (req, res) => {
  const key = req.headers['x-admin-key'] || (req.body && req.body.key) || '';
  if (!process.env.ADMIN_RESYNC_KEY || key !== process.env.ADMIN_RESYNC_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  try {
    const { data: rows, error } = await supabase
      .from('members').select('id, email, plan, stripe_subscription_id')
      .not('stripe_subscription_id', 'is', null);
    if (error) return res.status(500).json({ error: error.message });
    let updated = 0, failed = 0;
    for (const m of (rows || [])) {
      try {
        const sub = await stripe.subscriptions.retrieve(m.stripe_subscription_id);
        await setMemberFromSubscription(sub, m.plan || (sub.metadata && sub.metadata.plan) || null, m.id, m.email);
        updated++;
      } catch (e) { failed++; console.error('[resync]', m.id, e.message); }
    }
    return res.json({ ok: true, total: (rows || []).length, updated, failed });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

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
      // 5b-ii) Nudge: add Passport to the home screen (in-app bell now; push fires once they enable it).
      try {
        await notifyMember(memberId, {
          title: 'Add FFP Passport to your home screen',
          body: 'Open it like an app — iPhone: Share → Add to Home Screen. Android: ⋮ menu → Install app.',
          icon: 'install_mobile',
          link: '/ffp-member-dashboard.html'
        });
      } catch (e) {}
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

      <!-- Add to Home Screen -->
      <div style="padding:16px;background:rgba(43,168,224,.08);border:1px solid rgba(43,168,224,.25);border-radius:10px;margin-bottom:24px;">
        <div style="font-size:13px;font-weight:800;color:#fff;margin-bottom:8px;">Add FFP Passport to your home screen</div>
        <div style="font-size:12px;color:#9dbdd0;line-height:1.6;">Open it like a real app — one tap, full screen, no browser bars.<br><br>
          <strong style="color:#fff;">iPhone / iPad (Safari):</strong> tap the Share icon, then <strong>Add to Home Screen</strong>, then Add.<br>
          <strong style="color:#fff;">Android (Chrome):</strong> tap the menu (&#8942;), then <strong>Add to Home screen</strong> / <strong>Install app</strong>.
        </div>
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
// New-booking alert to the host (professional or partner). Payload comes from the
// booking_host_notify_payload RPC (host email/name, member, session label, when, paid_with).
async function sendBookingHostEmail(p) {
  if (!p || !p.host_email) return;
  var paid = p.paid_with === 'credit' ? 'Paid by package credit'
           : p.paid_with === 'paid' ? 'Paid' : 'Payment pending';
  var body = '<div style="font-size:24px;font-weight:800;color:#0f2c47;margin-bottom:6px;letter-spacing:-0.3px;">New booking</div>'
   + '<p style="font-size:14px;color:#5b7186;line-height:1.6;margin:0 0 18px;">Hi '+escapeHtml(p.host_name||'there')+', <strong style="color:#0f2c47;">'+escapeHtml(p.member_name||'A member')+'</strong> just booked into <strong style="color:#0f2c47;">'+escapeHtml(p.label||'a session')+'</strong>.</p>'
   + '<table role="presentation" width="100%" style="background:#f7fafc;border:1px solid #e7eef4;border-radius:10px;"><tr><td style="padding:14px 16px;font-size:13px;color:#44586a;line-height:2;">'
   + '<span style="color:#8196a6;">Who</span> &nbsp; <strong style="color:#0f2c47;">'+escapeHtml(p.member_name||'—')+'</strong><br>'
   + '<span style="color:#8196a6;">Session</span> &nbsp; '+escapeHtml(p.label||'—')+'<br>'
   + '<span style="color:#8196a6;">When</span> &nbsp; '+escapeHtml(p.when||'—')+'<br>'
   + '<span style="color:#8196a6;">Payment</span> &nbsp; '+escapeHtml(paid)
   + '</td></tr></table>'
   + '<p style="font-size:13px;color:#5b7186;line-height:1.6;margin:16px 0 0;">It is now in your dashboard schedule.</p>';
  await mailer.sendMail({ from: '"FFP Passport" <noreply@ffppassport.com>', to: p.host_email,
    subject: 'New booking — '+(p.member_name||'a member')+' · '+(p.label||'session'),
    html: brandEmail('New booking', body) });
}
// Member-facing booking email (cancellation / reschedule / credit returned), driven by the
// notifications trigger -> member_notify_email_payload RPC.
async function sendMemberNotifyEmail(p) {
  if (!p || !p.to_email) return;
  var body = '<div style="font-size:23px;font-weight:800;color:#0f2c47;margin-bottom:6px;letter-spacing:-0.3px;">'+escapeHtml(p.title||'Update')+'</div>'
   + '<p style="font-size:14px;color:#5b7186;line-height:1.6;margin:0 0 18px;">Hi '+escapeHtml(p.name||'there')+', '+escapeHtml(p.body||'')+'</p>'
   + '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0;"><tr><td style="background:#FFCC00;border-radius:10px;"><a href="https://ffppassport.com/ffp-member-dashboard.html" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:800;color:#0f2c47;text-decoration:none;">Open your bookings</a></td></tr></table>';
  await mailer.sendMail({ from: '"FFP Passport" <noreply@ffppassport.com>', to: p.to_email,
    subject: 'FFP Passport — '+(p.title||'Booking update'),
    html: brandEmail(p.title||'Booking update', body) });
}
async function sendPaymentFailedEmail(toEmail, name) {
  if (!toEmail) return;
  var body = '<div style="font-size:24px;font-weight:800;color:#0f2c47;margin-bottom:6px;letter-spacing:-0.3px;">We couldn’t process your payment</div>'
   +'<p style="font-size:14px;color:#5b7186;line-height:1.6;margin:0 0 16px;">Hi'+(name?(' '+escapeHtml(name)):'')+', your latest FFP Passport payment didn’t go through — usually just an expired or declined card. We’ll automatically try again over the next few days.</p>'
   +'<p style="font-size:14px;color:#5b7186;line-height:1.6;margin:0 0 18px;">To keep your Passport active without interruption, update your card when you get a moment.</p>'
   +'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0;"><tr><td style="background:#FFCC00;border-radius:10px;"><a href="https://ffppassport.com/ffp-member-dashboard.html" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:800;color:#0f2c47;text-decoration:none;">Update my card</a></td></tr></table>';
  await mailer.sendMail({ from: '"FFP Passport" <noreply@ffppassport.com>', to: toEmail, subject: 'Your FFP Passport payment didn’t go through', html: brandEmail('Payment', body) });
}
async function sendTrialEndingEmail(toEmail, name, planLabel, amountLabel, endLabel) {
  if (!toEmail) return;
  var detail = amountLabel
    ? ('After that, your membership continues at <strong style="color:#0f2c47;">'+escapeHtml(amountLabel)+'</strong>'+(planLabel?(' ('+escapeHtml(planLabel)+')'):'')+' — nothing to do, it carries on automatically.')
    : 'After that, your membership continues automatically.';
  var body = '<div style="font-size:24px;font-weight:800;color:#0f2c47;margin-bottom:6px;letter-spacing:-0.3px;">Your free trial ends in 3 days</div>'
   +'<p style="font-size:14px;color:#5b7186;line-height:1.6;margin:0 0 16px;">Hi'+(name?(' '+escapeHtml(name)):'')+', hope you’ve been making the most of your FFP Passport.'+(endLabel?(' Your 7-day free trial ends on <strong style="color:#0f2c47;">'+escapeHtml(endLabel)+'</strong>.'):'')+'</p>'
   +'<p style="font-size:14px;color:#5b7186;line-height:1.6;margin:0 0 18px;">'+detail+' Want to make a change? You can manage or cancel anytime before then.</p>'
   +'<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0;"><tr><td style="background:#FFCC00;border-radius:10px;"><a href="https://ffppassport.com/ffp-member-dashboard.html" style="display:inline-block;padding:13px 26px;font-size:14px;font-weight:800;color:#0f2c47;text-decoration:none;">Open my Passport</a></td></tr></table>';
  await mailer.sendMail({ from: '"FFP Passport" <noreply@ffppassport.com>', to: toEmail, subject: 'Your FFP Passport free trial ends in 3 days', html: brandEmail('Your trial', body) });
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
      last_login: new Date().toISOString(),
      verified: true                       // a completed email-code sign-in proves the inbox is theirs
    }).eq('id', member.id);
    member.verified = true;
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
// ── v96: HYBRID AUTH — exchange a VERIFIED native Supabase session for the FFP app-JWT.
// The dashboard/booking platform logs the member in with native Supabase Auth (OTP / magic-link —
// rate-limited, single-use, MFA-capable: no stored 6-digit code). The native session's access_token
// is POSTed here; we validate it with the service client, resolve the platform member by the
// members.user_id link (or by email, linking on first use, or create), then mint the SAME short
// app-JWT (sub=members.id) the rest of the app already uses — so the entire RLS layer is unchanged.
// Runs in PARALLEL with /api/auth/signin (access_code) until the legacy path is retired.
app.post('/api/auth/exchange', async (req, res) => {
  try {
    // ── One-time cross-origin HANDOFF code (booking-site signup → dashboard origin). Stateless 60s
    // HMAC code (URL #fragment only). Returns the SAME {jwt, refresh, member} shape as the native path.
    const handoffCode = (req.body && req.body.code) || '';
    if (handoffCode) {
      const hc = verifyHandoffCode(handoffCode);
      if (!hc) return res.status(400).json({ error: 'invalid_or_expired_code' });
      const { data: hm } = await supabase.from('members').select('*').eq('id', hc.memberId).maybeSingle();
      if (!hm) return res.status(404).json({ error: 'no_account' });
      if (hm.status && hm.status !== 'active') return res.status(403).json({ error: 'Account suspended' });
      try { await supabase.from('members').update({ last_login: new Date().toISOString() }).eq('id', hm.id); } catch (e) {}
      const { access_code: _hac, ...hmSafe } = hm;
      return res.json({
        success: true,
        jwt: mintSupabaseJwt(hm),
        refresh: mintRefreshToken(hm),
        member: hmSafe,
        redirect: '/ffp-provider-dashboard.html'
      });
    }

    const accessToken = (req.body && (req.body.access_token || req.body.accessToken)) || '';
    if (!accessToken) return res.status(400).json({ error: 'Missing access_token' });

    // 1) Validate the native Supabase session (signature + expiry handled by the SDK)
    const { data: u, error: uErr } = await supabase.auth.getUser(accessToken);
    const nativeUser = u && u.user;
    if (uErr || !nativeUser || !nativeUser.id) return res.status(401).json({ error: 'Invalid or expired session' });
    const nativeId = nativeUser.id;
    const email = String(nativeUser.email || '').trim().toLowerCase();

    // 2) Resolve the platform member — by user_id link, then by email (link on first use), then create
    let member = null;
    {
      const { data: byLink } = await supabase.from('members').select('*').eq('user_id', nativeId).maybeSingle();
      member = byLink || null;
    }
    if (!member && email) {
      const { data: byEmail } = await supabase.from('members').select('*').eq('email', email).maybeSingle();
      if (byEmail) {
        if (!byEmail.user_id) {
          // link this native auth user to the existing member (idempotent; never overwrite a set value)
          await supabase.from('members').update({ user_id: nativeId }).eq('id', byEmail.id).is('user_id', null);
        }
        member = byEmail; member.user_id = byEmail.user_id || nativeId;
      }
    }
    // allow_create:false (sign-in funnel) → never auto-create a member for an unknown email; the
    // front then shows "Become a member". Default true (signup / booking-platform link flows).
    const allowCreate = !(req.body && req.body.allow_create === false);
    if (!member && !allowCreate) return res.status(404).json({ error: 'no_account' });
    if (!member) {
      const { data: created, error: cErr } = await supabase.from('members')
        .insert({ email, membership: 'free', role: 'member', status: 'active', user_id: nativeId })
        .select('*').single();
      if (cErr || !created) return res.status(500).json({ error: (cErr && cErr.message) || 'Could not create member' });
      member = created;
    }

    if (member.status && member.status !== 'active') return res.status(403).json({ error: 'Account suspended' });
    try { await supabase.from('members').update({ last_login: new Date().toISOString() }).eq('id', member.id); } catch (e) {}

    const { access_code: _ac, ...memberSafe } = member;
    res.json({
      success: true,
      jwt: mintSupabaseJwt(member),       // short (7d) app-JWT, sub=members.id → RLS unchanged
      refresh: mintRefreshToken(member),  // long-lived refresh → /api/auth/refresh (same as signin)
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
  // current_period_end moved from the subscription object to its items in newer Stripe API versions.
  // Read the top-level value, else fall back to the first item, so a SDK/API bump can never silently
  // null the expiry (which is what stranded converted trials at their 7-day date).
  const _cpe = sub.current_period_end
    || (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].current_period_end)
    || null;
  const periodEnd = _cpe ? new Date(_cpe * 1000).toISOString() : null;
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
// A renewal charge failed → branded heads-up so they can fix their card before access lapses.
// We do NOT change access here; Stripe auto-retries and will fire subscription.updated/deleted,
// which setMemberFromSubscription already handles.
async function onInvoicePaymentFailed(invoice) {
  if (!invoice || !invoice.subscription) return;   // only subscription (renewal) invoices
  let email = invoice.customer_email || null, name = null, row = null;
  if (invoice.customer) {
    const { data } = await supabase.from('members').select('email, given_names, full_name').eq('stripe_customer_id', invoice.customer).maybeSingle();
    if (data) row = data;
  }
  if (!row && email) {
    const { data } = await supabase.from('members').select('email, given_names, full_name').eq('email', String(email).toLowerCase()).maybeSingle();
    if (data) row = data;
  }
  if (row) { email = row.email || email; name = row.given_names || (row.full_name ? String(row.full_name).split(' ')[0] : null); }
  if (email) { try { await sendPaymentFailedEmail(email, name); } catch (e) { console.warn('[payment_failed email]', e.message); } }
}
// 3 days before a trial converts → friendly heads-up with the date + what they'll be charged.
async function onTrialWillEnd(sub) {
  if (!sub) return;
  const plan = (sub.metadata && sub.metadata.plan) || null;
  let row = null;
  const mid = (sub.metadata && sub.metadata.member_id) || null;
  if (mid) { const { data } = await supabase.from('members').select('email, given_names, full_name').eq('id', mid).maybeSingle(); if (data) row = data; }
  if (!row && sub.customer) { const { data } = await supabase.from('members').select('email, given_names, full_name').eq('stripe_customer_id', sub.customer).maybeSingle(); if (data) row = data; }
  if (!row && sub.id) { const { data } = await supabase.from('members').select('email, given_names, full_name').eq('stripe_subscription_id', sub.id).maybeSingle(); if (data) row = data; }
  if (!row || !row.email) return;
  const name = row.given_names || (row.full_name ? String(row.full_name).split(' ')[0] : null);
  const planLabel = plan === 'annual' ? 'annual' : (plan === 'monthly' ? 'monthly' : null);
  const amountLabel = plan === 'annual' ? '$149 / year' : (plan === 'monthly' ? '$20 / month' : null);
  let endLabel = null;
  if (sub.trial_end) { try { endLabel = new Date(sub.trial_end * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) {} }
  try { await sendTrialEndingEmail(row.email, name, planLabel, amountLabel, endLabel); } catch (e) { console.warn('[trial_will_end email]', e.message); }
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

// ── Cross-origin HANDOFF code (booking-site signup on findfitpeople.com → dashboard origin
// ffppassport.com). Stateless, short-lived (60s), HMAC-signed — same pattern as the refresh token,
// so no store is needed. Transported only in the URL #fragment (never a query string / history).
// Exchanged once at /api/auth/exchange {code} for the real {jwt, refresh, member} session.
const HANDOFF_TTL_MS = 60 * 1000;   // 60 seconds
function mintHandoffCode(member) {
  const payload = `h.${member.id}.${Date.now() + HANDOFF_TTL_MS}`;
  const sig = crypto.createHmac('sha256', VERIFY_SECRET).update(payload).digest('hex');
  return b64url(payload) + '.' + sig;
}
function verifyHandoffCode(code) {
  try {
    const parts = String(code).split('.');
    if (parts.length !== 2) return null;
    const payload = Buffer.from(parts[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const expect = crypto.createHmac('sha256', VERIFY_SECRET).update(payload).digest('hex');
    const a = Buffer.from(parts[1]); const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const bits = payload.split('.');           // ['h', memberId, expMs]
    if (bits[0] !== 'h') return null;
    const memberId = bits[1]; const expMs = Number(bits[2]);
    if (!memberId || !expMs || Date.now() > expMs) return null;
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

// v118: Verify an admin's Supabase access JWT (Authorization: Bearer <ffp_jwt>) → members.id.
// Same HS256/SUPABASE_JWT_SECRET scheme as mintSupabaseJwt. Returns { memberId } or null.
// Caller must still confirm the member is in admin_users.
function verifyAdminAccessJwt(authHeaderOrToken) {
  try {
    if (!SUPABASE_JWT_SECRET) return null;
    const parts = String(authHeaderOrToken || '').replace(/^Bearer\s+/i, '').split('.');
    if (parts.length !== 3) return null;
    const expect = crypto.createHmac('sha256', SUPABASE_JWT_SECRET).update(parts[0] + '.' + parts[1]).digest('base64url');
    const a = Buffer.from(parts[2]); const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (!payload || !payload.sub) return null;
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    return { memberId: String(payload.sub) };
  } catch (_) { return null; }
}

// ── FACILITY PAYMENTS — Stripe Connect (Standard) onboarding via Account Links ────────────────
// Each facility gets a Standard connected account created via the API; they finish onboarding on
// Stripe's own hosted form (KYC, bank, ID). Charges are taken directly on their account with ZERO
// application fee → money → facility's Stripe → their bank; FFP never touches it. No client_id and
// no pre-registered redirect URI needed — only STRIPE_SECRET_KEY (already set) + Connect enabled.
//   PROVIDER_DASH_URL (optional)  = where to bounce the facility back after onboarding
//   BACKEND_BASE_URL (optional)   = this backend's public origin (for return/refresh links)
const PROVIDER_DASH_URL = process.env.PROVIDER_DASH_URL || (SITE_URL + '/ffp-provider-dashboard.html');
const BACKEND_BASE = (process.env.BACKEND_BASE_URL || 'https://ffp-passport-backend.vercel.app').replace(/\/$/, '');

// Signed, time-boxed token tying the hosted-onboarding round-trip to one provider id (HMAC, server-only).
function signConnectState(providerId) {
  const payload = `${providerId}.${Date.now() + 2 * 60 * 60 * 1000}`; // 2-hour window (onboarding can take minutes)
  const sig = crypto.createHmac('sha256', VERIFY_SECRET).update('connect:' + payload).digest('hex');
  return b64url(payload) + '.' + sig;
}
function verifyConnectState(state) {
  try {
    const parts = String(state).split('.');
    if (parts.length !== 2) return null;
    const payload = Buffer.from(parts[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const expect  = crypto.createHmac('sha256', VERIFY_SECRET).update('connect:' + payload).digest('hex');
    const a = Buffer.from(parts[1]); const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const [pid, expStr] = payload.split('.');
    if (!pid || Number(expStr) < Date.now()) return null;
    return pid;
  } catch (_) { return null; }
}
function buildAccountLink(providerId, accountId) {
  const t = signConnectState(providerId);
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: BACKEND_BASE + '/api/facility/connect/refresh?pid=' + encodeURIComponent(t),
    return_url:  BACKEND_BASE + '/api/facility/connect/return?pid='  + encodeURIComponent(t),
    type: 'account_onboarding'
  });
}
// v97 (reliability): map a Stripe Account's LIVE capability into our status columns. Stripe is the source of truth.
//   charges_enabled            → can they take payments right now?
//   details_submitted=false    → still mid-onboarding (not "restricted", just unfinished)
//   charges off + submitted    → 'restricted' (Stripe paused them — action needed)
//   requirements.currently/past_due → what Stripe still needs (surfaced to the partner)
function accountStatusPatch(acct) {
  const charges = !!(acct && acct.charges_enabled);
  const payouts = !!(acct && acct.payouts_enabled);
  const req = (acct && acct.requirements) || {};
  const due = [].concat(req.currently_due || []).concat(req.past_due || []);
  const disabled = (req && req.disabled_reason) || null;
  const status = charges ? 'connected' : ((acct && acct.details_submitted) ? 'restricted' : 'onboarding');
  return {
    charges_enabled: charges,
    payouts_enabled: payouts,
    requirements_due: due.length ? Array.from(new Set(due)).join(',') : null,
    disabled_reason: disabled,
    payments_status: status,
    payments_updated_at: new Date().toISOString()
  };
}
// v97 (reliability): account.updated handler — re-sync whichever facility/pro owns this connected account so a
// partner who later gets restricted/payouts-paused is reflected immediately (instead of a stale 'connected').
async function syncConnectAccount(acct) {
  if (!acct || !acct.id) return;
  const patch = accountStatusPatch(acct);
  const { data: prov } = await supabase.from('providers').select('id, stripe_connected_at').eq('stripe_account_id', acct.id).maybeSingle();
  if (prov) {
    if (patch.payments_status === 'connected' && !prov.stripe_connected_at) patch.stripe_connected_at = new Date().toISOString();
    await supabase.from('providers').update(patch).eq('id', prov.id);
    return;
  }
  const { data: pro } = await supabase.from('professionals').select('id, stripe_connected_at').eq('stripe_account_id', acct.id).maybeSingle();
  if (pro) {
    if (patch.payments_status === 'connected' && !pro.stripe_connected_at) patch.stripe_connected_at = new Date().toISOString();
    await supabase.from('professionals').update(patch).eq('id', pro.id);
  }
}

// Begin onboarding: portal posts the signed-in member's refresh token + provider_id. We confirm they
// OWN that facility, ensure a Standard connected account exists, and return a Stripe-hosted onboarding link.
app.post('/api/facility/connect/start', async (req, res) => {
  try {
    const { refresh, provider_id } = req.body || {};
    const v = refresh ? verifyRefreshToken(refresh) : null;
    if (!v) return res.status(401).json({ error: 'Not signed in' });
    if (!provider_id) return res.status(400).json({ error: 'Missing provider_id' });
    const { data: prov, error } = await supabase
      .from('providers').select('id, owner_user_id, business_name, contact_email, stripe_account_id, payments_status')
      .eq('id', provider_id).maybeSingle();
    if (error) throw error;
    if (!prov || String(prov.owner_user_id) !== String(v.memberId)) {
      return res.status(403).json({ error: 'Not your facility' });
    }
    let acctId = prov.stripe_account_id;
    if (acctId) {
      // Existing account: if fully enabled we're done; otherwise resume onboarding.
      try {
        const acct = await stripe.accounts.retrieve(acctId);
        if (acct && acct.charges_enabled) {
          if (prov.payments_status !== 'connected') {
            await supabase.from('providers').update({ payments_status: 'connected', stripe_connected_at: new Date().toISOString() }).eq('id', provider_id);
          }
          return res.json({ already_connected: true });
        }
      } catch (e) { acctId = null; } // account was deleted on Stripe → recreate below
    }
    if (!acctId) {
      const account = await stripe.accounts.create({
        type: 'standard',
        email: prov.contact_email || undefined,
        business_profile: prov.business_name ? { name: prov.business_name } : undefined
      });
      acctId = account.id;
      await supabase.from('providers').update({ stripe_account_id: acctId, payments_status: 'onboarding' }).eq('id', provider_id);
    }
    const link = await buildAccountLink(provider_id, acctId);
    res.json({ url: link.url });
  } catch (e) {
    console.error('[connect/start]', e);
    res.status(500).json({ error: 'Could not start Stripe setup' });
  }
});

// Stripe returns the facility here after the hosted onboarding form. We check whether the account can
// now take charges, update status, and bounce them to the portal Billing panel.
app.get('/api/facility/connect/return', async (req, res) => {
  const back = (flag) => res.redirect(PROVIDER_DASH_URL + '?panel=billing&stripe=' + flag);
  try {
    const pid = verifyConnectState(req.query && req.query.pid);
    if (!pid) return back('error');
    const { data: prov } = await supabase.from('providers').select('stripe_account_id').eq('id', pid).maybeSingle();
    if (!prov || !prov.stripe_account_id) return back('error');
    const acct = await stripe.accounts.retrieve(prov.stripe_account_id);
    const upd = accountStatusPatch(acct);
    if (upd.payments_status === 'connected') upd.stripe_connected_at = new Date().toISOString();
    await supabase.from('providers').update(upd).eq('id', pid);
    return back(upd.payments_status === 'connected' ? 'connected' : 'incomplete');
  } catch (e) {
    console.error('[connect/return]', e);
    return back('error');
  }
});

// Account link expired or the user bounced — mint a fresh onboarding link and send them back in.
app.get('/api/facility/connect/refresh', async (req, res) => {
  const errBack = () => res.redirect(PROVIDER_DASH_URL + '?panel=billing&stripe=error');
  try {
    const pid = verifyConnectState(req.query && req.query.pid);
    if (!pid) return errBack();
    const { data: prov } = await supabase.from('providers').select('stripe_account_id').eq('id', pid).maybeSingle();
    if (!prov || !prov.stripe_account_id) return errBack();
    const link = await buildAccountLink(pid, prov.stripe_account_id);
    return res.redirect(link.url);
  } catch (e) {
    console.error('[connect/refresh]', e);
    return errBack();
  }
});

// ════════════════════════════════════════════════════════════════════════════════════════════
// v95 (2026-06-13): PROFESSIONAL Connect onboarding (mirrors facility) + BOOKING PAYMENTS.
//   Charges are DIRECT on the facility's / pro's connected account (Stripe-Account header via
//   { stripeAccount }). FFP never holds funds; zero application fee. Cash session + package purchases
//   redirect to Stripe Checkout; the success_url returns to /api/pay/confirm which finalises idempotently
//   (mark_booking_paid / grant_member_plan / grant_pro_package) then bounces to the booking site.
// ════════════════════════════════════════════════════════════════════════════════════════════
const PRO_DASH_URL  = process.env.PRO_DASH_URL  || (SITE_URL + '/ffp-professional-dashboard.html');
const BOOKINGS_URL  = process.env.BOOKINGS_URL  || 'https://findfitpeople.com';
function withFlag(url, flag) { return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'pay=' + flag; }

function buildProAccountLink(professionalId, accountId) {
  const t = signConnectState(professionalId);
  return stripe.accountLinks.create({
    account: accountId,
    refresh_url: BACKEND_BASE + '/api/pro/connect/refresh?pid=' + encodeURIComponent(t),
    return_url:  BACKEND_BASE + '/api/pro/connect/return?pid='  + encodeURIComponent(t),
    type: 'account_onboarding'
  });
}

// PRO onboarding — same flow as facility, keyed on professionals.stripe_account_id (owner = professionals.member_id).
app.post('/api/pro/connect/start', async (req, res) => {
  try {
    const { refresh, professional_id } = req.body || {};
    const v = refresh ? verifyRefreshToken(refresh) : null;
    if (!v) return res.status(401).json({ error: 'Not signed in' });
    if (!professional_id) return res.status(400).json({ error: 'Missing professional_id' });
    const { data: pro, error } = await supabase
      .from('professionals').select('id, member_id, display_name, work_email, stripe_account_id, payments_status')
      .eq('id', professional_id).maybeSingle();
    if (error) throw error;
    if (!pro || String(pro.member_id) !== String(v.memberId)) return res.status(403).json({ error: 'Not your professional account' });
    let acctId = pro.stripe_account_id;
    if (acctId) {
      try {
        const acct = await stripe.accounts.retrieve(acctId);
        if (acct && acct.charges_enabled) {
          if (pro.payments_status !== 'connected') {
            await supabase.from('professionals').update({ payments_status: 'connected', stripe_connected_at: new Date().toISOString() }).eq('id', professional_id);
          }
          return res.json({ already_connected: true });
        }
      } catch (e) { acctId = null; }
    }
    if (!acctId) {
      const account = await stripe.accounts.create({
        type: 'standard',
        email: pro.work_email || undefined,
        business_profile: pro.display_name ? { name: pro.display_name } : undefined
      });
      acctId = account.id;
      await supabase.from('professionals').update({ stripe_account_id: acctId, payments_status: 'onboarding' }).eq('id', professional_id);
    }
    const link = await buildProAccountLink(professional_id, acctId);
    res.json({ url: link.url });
  } catch (e) { console.error('[pro connect/start]', e); res.status(500).json({ error: 'Could not start Stripe setup' }); }
});
app.get('/api/pro/connect/return', async (req, res) => {
  const back = (flag) => res.redirect(PRO_DASH_URL + '?panel=checkin&stripe=' + flag);
  try {
    const pid = verifyConnectState(req.query && req.query.pid);
    if (!pid) return back('error');
    const { data: pro } = await supabase.from('professionals').select('stripe_account_id').eq('id', pid).maybeSingle();
    if (!pro || !pro.stripe_account_id) return back('error');
    const acct = await stripe.accounts.retrieve(pro.stripe_account_id);
    const upd = accountStatusPatch(acct);
    if (upd.payments_status === 'connected') upd.stripe_connected_at = new Date().toISOString();
    await supabase.from('professionals').update(upd).eq('id', pid);
    return back(upd.payments_status === 'connected' ? 'connected' : 'incomplete');
  } catch (e) { console.error('[pro connect/return]', e); return back('error'); }
});
app.get('/api/pro/connect/refresh', async (req, res) => {
  const errBack = () => res.redirect(PRO_DASH_URL + '?panel=checkin&stripe=error');
  try {
    const pid = verifyConnectState(req.query && req.query.pid);
    if (!pid) return errBack();
    const { data: pro } = await supabase.from('professionals').select('stripe_account_id').eq('id', pid).maybeSingle();
    if (!pro || !pro.stripe_account_id) return errBack();
    const link = await buildProAccountLink(pid, pro.stripe_account_id);
    return res.redirect(link.url);
  } catch (e) { console.error('[pro connect/refresh]', e); return errBack(); }
});

// Currency minor-unit conversion. Most currencies are 2-decimal (×100). Stripe zero-decimal currencies take the
// whole-number amount (×1) — multiplying by 100 there would overcharge 100×. (3-decimal currencies are excluded
// from the supported set, so 2 vs 0 is sufficient.)
const ZERO_DECIMAL_CCY = new Set(['BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA','PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF']);
const THREE_DECIMAL_CCY = new Set(['BHD','JOD','KWD','OMR','TND']); // Stripe wants thousandths, rounded to a multiple of 10
function toMinorUnits(amount, currency) {
  const a = Number(amount || 0);
  const c = String(currency || 'AED').toUpperCase();
  if (ZERO_DECIMAL_CCY.has(c)) return Math.round(a);
  if (THREE_DECIMAL_CCY.has(c)) return Math.round((a * 1000) / 10) * 10;
  return Math.round(a * 100);
}

// Create a Checkout Session ON a connected account (direct charge; FFP holds no funds, zero application fee).
async function connectedCheckout(acctId, o) {
  return stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price_data: { currency: String(o.currency || 'AED').toLowerCase(), unit_amount: o.amount_fils, product_data: { name: o.name } }, quantity: 1 }],
    metadata: o.metadata,
    payment_intent_data: { metadata: o.metadata },
    success_url: o.success_url,
    cancel_url: o.cancel_url
  }, { stripeAccount: acctId });
}

// Facility session (cash). Booking already exists (book_session …'cash'). Charges the facility's account.
app.post('/api/pay/session-checkout', async (req, res) => {
  try {
    const { booking_id, success_url, cancel_url } = req.body || {};
    if (!booking_id) return res.status(400).json({ error: 'Missing booking_id' });
    const { data: bk } = await supabase.from('bookings').select('id, provider_id, total_aed, payment_status').eq('id', booking_id).maybeSingle();
    if (!bk) return res.status(404).json({ error: 'Booking not found' });
    if (bk.payment_status === 'paid') return res.json({ already_paid: true });
    if (!bk.provider_id) return res.status(400).json({ error: 'No facility on booking' });
    const { data: prov } = await supabase.from('providers').select('stripe_account_id, payments_status, business_name, currency').eq('id', bk.provider_id).maybeSingle();
    if (!prov || prov.payments_status !== 'connected' || !prov.stripe_account_id) return res.status(409).json({ error: 'Facility not accepting payments yet' });
    const amount = toMinorUnits(bk.total_aed, prov.currency);
    if (amount <= 0) return res.status(400).json({ error: 'Nothing to charge' });
    const to = success_url || BOOKINGS_URL;
    const sess = await connectedCheckout(prov.stripe_account_id, {
      amount_fils: amount, currency: prov.currency, name: (prov.business_name || 'Session') + ' — booking', metadata: { kind: 'session', booking_id: String(booking_id) },
      success_url: BACKEND_BASE + '/api/pay/confirm?kind=session&acct=' + prov.stripe_account_id + '&ref=' + booking_id + '&sid={CHECKOUT_SESSION_ID}&to=' + encodeURIComponent(to),
      cancel_url: cancel_url || BOOKINGS_URL
    });
    res.json({ url: sess.url });
  } catch (e) { console.error('[pay/session-checkout]', e); res.status(500).json({ error: 'Could not start payment' }); }
});

// Pro session (cash). Booking item_type='professional_session', item_id=pro_slots id → professional.
app.post('/api/pay/pro-session-checkout', async (req, res) => {
  try {
    const { booking_id, success_url, cancel_url } = req.body || {};
    if (!booking_id) return res.status(400).json({ error: 'Missing booking_id' });
    const { data: bk } = await supabase.from('bookings').select('id, item_id, total_aed, payment_status').eq('id', booking_id).maybeSingle();
    if (!bk) return res.status(404).json({ error: 'Booking not found' });
    if (bk.payment_status === 'paid') return res.json({ already_paid: true });
    const { data: slot } = await supabase.from('pro_slots').select('professional_id').eq('id', bk.item_id).maybeSingle();
    if (!slot) return res.status(400).json({ error: 'Slot not found' });
    const { data: pro } = await supabase.from('professionals').select('stripe_account_id, payments_status, display_name, currency').eq('id', slot.professional_id).maybeSingle();
    if (!pro || pro.payments_status !== 'connected' || !pro.stripe_account_id) return res.status(409).json({ error: 'Pro not accepting payments yet' });
    const amount = toMinorUnits(bk.total_aed, pro.currency);
    if (amount <= 0) return res.status(400).json({ error: 'Nothing to charge' });
    const to = success_url || BOOKINGS_URL;
    const sess = await connectedCheckout(pro.stripe_account_id, {
      amount_fils: amount, currency: pro.currency, name: (pro.display_name || 'Coach') + ' — session', metadata: { kind: 'pro_session', booking_id: String(booking_id) },
      success_url: BACKEND_BASE + '/api/pay/confirm?kind=pro_session&acct=' + pro.stripe_account_id + '&ref=' + booking_id + '&sid={CHECKOUT_SESSION_ID}&to=' + encodeURIComponent(to),
      cancel_url: cancel_url || BOOKINGS_URL
    });
    res.json({ url: sess.url });
  } catch (e) { console.error('[pay/pro-session-checkout]', e); res.status(500).json({ error: 'Could not start payment' }); }
});

// Generic paid booking — Experiences / Trips (create_booking) and paid Events (book_event_order). Both insert
// into bookings with provider_id + total_aed (unpaid). Charges the listing's connected FACILITY account, same
// Connect Standard / zero-fee / auto-confirm pattern as session-checkout. (v99, gap #1)
app.post('/api/pay/booking-checkout', async (req, res) => {
  try {
    const { booking_id, success_url, cancel_url } = req.body || {};
    if (!booking_id) return res.status(400).json({ error: 'Missing booking_id' });
    const { data: bk } = await supabase.from('bookings').select('id, provider_id, item_type, total_aed, payment_status').eq('id', booking_id).maybeSingle();
    if (!bk) return res.status(404).json({ error: 'Booking not found' });
    if (bk.payment_status === 'paid') return res.json({ already_paid: true });
    if (!bk.provider_id) return res.status(400).json({ error: 'No facility on booking' });
    const { data: prov } = await supabase.from('providers').select('stripe_account_id, payments_status, business_name, currency').eq('id', bk.provider_id).maybeSingle();
    if (!prov || prov.payments_status !== 'connected' || !prov.stripe_account_id) return res.status(409).json({ error: 'Facility not accepting payments yet' });
    const amount = toMinorUnits(bk.total_aed, prov.currency);
    if (amount <= 0) return res.status(400).json({ error: 'Nothing to charge' });
    const to = success_url || BOOKINGS_URL;
    const sess = await connectedCheckout(prov.stripe_account_id, {
      amount_fils: amount, currency: prov.currency, name: (prov.business_name || 'Booking') + ' — booking', metadata: { kind: 'booking', booking_id: String(booking_id) },
      success_url: BACKEND_BASE + '/api/pay/confirm?kind=booking&acct=' + prov.stripe_account_id + '&ref=' + booking_id + '&sid={CHECKOUT_SESSION_ID}&to=' + encodeURIComponent(to),
      cancel_url: cancel_url || BOOKINGS_URL
    });
    res.json({ url: sess.url });
  } catch (e) { console.error('[pay/booking-checkout]', e); res.status(500).json({ error: 'Could not start payment' }); }
});

// Buy a facility package (credits granted on payment success).
app.post('/api/pay/buy-plan', async (req, res) => {
  try {
    const { member_id, provider_id, plan_id, success_url, cancel_url } = req.body || {};
    if (!member_id || !provider_id || !plan_id) return res.status(400).json({ error: 'Missing fields' });
    const { data: plan } = await supabase.from('provider_plans').select('id, name, price_aed').eq('id', plan_id).eq('provider_id', provider_id).maybeSingle();
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    const { data: prov } = await supabase.from('providers').select('stripe_account_id, payments_status, business_name, currency').eq('id', provider_id).maybeSingle();
    if (!prov || prov.payments_status !== 'connected' || !prov.stripe_account_id) return res.status(409).json({ error: 'Facility not accepting payments yet' });
    const amount = toMinorUnits(plan.price_aed, prov.currency);
    if (amount <= 0) return res.status(400).json({ error: 'Nothing to charge' });
    const to = success_url || BOOKINGS_URL;
    const sess = await connectedCheckout(prov.stripe_account_id, {
      amount_fils: amount, currency: prov.currency, name: (prov.business_name || 'Facility') + ' — ' + (plan.name || 'package'),
      metadata: { kind: 'plan', member_id: String(member_id), provider_id: String(provider_id), plan_id: String(plan_id) },
      success_url: BACKEND_BASE + '/api/pay/confirm?kind=plan&acct=' + prov.stripe_account_id + '&member=' + member_id + '&provider=' + provider_id + '&plan=' + plan_id + '&sid={CHECKOUT_SESSION_ID}&to=' + encodeURIComponent(to),
      cancel_url: cancel_url || BOOKINGS_URL
    });
    res.json({ url: sess.url });
  } catch (e) { console.error('[pay/buy-plan]', e); res.status(500).json({ error: 'Could not start payment' }); }
});

// Buy a pro package (credits granted on payment success).
app.post('/api/pay/buy-pro-package', async (req, res) => {
  try {
    const { member_id, professional_id, package_id, success_url, cancel_url } = req.body || {};
    if (!member_id || !professional_id || !package_id) return res.status(400).json({ error: 'Missing fields' });
    const { data: pk } = await supabase.from('pro_packages').select('id, name, price_aed').eq('id', package_id).eq('professional_id', professional_id).maybeSingle();
    if (!pk) return res.status(404).json({ error: 'Package not found' });
    const { data: pro } = await supabase.from('professionals').select('stripe_account_id, payments_status, display_name, currency').eq('id', professional_id).maybeSingle();
    if (!pro || pro.payments_status !== 'connected' || !pro.stripe_account_id) return res.status(409).json({ error: 'Pro not accepting payments yet' });
    const amount = toMinorUnits(pk.price_aed, pro.currency);
    if (amount <= 0) return res.status(400).json({ error: 'Nothing to charge' });
    const to = success_url || BOOKINGS_URL;
    const sess = await connectedCheckout(pro.stripe_account_id, {
      amount_fils: amount, currency: pro.currency, name: (pro.display_name || 'Coach') + ' — ' + (pk.name || 'package'),
      metadata: { kind: 'pro_package', member_id: String(member_id), professional_id: String(professional_id), package_id: String(package_id) },
      success_url: BACKEND_BASE + '/api/pay/confirm?kind=pro_package&acct=' + pro.stripe_account_id + '&member=' + member_id + '&pro=' + professional_id + '&package=' + package_id + '&sid={CHECKOUT_SESSION_ID}&to=' + encodeURIComponent(to),
      cancel_url: cancel_url || BOOKINGS_URL
    });
    res.json({ url: sess.url });
  } catch (e) { console.error('[pay/buy-pro-package]', e); res.status(500).json({ error: 'Could not start payment' }); }
});

// v98: Ad-hoc INVOICE pay-link — lets a pro's client pay a pending invoice online by card on the pro's
// connected account (direct charge, zero fee). 409 if the pro isn't Stripe-connected → caller omits the link.
app.post('/api/pay/invoice-checkout', async (req, res) => {
  try {
    const { payment_id, success_url, cancel_url } = req.body || {};
    if (!payment_id) return res.status(400).json({ error: 'Missing payment_id' });
    const { data: inv } = await supabase.from('pro_payments').select('id, professional_id, description, amount_aed, status').eq('id', payment_id).maybeSingle();
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    if (inv.status === 'paid') return res.json({ already_paid: true });
    const { data: pro } = await supabase.from('professionals').select('stripe_account_id, payments_status, display_name, currency').eq('id', inv.professional_id).maybeSingle();
    if (!pro || pro.payments_status !== 'connected' || !pro.stripe_account_id) return res.status(409).json({ error: 'Pro not accepting online payments yet' });
    const amount = toMinorUnits(inv.amount_aed, pro.currency);
    if (amount <= 0) return res.status(400).json({ error: 'Nothing to charge' });
    const to = success_url || BOOKINGS_URL;
    const sess = await connectedCheckout(pro.stripe_account_id, {
      amount_fils: amount, currency: pro.currency, name: (inv.description || 'Invoice') + (pro.display_name ? ' — ' + pro.display_name : ''),
      metadata: { kind: 'invoice', invoice_id: String(payment_id) },
      success_url: BACKEND_BASE + '/api/pay/confirm?kind=invoice&acct=' + pro.stripe_account_id + '&ref=' + payment_id + '&sid={CHECKOUT_SESSION_ID}&to=' + encodeURIComponent(to),
      cancel_url: cancel_url || BOOKINGS_URL
    });
    res.json({ url: sess.url });
  } catch (e) { console.error('[pay/invoice-checkout]', e); res.status(500).json({ error: 'Could not start payment' }); }
});

// Stripe returns here after a successful Checkout. Retrieve the session ON the connected account, and if paid,
// finalise idempotently, then bounce to the booking site. (Webhook below is a backup for the same finalise.)
app.get('/api/pay/confirm', async (req, res) => {
  const q = req.query || {};
  const to = q.to ? decodeURIComponent(q.to) : BOOKINGS_URL;
  const fail = () => res.redirect(withFlag(to, 'error'));
  try {
    if (!q.acct || !q.sid) return fail();
    const sess = await stripe.checkout.sessions.retrieve(q.sid, { stripeAccount: q.acct });
    if (!sess || sess.payment_status !== 'paid') return fail();
    const intent = (typeof sess.payment_intent === 'string') ? sess.payment_intent : (sess.payment_intent && sess.payment_intent.id) || null;
    await finalisePaidCheckout(q.kind, q, sess, intent);
    return res.redirect(withFlag(to, 'ok'));
  } catch (e) { console.error('[pay/confirm]', e); return fail(); }
});

// Shared finaliser (used by confirm + the webhook). Idempotent.
async function finalisePaidCheckout(kind, p, sess, intent) {
  if (kind === 'session' || kind === 'pro_session' || kind === 'booking') {
    const bid = p.ref || p.booking_id;
    // Idempotent: confirm + webhook both call this. Only finalise + notify on the first transition to paid.
    const { data: bk } = await supabase.from('bookings')
      .select('id, member_id, payment_status, currency, total_aed').eq('id', bid).maybeSingle();
    if (!bk || bk.payment_status === 'paid') return;
    await supabase.rpc('mark_booking_paid', { p_booking: bid, p_payment_intent: intent, p_charge: null });
    // v96: Passport owns the "payment confirmed" message (it owns the confirmation event) — fires once here.
    try {
      await notifyMember(bk.member_id, {
        title: 'Payment confirmed',
        body: 'Your booking is confirmed and paid — ' + (bk.currency || 'AED') + ' ' + Number(bk.total_aed || 0).toLocaleString() + '.',
        icon: 'check_circle', link: '/ffp-member-dashboard.html'
      });
    } catch (e) {}
  } else if (kind === 'plan') {
    const { data: ex } = await supabase.from('provider_member_plans').select('id').eq('stripe_session_id', sess.id).maybeSingle();
    if (!ex) {
      const { data: g } = await supabase.rpc('grant_member_plan', { p_member: p.member || p.member_id, p_provider: p.provider || p.provider_id, p_plan: p.plan || p.plan_id });
      if (g && g.member_plan_id) await supabase.from('provider_member_plans').update({ stripe_session_id: sess.id }).eq('id', g.member_plan_id);
      try { await notifyMember(p.member || p.member_id, { title: 'Membership active', body: 'Your package is paid — your credits are ready to book.', icon: 'redeem', link: '/ffp-member-dashboard.html' }); } catch (e) {}
    }
  } else if (kind === 'pro_package') {
    const { data: ex } = await supabase.from('pro_client_packages').select('id').eq('stripe_session_id', sess.id).maybeSingle();
    if (!ex) {
      const { data: g } = await supabase.rpc('grant_pro_package', { p_member: p.member || p.member_id, p_professional: p.pro || p.professional_id, p_package: p.package || p.package_id });
      if (g && g.client_package_id) await supabase.from('pro_client_packages').update({ stripe_session_id: sess.id }).eq('id', g.client_package_id);
      try { await notifyMember(p.member || p.member_id, { title: 'Package active', body: 'Your package is paid — your credits are ready to book.', icon: 'redeem', link: '/ffp-member-dashboard.html' }); } catch (e) {}
    }
  } else if (kind === 'invoice') {
    const invId = p.ref || p.invoice_id;
    const { data: row } = await supabase.from('pro_payments').select('id, status').eq('id', invId).maybeSingle();
    if (row && row.status !== 'paid') {
      await supabase.from('pro_payments').update({ status: 'paid', method: 'online', paid_on: new Date().toISOString().slice(0,10), updated_at: new Date().toISOString() }).eq('id', invId);
    }
  }
}

// ── v96: REFUND (gap #3). cancel_booking (member-gated RPC) computes refund_pct + refunded_aed and marks the
// booking cancelled/refunded; this endpoint moves the money on the SAME connected account the charge was on
// (direct-charge refund). Idempotent via Stripe idempotency key. FFP holds no funds, takes no fee on the refund.
app.post('/api/pay/refund', async (req, res) => {
  try {
    const { booking_id } = req.body || {};
    if (!booking_id) return res.status(400).json({ error: 'Missing booking_id' });
    const { data: bk } = await supabase.from('bookings')
      .select('id, provider_id, item_type, item_id, status, payment_status, refunded_aed, payment_ref, currency, stripe_payment_intent_id, stripe_charge_id')
      .eq('id', booking_id).maybeSingle();
    if (!bk) return res.status(404).json({ error: 'Booking not found' });
    if (bk.status !== 'cancelled') return res.status(409).json({ error: 'Booking is not cancelled — call cancel_booking first' });
    if (!['refunded', 'partially_refunded'].includes(bk.payment_status)) {
      return res.json({ ok: true, refunded: 0, note: 'No refund due per the cancellation policy' });
    }
    const amtFils = toMinorUnits(bk.refunded_aed, bk.currency);
    if (!amtFils || amtFils <= 0) return res.json({ ok: true, refunded: 0, note: 'No refund amount' });
    if (!bk.stripe_payment_intent_id && !bk.stripe_charge_id) {
      return res.status(409).json({ error: 'No Stripe charge on this booking (credit or unpaid) — nothing to refund' });
    }
    // Resolve the connected account: facility via provider_id, pro via item_id -> pro_slots.professional_id.
    let acctId = null;
    if (bk.item_type === 'professional_session') {
      const { data: slot } = await supabase.from('pro_slots').select('professional_id').eq('id', bk.item_id).maybeSingle();
      if (slot) { const { data: pro } = await supabase.from('professionals').select('stripe_account_id').eq('id', slot.professional_id).maybeSingle(); acctId = pro && pro.stripe_account_id; }
    } else if (bk.provider_id) {
      const { data: prov } = await supabase.from('providers').select('stripe_account_id').eq('id', bk.provider_id).maybeSingle();
      acctId = prov && prov.stripe_account_id;
    }
    if (!acctId) return res.status(409).json({ error: 'No connected Stripe account for this booking' });
    const args = { amount: amtFils };
    if (bk.stripe_payment_intent_id) args.payment_intent = bk.stripe_payment_intent_id; else args.charge = bk.stripe_charge_id;
    const refund = await stripe.refunds.create(args, { stripeAccount: acctId, idempotencyKey: 'refund_' + booking_id });
    await supabase.from('bookings').update({ payment_ref: (bk.payment_ref ? bk.payment_ref + ';' : '') + 'refund:' + refund.id }).eq('id', booking_id);
    return res.json({ ok: true, refunded: Number(bk.refunded_aed || 0), currency: bk.currency || 'AED', refund_id: refund.id, status: refund.status });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// ── v74: MEMBER IMAGE UPLOAD (proper, server-validated) ──────────────────────────────────────
// Members reach Supabase as the `anon` role (custom FFP JWT + anon key), so they can't write Storage
// under owner-scoped RLS. Instead of opening the bucket to anon/public, the browser POSTs the image
// here with the member's long-lived refresh token; we verify it → member id, then upload with the
// SERVICE key into the member's own folder. Storage write policies stay LOCKED (anon/public removed).
// Bucket allowlist + size cap guard abuse. Providers/admins keep uploading directly (real auth session).
const UPLOAD_BUCKETS = { 'quest-images': true, 'activity-photos': true };
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
// v100: emailed to the HOST when an attendee cancels their spot / withdraws a request (in-app notice via leave_meetup RPC).
async function sendMeetupLeaveEmail(toEmail, hostName, leaverName, m, wasPending) {
  var hi = hostName ? ('Hi ' + escapeHtml(hostName) + '. ') : '';
  var who = leaverName ? escapeHtml(leaverName) : 'A member';
  var verb = wasPending ? 'withdrawn their request to join' : 'cancelled their spot for';
  var head = wasPending ? 'A request was withdrawn' : 'Someone left your meet-up';
  var body = '<div style="font-size:24px;font-weight:800;color:#0f2c47;margin-bottom:6px;letter-spacing:-0.3px;">' + head + '</div>'
   + '<p style="font-size:14px;color:#5b7186;line-height:1.6;margin:0 0 12px;">' + hi + '<strong style="color:#0f2c47;">' + who + '</strong> has ' + verb + ' your meet-up. A spot has opened back up.</p>'
   + mtgDetailBlock(m) + mtgCta('View meet-up');
  await mailer.sendMail({ from: '"FFP Passport" <noreply@ffppassport.com>', to: toEmail, subject: who + (wasPending ? ' withdrew from your meet-up' : ' left your meet-up'), html: brandEmail('Meet & Move', body) });
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
    if (kind === 'new') {
      // v91: a meet-up was posted → notify members who match ITS criteria (city · gender · age range).
      let ids = [];
      try {
        const { data: matches } = await supabase.rpc('meetup_match_members', { p_meetup: meetupId });
        ids = (matches || []).map(r => r.member_id).filter(Boolean);
      } catch (e) { console.warn('meetup match:', e.message); }
      const what = m.title || m.sport || 'A meet-up';
      const where = m.city ? (' in ' + m.city) : '';
      let notified = 0;
      for (const toId of ids.slice(0, 800)) {
        try {
          await notifyMember(toId, {
            title: 'New meet-up near you',
            body: what + where + ' — tap to take a look',
            icon: 'groups',
            link: '/ffp-member-dashboard.html?meetup=' + meetupId + '#panel-meetups'
          });
          notified++;
        } catch (e) {}
      }
      return res.json({ success: true, notified });
    }
    if (kind === 'request') {
      // v72: a member requested to join → email the HOST so they can approve.
      if (!memberId) return res.status(400).json({ error: 'member_id required' });
      if (!m.host_member_id) return res.json({ success: true });
      const { data: host } = await supabase.from('members').select('email, full_name').eq('id', m.host_member_id).maybeSingle();
      const { data: reqr } = await supabase.from('members').select('full_name').eq('id', memberId).maybeSingle();
      if (host && host.email) { try { await sendMeetupRequestEmail(host.email, host.full_name, reqr && reqr.full_name, m); } catch (e) { console.warn('meetup request email:', e.message); } }
      try { await notifyMember(m.host_member_id, { title: 'New meet-up request', body: ((reqr && reqr.full_name) || 'Someone') + ' wants to join ' + (m.title || 'your meet-up'), icon: 'group_add', link: '/ffp-member-dashboard.html?meetup=' + meetupId + '#panel-meetups' }); } catch (e) {}
      return res.json({ success: true });
    }
    if (kind === 'confirm') {
      if (!memberId) return res.status(400).json({ error: 'member_id required' });
      const { data: mem } = await supabase.from('members').select('email, full_name').eq('id', memberId).maybeSingle();
      if (mem && mem.email) { try { await sendMeetupConfirmEmail(mem.email, mem.full_name, m, hostName); } catch (e) { console.warn('meetup confirm email:', e.message); } }
      try { await notifyMember(memberId, { title: 'Meet-up confirmed', body: 'You are in for ' + (m.title || 'the meet-up') + (m.city ? ' in ' + m.city : ''), icon: 'event_available', link: '/ffp-member-dashboard.html?meetup=' + meetupId + '#panel-meetups' }); } catch (e) {}
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
    if (kind === 'leave') {
      // v100: an attendee cancelled their spot / withdrew a request → EMAIL the host.
      // (The in-app host notification is written transactionally by the leave_meetup RPC.)
      if (!memberId) return res.status(400).json({ error: 'member_id required' });
      if (!m.host_member_id) return res.json({ success: true });
      var wasPending = !!(req.body && req.body.pending);
      const { data: host } = await supabase.from('members').select('email, full_name').eq('id', m.host_member_id).maybeSingle();
      const { data: lvr } = await supabase.from('members').select('full_name').eq('id', memberId).maybeSingle();
      if (host && host.email) { try { await sendMeetupLeaveEmail(host.email, host.full_name, lvr && lvr.full_name, m, wasPending); } catch (e) { console.warn('meetup leave email:', e.message); } }
      return res.json({ success: true });
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
    const scope = (req.query.scope === 'professional') ? 'professional' : 'member';   // member app omits the param → member feed only
    const { data: mem } = await supabase.from('members').select('notifs_seen_at').eq('id', memberId).maybeSingle();
    const seenAt = (mem && mem.notifs_seen_at) ? new Date(mem.notifs_seen_at).getTime() : 0;
    const { data: rows, error } = await supabase
      .from('notifications')
      .select('id, icon, title, body, link, created_at, member_id, scope')
      .or('member_id.eq.' + memberId + ',member_id.is.null')
      .eq('scope', scope)
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

// v121: MILESTONES — run the idempotent detector, phone-push any NEW milestones once (pushed_at dedup,
// capped so an existing member's first run doesn't flood), and return all UNSEEN for the in-app celebration popup.
app.post('/api/milestones/check', async (req, res) => {
  try {
    const memberId = req.body && req.body.member_id;
    if (!memberId) return res.status(400).json({ error: 'member_id required' });
    await supabase.rpc('detect_member_milestones', { p_member: memberId });
    const { data: toPush } = await supabase.from('member_milestones')
      .select('id, title, body').eq('member_id', memberId).is('seen_at', null).is('pushed_at', null);
    if (toPush && toPush.length) {
      try {
        if (toPush.length > 3) {
          await sendPushToMember(memberId, { title: toPush.length + ' new milestones!', body: 'Open your Passport to see what you’ve unlocked.', url: '/ffp-member-dashboard.html', icon: '/assets/icons/ffp-icon-192.png' });
        } else {
          for (const m of toPush) { await sendPushToMember(memberId, { title: m.title || 'New milestone!', body: m.body || '', url: '/ffp-member-dashboard.html', icon: '/assets/icons/ffp-icon-192.png' }); }
        }
      } catch (e) { console.warn('[milestones push]', e.message); }
      await supabase.from('member_milestones').update({ pushed_at: new Date().toISOString() }).in('id', toPush.map(function (m) { return m.id; }));
    }
    const { data: unseen } = await supabase.from('member_milestones')
      .select('id, kind, title, body, icon, value, achieved_at').eq('member_id', memberId).is('seen_at', null)
      .order('achieved_at', { ascending: false });
    return res.json({ success: true, milestones: unseen || [] });
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

    // v119: AUDIENCE TARGETING. Resolve a segment → member_ids (membership tier / country / gender).
    // Explicit member_ids[] still win; 'all' (or no segment) stays a single broadcast row to everyone.
    let memberIds = Array.isArray(b.member_ids) ? b.member_ids.slice() : null;
    if ((!memberIds || !memberIds.length) && b.segment && b.segment.type && b.segment.type !== 'all') {
      const seg = b.segment;
      let q = supabase.from('members').select('id').eq('status', 'active');
      if (seg.type === 'membership' && seg.value) q = q.eq('membership', seg.value);
      else if (seg.type === 'country' && seg.value) q = q.eq('country', seg.value);
      else if (seg.type === 'gender' && seg.value) q = q.eq('gender', seg.value);
      else return res.status(400).json({ error: 'Unknown audience segment.' });
      const { data: segRows, error: segErr } = await q;
      if (segErr) { console.error('[broadcast segment]', segErr.message); return res.status(500).json({ error: segErr.message }); }
      memberIds = (segRows || []).map(function (r) { return r.id; });
      if (!memberIds.length) return res.status(400).json({ error: 'No members match that audience.' });
    }

    let rows;
    if (Array.isArray(memberIds) && memberIds.length) {
      rows = memberIds.map(function (mid) { return { audience: 'member', member_id: mid, title: b.title, body: b.body || null, icon: icon, link: b.link || null }; });
    } else {
      rows = [{ audience: 'all', member_id: null, title: b.title, body: b.body || null, icon: icon, link: b.link || null }];
    }
    const { error } = await supabase.from('notifications').insert(rows);
    if (error) { console.error('[broadcast]', error.message); return res.status(500).json({ error: error.message }); }
    // v83: also deliver as a PHONE push to opted-in members (rides along with the in-app bell notification).
    try {
      const pl = { title: b.title, body: b.body || '', url: b.link || '/ffp-member-dashboard.html', icon: '/assets/icons/ffp-icon-192.png' };
      if (Array.isArray(memberIds) && memberIds.length) { for (const mid of memberIds) { await sendPushToMember(mid, pl); } }
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

// ──────────────────────────────────────────────────────────────────────────────────────────
// GOOGLE PLACES (New) PROXY — venue search for Log Activity. The API key lives ONLY here
// (env GOOGLE_PLACES_KEY); the app never sees it. Place Details are cached in places_cache so
// repeat venues don't re-bill. Autocomplete is session-billed (free) when ended with a Details call.
// ──────────────────────────────────────────────────────────────────────────────────────────
const GPLACES_KEY = process.env.GOOGLE_PLACES_KEY || '';

// Type-ahead venue search → minimal predictions.
app.get('/api/places/suggest', async (req, res) => {
  try {
    if (!GPLACES_KEY) return res.status(503).json({ error: 'places_not_configured', suggestions: [] });
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ suggestions: [] });
    const body = { input: q };
    const lat = parseFloat(req.query.lat), lng = parseFloat(req.query.lng);
    if (!isNaN(lat) && !isNaN(lng)) {
      body.locationBias = { circle: { center: { latitude: lat, longitude: lng }, radius: 50000.0 } };
    }
    if (req.query.session) body.sessionToken = String(req.query.session);
    const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GPLACES_KEY,
        'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text'
      },
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: (j.error && j.error.message) || 'places_error', suggestions: [] });
    const out = ((j.suggestions) || []).map(function (s) {
      const p = s.placePrediction; if (!p) return null;
      const sf = p.structuredFormat || {};
      return {
        place_id: p.placeId,
        main: (sf.mainText && sf.mainText.text) || (p.text && p.text.text) || '',
        secondary: (sf.secondaryText && sf.secondaryText.text) || '',
        text: (p.text && p.text.text) || ''
      };
    }).filter(Boolean);
    return res.json({ suggestions: out });
  } catch (e) { return res.status(500).json({ error: e.message, suggestions: [] }); }
});

// Resolve a chosen place_id → name + exact coords. Cached to avoid re-billing.
app.get('/api/places/details', async (req, res) => {
  try {
    if (!GPLACES_KEY) return res.status(503).json({ error: 'places_not_configured' });
    const placeId = String(req.query.place_id || '').trim();
    if (!placeId) return res.status(400).json({ error: 'place_id required' });
    try {
      const { data: hit } = await supabase.from('places_cache').select('*').eq('place_id', placeId).maybeSingle();
      if (hit && hit.lat != null && hit.lng != null) {
        return res.json({ place_id: hit.place_id, name: hit.name, address: hit.address, lat: Number(hit.lat), lng: Number(hit.lng), maps_url: hit.maps_url, cached: true });
      }
    } catch (e) {}
    let url = 'https://places.googleapis.com/v1/places/' + encodeURIComponent(placeId);
    if (req.query.session) url += '?sessionToken=' + encodeURIComponent(String(req.query.session));
    const r = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': GPLACES_KEY,
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,googleMapsUri,types'
      }
    });
    const j = await r.json();
    if (!r.ok) return res.status(502).json({ error: (j.error && j.error.message) || 'places_error' });
    const loc = j.location || {};
    const out = {
      place_id: j.id || placeId,
      name: (j.displayName && j.displayName.text) || '',
      address: j.formattedAddress || '',
      lat: (loc.latitude != null) ? loc.latitude : null,
      lng: (loc.longitude != null) ? loc.longitude : null,
      maps_url: j.googleMapsUri || ''
    };
    try {
      await supabase.from('places_cache').upsert({
        place_id: out.place_id, name: out.name, address: out.address, lat: out.lat, lng: out.lng,
        maps_url: out.maps_url, types: j.types || null, updated_at: new Date().toISOString()
      }, { onConflict: 'place_id' });
    } catch (e) {}
    return res.json(out);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ──────────────────────────────────────────────────────────────────────────────────────────
// OPEN FOOD FACTS PROXY — world-class food database for the Calorie Tracker. OFF is free + keyless;
// we proxy it (CSP-safe, lets us normalize the messy nutriments + cache barcode lookups in foods_cache).
// All values normalized to a per-100g basis (serving:100, unit:'g') so the client scales by grams.
// ──────────────────────────────────────────────────────────────────────────────────────────
const OFF_BASE = 'https://world.openfoodfacts.org';
const OFF_UA = 'FFPPassport/1.0 (https://findfitpeople.com)';   // OFF asks every client to send a UA

function offNormalize(p) {
  if (!p) return null;
  const n = p.nutriments || {};
  const energy = (n['energy-kcal_100g'] != null) ? n['energy-kcal_100g'] : n['energy-kcal'];
  const kcal = Math.round(Number(energy) || 0);
  if (!kcal) return null;   // no usable energy → not worth showing
  const name = String(p.product_name || p.product_name_en || '').trim();
  if (!name) return null;
  const brand = String(p.brands || '').split(',')[0].trim();
  const num = (v) => +(Number(v) || 0).toFixed(1);
  return {
    barcode: String(p.code || p._id || ''),
    name: brand ? (name + ' (' + brand + ')') : name,
    serving: 100, unit: 'g',
    kcal: kcal,
    p: num(n.proteins_100g),
    c: num(n.carbohydrates_100g),
    f: num(n.fat_100g)
  };
}

// Live text search → normalized foods (per-100g).
app.get('/api/food/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.json({ foods: [] });
    const url = OFF_BASE + '/cgi/search.pl?search_terms=' + encodeURIComponent(q)
      + '&search_simple=1&action=process&json=1&page_size=20&sort_by=unique_scans_n'
      + '&fields=code,product_name,product_name_en,brands,nutriments';
    const r = await fetch(url, { headers: { 'User-Agent': OFF_UA } });
    if (!r.ok) return res.status(502).json({ error: 'off_error', foods: [] });
    const j = await r.json();
    const foods = ((j && j.products) || []).map(offNormalize).filter(Boolean).slice(0, 20);
    res.set('Cache-Control', 'public, max-age=86400');
    return res.json({ foods });
  } catch (e) { return res.status(500).json({ error: e.message, foods: [] }); }
});

// Barcode lookup → one normalized food. Cached in foods_cache so repeat scans are instant.
app.get('/api/food/barcode', async (req, res) => {
  try {
    const code = String(req.query.code || '').replace(/[^0-9]/g, '');
    if (!code) return res.status(400).json({ error: 'code required' });
    try {
      const { data: hit } = await supabase.from('foods_cache').select('*').eq('barcode', code).maybeSingle();
      if (hit && hit.kcal != null) {
        return res.json({ food: { barcode: hit.barcode, name: hit.name, serving: 100, unit: 'g',
          kcal: Number(hit.kcal), p: Number(hit.protein_g || 0), c: Number(hit.carbs_g || 0), f: Number(hit.fat_g || 0) }, cached: true });
      }
    } catch (e) {}
    const r = await fetch(OFF_BASE + '/api/v2/product/' + encodeURIComponent(code) + '.json?fields=code,product_name,product_name_en,brands,nutriments', { headers: { 'User-Agent': OFF_UA } });
    const j = await r.json();
    if (!j || j.status === 0 || !j.product) return res.status(404).json({ error: 'not_found' });
    const food = offNormalize(j.product);
    if (!food) return res.status(404).json({ error: 'no_nutrition' });
    try {
      await supabase.from('foods_cache').upsert({
        barcode: food.barcode || code, name: food.name, kcal: food.kcal,
        protein_g: food.p, carbs_g: food.c, fat_g: food.f, updated_at: new Date().toISOString()
      }, { onConflict: 'barcode' });
    } catch (e) {}
    return res.json({ food });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ──────────────────────────────────────────────────────────────────────────────────────────
// AI WORKOUT GENERATOR — prompt (text/voice) → a structured, guided workout plan via Claude.
// Key lives ONLY here (env ANTHROPIC_API_KEY). Model overridable via env WORKOUT_MODEL.
// Output is normalized to a strict shape the app's guided runner can drive directly.
// ──────────────────────────────────────────────────────────────────────────────────────────
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const WORKOUT_MODEL = process.env.WORKOUT_MODEL || 'claude-haiku-4-5-20251001';

function parseWorkoutJSON(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) {}
  var m = String(text).replace(/```json/gi, '').replace(/```/g, '');
  var s = m.indexOf('{'), e2 = m.lastIndexOf('}');
  if (s >= 0 && e2 > s) { try { return JSON.parse(m.slice(s, e2 + 1)); } catch (e) {} }
  return null;
}
function normalizeWorkout(plan) {
  if (!plan || typeof plan !== 'object') return null;
  var arr = function (x) { return Array.isArray(x) ? x : []; };
  var num = function (x, d) { var n = Number(x); return isFinite(n) ? n : d; };
  var str = function (x) { return (x == null) ? '' : String(x).trim(); };
  return {
    title: str(plan.title) || 'Workout',
    focus: str(plan.focus),
    duration_min: num(plan.duration_min, 0),
    warmup: arr(plan.warmup).map(function (w) { return { name: str(w.name), duration_sec: num(w.duration_sec, 30), note: str(w.note) }; }).filter(function (w) { return w.name; }),
    exercises: arr(plan.exercises).map(function (e) { return { name: str(e.name), sets: Math.max(1, Math.round(num(e.sets, 3))), reps: str(e.reps) || '10', rest_sec: num(e.rest_sec, 75), weight: str(e.weight), note: str(e.note) }; }).filter(function (e) { return e.name; }),
    cooldown: arr(plan.cooldown).map(function (c) { return { name: str(c.name), duration_sec: num(c.duration_sec, 30), note: str(c.note) }; }).filter(function (c) { return c.name; })
  };
}

app.post('/api/workout/generate', async (req, res) => {
  try {
    if (!ANTHROPIC_KEY) return res.status(503).json({ error: 'ai_not_configured' });
    const prompt = String((req.body && req.body.prompt) || '').trim();
    if (prompt.length < 3) return res.status(400).json({ error: 'prompt required' });
    const sys =
      'You are an expert strength & conditioning coach creating ONE workout session for a fitness app. ' +
      'Return ONLY valid minified JSON (no markdown, no prose) with this exact shape: ' +
      '{"title":string,"focus":string,"duration_min":number,' +
      '"warmup":[{"name":string,"duration_sec":number,"note":string}],' +
      '"exercises":[{"name":string,"sets":number,"reps":string,"rest_sec":number,"weight":string,"note":string}],' +
      '"cooldown":[{"name":string,"duration_sec":number,"note":string}]}. ' +
      'Rules: 3-7 main exercises; ALWAYS include 2-4 warm-up mobility/activation moves and 2-4 cool-down stretches/mobility; ' +
      'reps may be a range like "8-12" or a hold like "30s"; weight is a short suggestion like "bodyweight","moderate","15-20kg"; ' +
      'rest_sec between 30 and 150; respect any stated equipment, level, time or injury limits; keep it safe; ' +
      'note is a short coaching cue of 8 words or fewer. Output JSON only.';
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(25000),
      body: JSON.stringify({ model: WORKOUT_MODEL, max_tokens: 1600, system: sys, messages: [{ role: 'user', content: prompt }] })
    });
    const j = await r.json();
    if (!r.ok) { console.error('[workout] anthropic:', j && j.error); return res.status(502).json({ error: 'ai_error', detail: (j && j.error && j.error.message) || '' }); }
    var text = '';
    try { text = (j.content || []).map(function (b) { return b.text || ''; }).join('').trim(); } catch (e) {}
    var plan = normalizeWorkout(parseWorkoutJSON(text));
    if (!plan || !plan.exercises.length) return res.status(502).json({ error: 'ai_bad_output' });
    return res.json({ plan });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// NUTRITION PLAN — free-text goal → a structured one-day meal plan (Calorie Tracker › Meal Planner / "Ask Coach").
function normalizeNutrition(plan) {
  if (!plan || typeof plan !== 'object') return null;
  var arr = function (x) { return Array.isArray(x) ? x : []; };
  var num = function (x, d) { var n = Number(x); return isFinite(n) ? n : d; };
  var str = function (x) { return (x == null) ? '' : String(x).trim(); };
  var meals = arr(plan.meals).map(function (m) {
    return { meal: str(m.meal) || 'Meal', kcal: num(m.kcal, 0), items: arr(m.items).map(str).filter(Boolean) };
  }).filter(function (m) { return m.items.length; });
  return {
    title: str(plan.title) || 'Your nutrition plan',
    summary: str(plan.summary),
    daily_kcal: num(plan.daily_kcal, 0),
    protein_g: num(plan.protein_g, 0),
    carbs_g: num(plan.carbs_g, 0),
    fat_g: num(plan.fat_g, 0),
    meals: meals,
    tips: arr(plan.tips).map(str).filter(Boolean).slice(0, 6)
  };
}

app.post('/api/nutrition/plan', async (req, res) => {
  try {
    if (!ANTHROPIC_KEY) return res.status(503).json({ error: 'ai_not_configured' });
    const prompt = String((req.body && req.body.prompt) || '').trim();
    if (prompt.length < 3) return res.status(400).json({ error: 'prompt required' });
    const sys =
      'You are an expert sports-nutrition coach creating ONE day of meals for a fitness app. ' +
      'Return ONLY valid minified JSON (no markdown, no prose) with this exact shape: ' +
      '{"title":string,"summary":string,"daily_kcal":number,"protein_g":number,"carbs_g":number,"fat_g":number,' +
      '"meals":[{"meal":string,"kcal":number,"items":[string]}],"tips":[string]}. ' +
      'Rules: 3-5 meals (e.g. Breakfast, Lunch, Dinner, Snacks) whose kcal sum is close to daily_kcal; ' +
      'each item is a short food + portion like "150g grilled chicken" or "1 cup oats with berries"; ' +
      'macros must be realistic and roughly consistent with the calories; respect any stated goal, calorie ' +
      'target, diet, allergy, dislike or training pattern; summary is one or two sentences; 2-4 short practical ' +
      'tips of 12 words or fewer. Output JSON only.';
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(25000),
      body: JSON.stringify({ model: WORKOUT_MODEL, max_tokens: 1600, system: sys, messages: [{ role: 'user', content: prompt }] })
    });
    const j = await r.json();
    if (!r.ok) { console.error('[nutrition] anthropic:', j && j.error); return res.status(502).json({ error: 'ai_error', detail: (j && j.error && j.error.message) || '' }); }
    var text = '';
    try { text = (j.content || []).map(function (b) { return b.text || ''; }).join('').trim(); } catch (e) {}
    var plan = normalizeNutrition(parseWorkoutJSON(text));
    if (!plan || !plan.meals.length) return res.status(502).json({ error: 'ai_bad_output' });
    return res.json({ plan });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// PRO WORKOUT DRAFT — coach asks the AI Coach for a workout; returns an editable structure (exercises + target sets).
// The coach edits it, then logs it live or assigns it (saved via the pro_workout_* RPCs).
app.post('/api/pro/workout/draft', async (req, res) => {
  try {
    if (!ANTHROPIC_KEY) return res.status(503).json({ error: 'ai_not_configured' });
    const prompt = String((req.body && req.body.prompt) || '').trim();
    if (prompt.length < 3) return res.status(400).json({ error: 'prompt required' });
    const sys =
      'You are an expert strength & conditioning coach building ONE workout for a client in a coaching app. ' +
      'Return ONLY valid minified JSON (no markdown, no prose) with this exact shape: ' +
      '{"title":string,"notes":string,"exercises":[{"name":string,"sets":[{"reps":number,"weight":number,"effort":string}],"note":string}]}. ' +
      'Rules: 4-8 exercises; each exercise has 2-5 sets; reps are target reps per set; weight is a suggested working weight in kg ' +
      '(use 0 for bodyweight or when not applicable); effort is one of "easy","moderate","hard","max"; note is a short cue (<= 10 words, may be empty); ' +
      'title is short (e.g. "Upper Body Strength"); notes is one short coaching line. Respect any stated goal, level, equipment, injury, body part or session length. Output JSON only.';
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(25000),
      body: JSON.stringify({ model: WORKOUT_MODEL, max_tokens: 1800, system: sys, messages: [{ role: 'user', content: prompt }] })
    });
    const j = await r.json();
    if (!r.ok) { console.error('[pro draft] anthropic:', j && j.error); return res.status(502).json({ error: 'ai_error', detail: (j && j.error && j.error.message) || '' }); }
    var text = ''; try { text = (j.content || []).map(function (b) { return b.text || ''; }).join('').trim(); } catch (e) {}
    var draft = parseWorkoutJSON(text);
    if (!draft || !Array.isArray(draft.exercises) || !draft.exercises.length) return res.status(502).json({ error: 'ai_bad_output' });
    // Normalise: ensure each exercise has a sets array of {reps,weight,effort}.
    draft.exercises = draft.exercises.slice(0, 12).map(function (ex) {
      var sets = Array.isArray(ex.sets) ? ex.sets : [];
      if (!sets.length) { var n = Math.max(1, Math.min(6, Number(ex.sets) || 3)); for (var i = 0; i < n; i++) sets.push({ reps: Number(ex.reps) || 10, weight: Number(ex.weight) || 0, effort: ex.effort || 'moderate' }); }
      sets = sets.slice(0, 8).map(function (s) { return { reps: Number(s.reps) || 0, weight: Number(s.weight) || 0, effort: String(s.effort || 'moderate') }; });
      return { name: String(ex.name || 'Exercise').slice(0, 80), sets: sets, note: String(ex.note || '').slice(0, 120) };
    });
    return res.json({ ok: true, title: String(draft.title || 'Workout').slice(0, 80), notes: String(draft.notes || '').slice(0, 200), exercises: draft.exercises });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// WEARABLES — direct device integrations. WHOOP is live (OAuth 2.0 + webhooks);
// Garmin is scaffolded (returns not_configured until GARMIN_* keys exist). New
// workouts flow into activity_logs (source='whoop', external_id=workout uuid) with
// dedup. Tokens live in member_wearables (RLS-locked: service-role only).
// ════════════════════════════════════════════════════════════════════════════
const WHOOP_AUTH  = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN = 'https://api.prod.whoop.com/oauth/oauth2/token';
const WHOOP_API   = 'https://api.prod.whoop.com/developer';
const WHOOP_REDIRECT = process.env.WHOOP_REDIRECT_URI || 'https://ffp-passport-backend.vercel.app/api/wearables/whoop/callback';
// Workouts → activity log; sleep/recovery/cycle → member_wearable_daily. These scopes MUST also be ticked on the
// WHOOP app, and existing users must RE-CONNECT to grant the new ones. (read:cycles is plural; read:cycles=strain.)
const WHOOP_SCOPES = 'offline read:profile read:workout read:sleep read:recovery read:cycles';
const WEARABLE_MEMBER_APP = process.env.MEMBER_APP_URL || 'https://ffppassport.com/ffp-member-dashboard.html';

function mintWearableState(memberId, provider) {
  const payload = `w.${memberId}.${provider}.${Date.now() + 10 * 60 * 1000}`;
  const sig = crypto.createHmac('sha256', VERIFY_SECRET).update(payload).digest('hex');
  return b64url(payload) + '.' + sig;
}
function verifyWearableState(state) {
  try {
    const parts = String(state).split('.');
    if (parts.length !== 2) return null;
    const payload = Buffer.from(parts[0].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const expect = crypto.createHmac('sha256', VERIFY_SECRET).update(payload).digest('hex');
    const a = Buffer.from(parts[1]); const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const bits = payload.split('.');   // ['w', memberId, provider, expMs]
    if (bits[0] !== 'w' || Date.now() > Number(bits[3])) return null;
    return { memberId: bits[1], provider: bits[2] };
  } catch (e) { return null; }
}
function titleCaseSport(s) { return String(s || 'Activity').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

async function whoopTokenRequest(params) {
  const r = await fetch(WHOOP_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.access_token) throw new Error('whoop_token_failed');
  return j;
}
async function getValidWhoopAccess(row, force) {
  const exp = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (!force && row.access_token && exp - 60000 > Date.now()) return row.access_token;
  const j = await whoopTokenRequest({ grant_type: 'refresh_token', refresh_token: row.refresh_token, client_id: process.env.WHOOP_CLIENT_ID, client_secret: process.env.WHOOP_CLIENT_SECRET, scope: 'offline' });
  const newExp = new Date(Date.now() + (Number(j.expires_in) || 3600) * 1000).toISOString();
  await supabase.from('member_wearables').update({
    access_token: j.access_token, refresh_token: j.refresh_token || row.refresh_token,
    token_expires_at: newExp, updated_at: new Date().toISOString()
  }).eq('id', row.id);
  // keep the in-memory row current so a forced re-fetch in the same request uses the fresh token
  row.access_token = j.access_token; row.refresh_token = j.refresh_token || row.refresh_token; row.token_expires_at = newExp;
  return j.access_token;
}
async function whoopUpsertActivity(row, workout) {
  if (!workout || !workout.id) return;
  const start = workout.start ? new Date(workout.start) : null;
  const end = workout.end ? new Date(workout.end) : null;
  const sc = workout.score || {};
  const durMs = (start && end) ? Math.max(0, end - start) : 0;
  const totalSec = Math.round(durMs / 1000);
  const fields = {
    member_id: row.member_id,
    activity: titleCaseSport(workout.sport_name),
    duration_min: Math.floor(totalSec / 60) || null,
    duration_sec: totalSec % 60,   // 0-59 seconds component only (activity_logs_duration_sec_check)
    distance_km: (sc.distance_meter != null) ? Math.round(sc.distance_meter / 10) / 100 : null,
    calories: (sc.kilojoule != null) ? Math.round(sc.kilojoule / 4.184) : null,
    avg_heart_rate: (sc.average_heart_rate != null) ? Math.round(sc.average_heart_rate) : null,
    logged_at: start ? start.toISOString() : new Date().toISOString(),
    source: 'whoop', external_id: String(workout.id), verified: false, shared: false,
    metrics: {
      provider: 'whoop',
      max_hr: (sc.max_heart_rate != null) ? Math.round(sc.max_heart_rate) : null,
      strain: (sc.strain != null) ? Math.round(sc.strain * 10) / 10 : null,
      hr_zones_ms: sc.zone_durations || null,
      sport_id: (workout.sport_id != null) ? workout.sport_id : null
    }
  };
  const { data: ex } = await supabase.from('activity_logs').select('id')
    .eq('member_id', row.member_id).eq('source', 'whoop').eq('external_id', String(workout.id)).maybeSingle();
  let wres;
  if (ex && ex.id) wres = await supabase.from('activity_logs').update(fields).eq('id', ex.id);
  else wres = await supabase.from('activity_logs').insert(fields);
  if (wres && wres.error) throw new Error('activity_logs ' + (ex ? 'update' : 'insert') + ': ' + wres.error.message);
  await supabase.from('member_wearables').update({ last_synced_at: new Date().toISOString() }).eq('id', row.id);
}

// ── Daily metrics (sleep / recovery / strain) → member_wearable_daily, merged per day ──
function whoopDayKey(iso) { try { return new Date(iso).toISOString().slice(0, 10); } catch (e) { return null; } }
async function whoopUpsertDaily(memberId, day, patch) {
  if (!day) return;
  const { data: ex } = await supabase.from('member_wearable_daily').select('id').eq('member_id', memberId).eq('provider', 'whoop').eq('day', day).maybeSingle();
  patch.updated_at = new Date().toISOString();
  let r;
  if (ex && ex.id) r = await supabase.from('member_wearable_daily').update(patch).eq('id', ex.id);
  else { patch.member_id = memberId; patch.provider = 'whoop'; patch.day = day; r = await supabase.from('member_wearable_daily').insert(patch); }
  if (r && r.error) throw new Error('member_wearable_daily: ' + r.error.message);
}
async function whoopUpsertSleep(row, sleep) {
  if (!sleep || sleep.nap || !sleep.score) return;
  const ss = sleep.score.stage_summary || {};
  const asleepMs = Math.max(0, (ss.total_in_bed_time_milli || 0) - (ss.total_awake_time_milli || 0));
  await whoopUpsertDaily(row.member_id, whoopDayKey(sleep.end || sleep.start), {
    sleep_hours: Math.round(asleepMs / 3600000 * 100) / 100,
    sleep_efficiency: (sleep.score.sleep_efficiency_percentage != null) ? Math.round(sleep.score.sleep_efficiency_percentage) : null,
    sleep_performance: (sleep.score.sleep_performance_percentage != null) ? Math.round(sleep.score.sleep_performance_percentage) : null
  });
}
async function whoopUpsertRecovery(row, rec) {
  if (!rec || !rec.score) return;
  await whoopUpsertDaily(row.member_id, whoopDayKey(rec.created_at), {
    recovery_pct: (rec.score.recovery_score != null) ? Math.round(rec.score.recovery_score) : null,
    resting_hr: (rec.score.resting_heart_rate != null) ? Math.round(rec.score.resting_heart_rate) : null,
    hrv_ms: (rec.score.hrv_rmssd_milli != null) ? Math.round(rec.score.hrv_rmssd_milli * 10) / 10 : null
  });
}
async function whoopUpsertCycle(row, cyc) {
  if (!cyc || !cyc.score) return;
  await whoopUpsertDaily(row.member_id, whoopDayKey(cyc.start), {
    strain: (cyc.score.strain != null) ? Math.round(cyc.score.strain * 10) / 10 : null
  });
}
async function whoopGetJson(path, access) {
  try { const r = await fetch(WHOOP_API + path, { headers: { Authorization: 'Bearer ' + access } }); if (!r.ok) return null; return await r.json().catch(() => null); } catch (e) { return null; }
}

async function handleWhoopWebhook(req, res) {
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
    const sig = req.headers['x-whoop-signature'];
    const ts = req.headers['x-whoop-signature-timestamp'];
    const secret = process.env.WHOOP_CLIENT_SECRET || '';
    if (!sig || !ts || !secret) return res.status(401).send('unauthorized');
    const expect = crypto.createHmac('sha256', secret).update(String(ts) + raw.toString('utf8')).digest('base64');
    const a = Buffer.from(String(sig)); const b = Buffer.from(expect);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).send('bad_signature');
    let evt = null; try { evt = JSON.parse(raw.toString('utf8')); } catch (e) {}
    if (!evt || !evt.type) return res.status(200).send('ok');
    if (evt.type !== 'workout.updated' && evt.type !== 'workout.deleted' && evt.type !== 'sleep.updated') return res.status(200).send('ignored');
    const { data: row } = await supabase.from('member_wearables').select('*')
      .eq('provider', 'whoop').eq('external_user_id', String(evt.user_id)).maybeSingle();
    if (!row) return res.status(200).send('no_user');
    if (evt.type === 'workout.deleted') {
      await supabase.from('activity_logs').delete().eq('member_id', row.member_id).eq('source', 'whoop').eq('external_id', String(evt.id));
      return res.status(200).send('deleted');
    }
    const access = await getValidWhoopAccess(row);
    if (evt.type === 'sleep.updated') {
      const sr = await fetch(WHOOP_API + '/v2/activity/sleep/' + encodeURIComponent(evt.id), { headers: { Authorization: 'Bearer ' + access } });
      if (!sr.ok) return res.status(200).send('sleep_fetch_failed');
      const sleep = await sr.json();
      if (sleep && sleep.score_state === 'SCORED' && !sleep.nap) await whoopUpsertSleep(row, sleep);
      return res.status(200).send('ok');
    }
    const wr = await fetch(WHOOP_API + '/v2/activity/workout/' + encodeURIComponent(evt.id), { headers: { Authorization: 'Bearer ' + access } });
    if (!wr.ok) return res.status(200).send('fetch_failed');
    const workout = await wr.json();
    if (workout && workout.score_state && workout.score_state !== 'SCORED') return res.status(200).send('pending');
    await whoopUpsertActivity(row, workout);
    return res.status(200).send('ok');
  } catch (e) { console.error('[whoop webhook]', e); return res.status(200).send('error'); }
}

// Start a connection — member app posts {refresh, provider}. Returns the provider's authorize URL.
app.post('/api/wearables/connect', async (req, res) => {
  try {
    const v = verifyRefreshToken((req.body && req.body.refresh) || '');
    if (!v) return res.status(401).json({ error: 'auth' });
    const provider = String((req.body && req.body.provider) || '').toLowerCase();
    if (provider === 'whoop') {
      if (!process.env.WHOOP_CLIENT_ID) return res.status(503).json({ error: 'whoop_not_configured' });
      // WHOOP mangles long state params → use a SHORT random hex state, stored server-side (state→member map).
      const state = crypto.randomBytes(16).toString('hex');
      await supabase.from('wearable_oauth_states').insert({ state: state, member_id: v.memberId, provider: 'whoop' });
      const url = WHOOP_AUTH + '?response_type=code'
        + '&client_id=' + encodeURIComponent(process.env.WHOOP_CLIENT_ID)
        + '&redirect_uri=' + encodeURIComponent(WHOOP_REDIRECT)
        + '&scope=' + encodeURIComponent(WHOOP_SCOPES)
        + '&state=' + encodeURIComponent(state);
      return res.json({ url });
    }
    if (provider === 'garmin') return res.status(503).json({ error: 'garmin_not_configured' });
    return res.status(400).json({ error: 'unknown_provider' });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// OAuth callback (WHOOP) → exchange code, fetch the WHOOP user, store tokens, bounce back to the app.
app.get('/api/wearables/whoop/callback', async (req, res) => {
  const fail = (msg) => res.redirect(WEARABLE_MEMBER_APP + '?wearable=whoop_error&reason=' + encodeURIComponent(msg || 'error'));
  try {
    if (req.query.error) return fail(String(req.query.error));
    const stateParam = String(req.query.state || '');
    if (!stateParam) return fail('state');
    const { data: st } = await supabase.from('wearable_oauth_states').select('member_id, provider, created_at').eq('state', stateParam).maybeSingle();
    await supabase.from('wearable_oauth_states').delete().eq('state', stateParam);   // single-use
    if (!st || st.provider !== 'whoop') return fail('state');
    if (Date.now() - new Date(st.created_at).getTime() > 10 * 60 * 1000) return fail('state_expired');
    const code = String(req.query.code || '');
    if (!code) return fail('no_code');
    const tok = await whoopTokenRequest({ grant_type: 'authorization_code', code, redirect_uri: WHOOP_REDIRECT, client_id: process.env.WHOOP_CLIENT_ID, client_secret: process.env.WHOOP_CLIENT_SECRET });
    const pr = await fetch(WHOOP_API + '/v2/user/profile/basic', { headers: { Authorization: 'Bearer ' + tok.access_token } });
    const prof = await pr.json().catch(() => null);
    const whoopUserId = prof && (prof.user_id != null ? String(prof.user_id) : null);
    if (!whoopUserId) return fail('profile');
    await supabase.from('member_wearables').upsert({
      member_id: st.member_id, provider: 'whoop', external_user_id: whoopUserId,
      access_token: tok.access_token, refresh_token: tok.refresh_token || null,
      token_expires_at: new Date(Date.now() + (Number(tok.expires_in) || 3600) * 1000).toISOString(),
      scope: tok.scope || WHOOP_SCOPES, status: 'connected', updated_at: new Date().toISOString()
    }, { onConflict: 'member_id,provider' });
    return res.redirect(WEARABLE_MEMBER_APP + '?wearable=whoop_connected');
  } catch (e) { console.error('[whoop callback]', e); return fail('exchange'); }
});

// Disconnect — member app posts {refresh, provider}.
app.post('/api/wearables/disconnect', async (req, res) => {
  try {
    const v = verifyRefreshToken((req.body && req.body.refresh) || '');
    if (!v) return res.status(401).json({ error: 'auth' });
    const provider = String((req.body && req.body.provider) || '').toLowerCase();
    await supabase.from('member_wearables').delete().eq('member_id', v.memberId).eq('provider', provider);
    return res.json({ ok: true });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Status — member app posts {refresh}. Returns connected providers (no tokens).
app.post('/api/wearables/status', async (req, res) => {
  try {
    const v = verifyRefreshToken((req.body && req.body.refresh) || '');
    if (!v) return res.status(401).json({ error: 'auth' });
    const { data } = await supabase.from('member_wearables').select('provider, status, last_synced_at').eq('member_id', v.memberId);
    return res.json({ providers: data || [] });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Sync now — PULL recent workouts directly from WHOOP (reconciliation / initial backfill, not just webhooks).
// member app posts {refresh}. Fetches the latest workouts with the stored token → upserts into activity_logs.
app.post('/api/wearables/whoop/sync', async (req, res) => {
  try {
    const v = verifyRefreshToken((req.body && req.body.refresh) || '');
    if (!v) return res.status(401).json({ error: 'auth' });
    const { data: row } = await supabase.from('member_wearables').select('*').eq('member_id', v.memberId).eq('provider', 'whoop').maybeSingle();
    if (!row) return res.status(400).json({ error: 'not_connected' });
    let synced = 0, daily = 0, firstErr = null;
    const note = (e) => { if (!firstErr) firstErr = (e && e.message) || String(e); };
    // Get a token; if the refresh itself is dead, the connection needs re-linking (not a generic failure).
    let access;
    try { access = await getValidWhoopAccess(row, false); }
    catch (e) { try { await supabase.from('wearable_debug').insert({ context: 'whoop_sync', detail: 'token: ' + ((e && e.message) || e) }); } catch (_) {}
      return res.json({ ok: false, reconnect: true, error: 'whoop_auth_expired' }); }
    // Pull helper — on a 401 force-refresh the token once and retry; record the HTTP status on any non-OK so failures are visible.
    const pull = async (path) => {
      try {
        let r = await fetch(WHOOP_API + path, { headers: { Authorization: 'Bearer ' + access } });
        if (r.status === 401) { try { access = await getValidWhoopAccess(row, true); } catch (e) { note('reauth: ' + ((e && e.message) || e)); return null; } r = await fetch(WHOOP_API + path, { headers: { Authorization: 'Bearer ' + access } }); }
        if (!r.ok) { note('GET ' + path + ' → ' + r.status); return null; }
        return await r.json().catch(() => null);
      } catch (e) { note('GET ' + path + ': ' + ((e && e.message) || e)); return null; }
    };
    // Workouts → activity_logs
    const jw = await pull('/v2/activity/workout?limit=25');
    for (const w of (jw && Array.isArray(jw.records) ? jw.records : [])) {
      if (w && w.score_state && w.score_state !== 'SCORED') continue;
      try { await whoopUpsertActivity(row, w); synced++; } catch (e) { note(e); }
    }
    // Sleep / Recovery / Strain → member_wearable_daily
    const js = await pull('/v2/activity/sleep?limit=25');
    for (const s of (js && Array.isArray(js.records) ? js.records : [])) {
      if (s && s.score_state === 'SCORED' && !s.nap) { try { await whoopUpsertSleep(row, s); daily++; } catch (e) { note(e); } }
    }
    const jr = await pull('/v2/recovery?limit=25');
    for (const rec of (jr && Array.isArray(jr.records) ? jr.records : [])) {
      if (rec && rec.score_state === 'SCORED') { try { await whoopUpsertRecovery(row, rec); daily++; } catch (e) { note(e); } }
    }
    const jc = await pull('/v2/cycle?limit=25');
    for (const c of (jc && Array.isArray(jc.records) ? jc.records : [])) {
      if (c && c.score_state === 'SCORED') { try { await whoopUpsertCycle(row, c); } catch (e) { note(e); } }
    }
    await supabase.from('member_wearables').update({ last_synced_at: new Date().toISOString() }).eq('id', row.id);
    if (firstErr) { try { await supabase.from('wearable_debug').insert({ context: 'whoop_sync', detail: firstErr }); } catch (e) {} }
    return res.json({ ok: true, synced: synced, daily: daily, error: firstErr });
  } catch (e) { console.error('[whoop sync]', e); return res.status(500).json({ error: e.message }); }
});

// Daily metrics (sleep / recovery / strain) for display. member app posts {refresh}. Returns the last 30 days.
app.post('/api/wearables/daily', async (req, res) => {
  try {
    const v = verifyRefreshToken((req.body && req.body.refresh) || '');
    if (!v) return res.status(401).json({ error: 'auth' });
    const { data } = await supabase.from('member_wearable_daily')
      .select('day, provider, sleep_hours, sleep_efficiency, sleep_performance, recovery_pct, resting_hr, hrv_ms, strain')
      .eq('member_id', v.memberId).order('day', { ascending: false }).limit(30);
    return res.json({ days: data || [] });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// AI PARSE — natural language → structured food items or an activity (Calorie Tracker + Log Activity voice/text).
app.post('/api/ai/parse', async (req, res) => {
  try {
    if (!ANTHROPIC_KEY) return res.status(503).json({ error: 'ai_not_configured' });
    const kind = String((req.body && req.body.kind) || '').trim();
    const text = String((req.body && req.body.text) || '').trim();
    if (text.length < 2) return res.status(400).json({ error: 'text required' });
    let sys;
    if (kind === 'food') {
      sys = 'You convert a typed/spoken description of food eaten into structured nutrition data. ' +
        'Return ONLY valid minified JSON: {"items":[{"name":string,"qty":string,"meal":string,"kcal":number,"protein_g":number,"carbs_g":number,"fat_g":number}]}. ' +
        'Split a meal into its component foods (e.g. "two eggs and toast" -> 2 items). Estimate realistic macros for the stated portion. ' +
        'qty is a short human label like "2 eggs" or "1 cup". ' +
        'meal is which meal each item belongs to, based ONLY on what the user says — one of "breakfast","lunch","dinner","snacks". ' +
        'If the user names a meal for some foods (e.g. "eggs for breakfast and a salad for lunch"), assign each item to the meal they named; items in different meals get different values. ' +
        'If the user does NOT say which meal, set meal to "". Do NOT guess from the time of day. Output JSON only.';
    } else if (kind === 'activity') {
      sys = 'You convert a typed/spoken description of a workout or activity into structured data. ' +
        'Return ONLY valid minified JSON: {"activity":string,"duration_min":number,"distance_km":number,"calories":number,"avg_heart_rate":number,"date":string,"time":string,"location":string,"notes":string}. ' +
        'activity is a short title like "Running" or "Yoga". Estimate duration_min and realistic calories burned; distance_km 0 if none. ' +
        'avg_heart_rate is bpm if mentioned (e.g. "avg HR 121") else 0. ' +
        'Resolve relative dates/times (e.g. "this morning", "yesterday at 6am") against the current local datetime given in the user message: ' +
        'date as "YYYY-MM-DD" and time as 24-hour "HH:MM"; use "" if not stated. ' +
        'location is the place/venue name if mentioned (e.g. "Kite Beach") else "". notes is a short remark. Output JSON only.';
    } else if (kind === 'meetup_search') {
      sys = 'You convert a member\'s natural-language request for a fitness MEETUP into a structured search intent. ' +
        'Return ONLY valid minified JSON: {"sport":string,"category":string,"fitness_level":string,"city":string,"country":string,"date_from":string,"date_to":string,"gender":string,"keywords":[string],"sort":string}. ' +
        'category MUST be one of: racquet,running,cycling,swimming,team,combat,fitness,mind-body,adventure (best fit, else ""). ' +
        'fitness_level one of: Not Tried,Social,Competitive,Representative,Professional (else ""). gender one of: any,women,men. ' +
        'Resolve relative dates (e.g. "this weekend","tonight","next week") against the current local datetime given in the user message: ' +
        'date_from and date_to as "YYYY-MM-DD" (else ""). keywords = up to 4 salient words not already captured. ' +
        'sort one of: best,soonest,nearest (default "best"). Use ""/[] for anything not stated. Output JSON only.';
    } else if (kind === 'meetup_compose') {
      sys = 'You convert a member\'s description of a fitness MEETUP they want to host into a structured draft for a form. ' +
        'Return ONLY valid minified JSON: {"title":string,"sport":string,"category":string,"fitness_level":string,"city":string,"country":string,"venue":string,"date":string,"time":string,"max_people":number,"gender":string,"age_from":number,"age_to":number,"description":string}. ' +
        'category one of: racquet,running,cycling,swimming,team,combat,fitness,mind-body,adventure. ' +
        'fitness_level one of: Not Tried,Social,Competitive,Representative,Professional (else ""). gender one of: any,male,female. ' +
        'title short (<=40 chars). max_people 2-8 (default 8). Resolve date/time against the current local datetime given in the user message: ' +
        'date "YYYY-MM-DD", time 24-hour "HH:MM" (default "18:00" if a day is given but no time; "" if no day). ' +
        'venue = place name if stated else "". description = a short friendly blurb (<=160 chars). Use ""/0 for anything not stated. Output JSON only.';
    } else { return res.status(400).json({ error: 'bad kind' }); }
    const now = String((req.body && req.body.now) || '').trim();
    const userContent = text + (now ? ('\n\nCurrent local datetime: ' + now) : '');
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(25000),
      body: JSON.stringify({ model: WORKOUT_MODEL, max_tokens: 1000, system: sys, messages: [{ role: 'user', content: userContent }] })
    });
    const j = await r.json();
    if (!r.ok) { console.error('[ai/parse] anthropic:', j && j.error); return res.status(502).json({ error: 'ai_error', detail: (j && j.error && j.error.message) || '' }); }
    var out = '';
    try { out = (j.content || []).map(function (b) { return b.text || ''; }).join('').trim(); } catch (e) {}
    var parsed = parseWorkoutJSON(out);
    if (!parsed) return res.status(502).json({ error: 'ai_bad_output' });
    if (kind === 'food') {
      var MEAL_OK = { breakfast: 1, lunch: 1, dinner: 1, snacks: 1 };
      var items = (Array.isArray(parsed.items) ? parsed.items : []).map(function (it) {
        var meal = String(it.meal || '').trim().toLowerCase();
        return { name: String(it.name || '').trim(), qty: String(it.qty || '').trim(),
          meal: MEAL_OK[meal] ? meal : '',
          kcal: Math.max(0, Math.round(Number(it.kcal) || 0)),
          protein_g: +(Number(it.protein_g) || 0).toFixed(1), carbs_g: +(Number(it.carbs_g) || 0).toFixed(1), fat_g: +(Number(it.fat_g) || 0).toFixed(1) };
      }).filter(function (it) { return it.name && it.kcal; });
      if (!items.length) return res.status(502).json({ error: 'ai_bad_output' });
      return res.json({ items: items });
    } else if (kind === 'activity') {
      var dk = Number(parsed.distance_km);
      var hr = Number(parsed.avg_heart_rate);
      var d = String(parsed.date || '').trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) d = '';
      var tm = String(parsed.time || '').trim(); if (!/^\d{2}:\d{2}$/.test(tm)) tm = '';
      return res.json({ activity: {
        activity: String(parsed.activity || '').trim() || 'Activity',
        duration_min: Math.max(0, Math.round(Number(parsed.duration_min) || 0)),
        distance_km: (isNaN(dk) || dk <= 0) ? null : +dk.toFixed(2),
        calories: Math.max(0, Math.round(Number(parsed.calories) || 0)),
        avg_heart_rate: (isNaN(hr) || hr <= 0) ? null : Math.round(hr),
        date: d, time: tm, location: String(parsed.location || '').trim(),
        notes: String(parsed.notes || '').trim()
      } });
    } else if (kind === 'meetup_search') {
      var MS_CATS = ['racquet','running','cycling','swimming','team','combat','fitness','mind-body','adventure'];
      var MS_LV = ['Not Tried','Social','Competitive','Representative','Professional'];
      var msPick = function (v, allow) { v = String(v || '').trim(); for (var i = 0; i < allow.length; i++) { if (allow[i].toLowerCase() === v.toLowerCase()) return allow[i]; } return ''; };
      var msDate = function (v) { v = String(v || '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; };
      var I = parsed || {};
      return res.json({ intent: {
        sport: String(I.sport || '').trim(),
        category: msPick(I.category, MS_CATS).toLowerCase(),
        fitness_level: msPick(I.fitness_level, MS_LV),
        city: String(I.city || '').trim(),
        country: String(I.country || '').trim(),
        date_from: msDate(I.date_from), date_to: msDate(I.date_to),
        gender: msPick(I.gender, ['any', 'women', 'men']),
        keywords: (Array.isArray(I.keywords) ? I.keywords : []).slice(0, 4).map(function (x) { return String(x || '').trim(); }).filter(Boolean),
        sort: msPick(I.sort, ['best', 'soonest', 'nearest']) || 'best'
      } });
    } else if (kind === 'meetup_compose') {
      var MC_CATS = ['racquet','running','cycling','swimming','team','combat','fitness','mind-body','adventure'];
      var MC_LV = ['Not Tried','Social','Competitive','Representative','Professional'];
      var mcPick = function (v, allow) { v = String(v || '').trim(); for (var i = 0; i < allow.length; i++) { if (allow[i].toLowerCase() === v.toLowerCase()) return allow[i]; } return ''; };
      var D = parsed || {};
      var dd = String(D.date || '').trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(dd)) dd = '';
      var tt = String(D.time || '').trim(); if (!/^\d{2}:\d{2}$/.test(tt)) tt = dd ? '18:00' : '';
      var af = Math.round(Number(D.age_from) || 0), at = Math.round(Number(D.age_to) || 0);
      return res.json({ draft: {
        title: String(D.title || '').trim().slice(0, 40),
        sport: String(D.sport || '').trim(),
        category: mcPick(D.category, MC_CATS).toLowerCase(),
        fitness_level: mcPick(D.fitness_level, MC_LV),
        city: String(D.city || '').trim(), country: String(D.country || '').trim(),
        venue: String(D.venue || '').trim(),
        date: dd, time: tt,
        max_people: Math.max(2, Math.min(8, Math.round(Number(D.max_people) || 8))),
        gender: mcPick(D.gender, ['any', 'male', 'female']) || 'any',
        age_from: af > 0 ? af : null, age_to: at > 0 ? at : null,
        description: String(D.description || '').trim().slice(0, 160)
      } });
    }
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ──────────────────────────────────────────────────────────────────────────────────────────
// FFP ASSISTANT — in-dashboard agent for partners (facility) + professionals (coach).
// v1: guides setup + day-to-day, answers from the context the dashboard already holds, and NAVIGATES
// the user to the right screen (navigate tool). No data mutation yet (confirmed actions come next).
// Logged to ai_agent_events (surface = partner|pro) for analytics.
// ──────────────────────────────────────────────────────────────────────────────────────────
const AGENT_MODEL = process.env.AGENT_MODEL || 'claude-sonnet-4-6';
const PARTNER_PANELS = ['overview', 'checkins', 'members', 'plans', 'scheduling', 'appointments', 'staff', 'billing', 'announcements', 'classes', 'events', 'experiences', 'quests', 'challenges', 'deals', 'profile', 'settings'];
const PRO_PANELS = ['overview', 'scheduling', 'checkin', 'clients', 'payments', 'profile', 'services', 'packages', 'comms'];

function agentSystem(role, ctx) {
  var isPro = role === 'pro';
  var common = 'You are Grant from FFP — a warm, concise in-app business coach inside the FFP ' + (isPro ? 'Professional (coach)' : 'Partner (facility)') + ' dashboard on FFP Passport, an active-lifestyle platform in the UAE. You help ' + (isPro ? 'professionals grow their coaching business and set it up well' : 'partners improve their business and promote their services') + '. ' +
    'Help the user set up their account and run day-to-day tasks. Be specific and brief: one short paragraph or a few short steps, never a wall of text. ' +
    'Always use the on-screen LABELS the user sees — never internal/database words. Use the navigate tool to open the exact screen when the next step lives there. ';
  var structure, actions, setup;
  if (isPro) {
    structure = 'The dashboard screens: Overview (your numbers), Scheduling (set your availability and bookable session slots), Check-in (clients check in by code/QR), ' +
      'Clients (your client list, profiles, notes, forms and the packages they hold), Payments (earnings, invoices, bank details, and Stripe Connect to take online payment), ' +
      'Profile (your public storefront members see), Services (the session types you offer — e.g. 1:1 PT or a group class), Packages (multi-session bundles you sell), Messages (message your clients). ';
    actions = 'You can DO these for the coach, and each is shown to them to CONFIRM before it runs: create a service, create a package, add availability (a bookable slot — you need to know which service it is for), and message members. ' +
      'Gather only what you truly need (sensible defaults are fine — do not interrogate), then call the matching tool to PROPOSE it. For anything else, guide them and use navigate. ';
    setup = 'To get fully set up: complete your Profile, add your Services, set availability in Scheduling, create your Packages, and connect Stripe in Payments. ';
  } else {
    structure = 'The dashboard has two areas. BUSINESS (run your business): Overview & Analytics (your numbers), Check-ins (member check-in by QR), Members (your client list), ' +
      'Packages (the memberships and class-packs you sell), Sessions (your bookable timetable — the recurring classes / PT sessions members book), Appointments (the bookings calendar), ' +
      'Staff (your team), Payments & Invoices (Stripe Connect + invoicing), Announcements (broadcast to members). ' +
      'ENGAGEMENT (promote yourself to the FFP community — these are public listings members discover in the FFP app, NOT your timetable): Experiences (one-off classes promoted as experiences), Events, Trips, Quests, Challenges, Deals. ' +
      'Important so you are not confused by internal naming: a “Session” is an item on the weekly timetable; “Experiences”, “Trips” and “Events” are separate promotional listings. ' +
      'Some Business areas are still being built (Members, Staff and Payments are early) — be honest if something is not fully ready. ';
    actions = 'You can DO these for the partner, and each is shown to them to CONFIRM before it runs: create a package, create a session (on the timetable), set a staff member’s availability (you need the staff member’s name), post an announcement, and add a staff member. ' +
      'Gather only what you truly need (sensible defaults are fine — do not interrogate), then call the matching tool to PROPOSE it. For anything else, guide them and use navigate. ';
    setup = 'To get fully set up: complete your Profile, add Staff, create your Sessions and set availability, create your Packages, connect Stripe in Payments — and optionally promote Experiences / Events / Trips in Engagement. ';
  }
  return common + structure + actions + setup +
    'When the user is new, briefly explain how the dashboard is organised, then coach them to the next best step. ' +
    'Current account context (use it; do not invent data you were not given): ' + JSON.stringify(ctx || {}).slice(0, 1200) + '.';
}

async function anthropicMessages(system, messages, tools, maxTokens) {
  var body = { model: AGENT_MODEL, max_tokens: maxTokens || 1024, system: system, messages: messages };
  if (tools && tools.length) body.tools = tools;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(25000),
      body: JSON.stringify(body)
    });
    const j = await r.json();
    if (!r.ok) { console.error('[agent] anthropic:', j && j.error); return { error: (j && j.error && j.error.message) || 'ai_error' }; }
    return { content: j.content || [], stop_reason: j.stop_reason };
  } catch (e) {
    console.error('[agent] anthropic fetch:', e && e.message);
    return { error: (e && e.name === 'TimeoutError') ? 'ai_timeout' : 'ai_unreachable' };
  }
}

app.post('/api/agent/chat', async (req, res) => {
  try {
    if (!ANTHROPIC_KEY) return res.status(503).json({ error: 'ai_not_configured' });
    const b = req.body || {};
    const role = (b.role === 'pro') ? 'pro' : 'partner';
    const inMsgs = Array.isArray(b.messages) ? b.messages.slice(-16) : [];
    if (!inMsgs.length) return res.status(400).json({ error: 'messages required' });
    const sys = agentSystem(role, b.context || {});
    const panelEnum = (role === 'pro') ? PRO_PANELS : PARTNER_PANELS;
    var tools = [{
      name: 'navigate',
      description: 'Open a specific screen in the user\'s dashboard so they can act on what you suggested. Use when the next step lives on a screen.',
      input_schema: { type: 'object', properties: { panel: { type: 'string', enum: panelEnum }, reason: { type: 'string', description: 'one short phrase shown to the user, e.g. "to connect Stripe"' } }, required: ['panel'] }
    }];
    if (role === 'partner') tools = tools.concat(PARTNER_WRITE_TOOLS);
    else if (role === 'pro') tools = tools.concat(PRO_WRITE_TOOLS);
    var convo = inMsgs.map(function (m) { return { role: (m.role === 'assistant' ? 'assistant' : 'user'), content: String(m.content || '') }; });
    var navAction = null;
    var lastUser = ''; for (var i = inMsgs.length - 1; i >= 0; i--) { if (inMsgs[i].role !== 'assistant') { lastUser = String(inMsgs[i].content || ''); break; } }
    for (var iter = 0; iter < 3; iter++) {
      var resp = await anthropicMessages(sys, convo, tools, 1024);
      if (resp.error) return res.status(502).json({ error: 'ai_error' });
      var textParts = [], toolUses = [];
      (resp.content || []).forEach(function (blk) { if (blk.type === 'text') textParts.push(blk.text); else if (blk.type === 'tool_use') toolUses.push(blk); });
      // A write-action proposal: do NOT execute — surface a confirm card to the user.
      var writeUse = toolUses.filter(function (t) { return WRITE_ACTIONS.indexOf(t.name) >= 0; })[0];
      if (writeUse) {
        var args = writeUse.input || {};
        try { await supabase.from('ai_agent_events').insert({ member_id: b.member_id || null, session_id: b.session || null, surface: role, kind: 'propose', query: lastUser.slice(0, 1000), meta: { action: writeUse.name, args: args } }); } catch (e) {}
        return res.json({ reply: textParts.join('\n').trim(), proposal: { action: writeUse.name, args: args, summary: actionSummary(role, writeUse.name, args) }, navigate: navAction });
      }
      if (!toolUses.length) {
        try { await supabase.from('ai_agent_events').insert({ member_id: b.member_id || null, session_id: b.session || null, surface: role, kind: 'query', query: lastUser.slice(0, 1000), meta: navAction ? { navigate: navAction } : null }); } catch (e) {}
        return res.json({ reply: textParts.join('\n').trim() || 'How can I help with your account?', navigate: navAction });
      }
      convo.push({ role: 'assistant', content: resp.content });
      var results = toolUses.map(function (tu) {
        if (tu.name === 'navigate' && tu.input && panelEnum.indexOf(tu.input.panel) >= 0) {
          navAction = { panel: tu.input.panel, reason: String(tu.input.reason || '') };
          return { type: 'tool_result', tool_use_id: tu.id, content: 'Opened the ' + tu.input.panel + ' screen for the user. Briefly tell them what to do there.' };
        }
        return { type: 'tool_result', tool_use_id: tu.id, content: 'unknown tool', is_error: true };
      });
      convo.push({ role: 'user', content: results });
    }
    return res.json({ reply: 'Sorry — could you rephrase that?', navigate: navAction });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ── FFP ASSISTANT — confirmed write-actions (partner onboarding). Each is PROPOSED by the chat agent,
// CONFIRMED by the user, then executed here with the user's own JWT so the SECURITY DEFINER provider_* RPCs
// enforce ownership (a partner can only ever write to their own business). ──
const SB_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4enl1b2ZlY210eW1hYmxubWFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0NDM1MTYsImV4cCI6MjA5NTAxOTUxNn0.cWn0x1AeD-x9C-HHf9MShXbFRWdkWi5RMgHLgWJwOuE';
function userClient(jwt) { return createClient(process.env.SUPABASE_URL, SB_ANON, { global: { headers: { Authorization: 'Bearer ' + jwt } }, auth: { persistSession: false, autoRefreshToken: false } }); }
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WRITE_ACTIONS = ['create_package', 'create_session', 'set_availability', 'post_announcement', 'add_staff', 'create_service', 'message_members'];
function actionPanel(role, action) {
  if (role === 'pro') return ({ create_service: 'services', create_package: 'packages', set_availability: 'scheduling', message_members: 'comms' })[action] || null;
  return ({ create_package: 'plans', create_session: 'scheduling', set_availability: 'scheduling', post_announcement: 'announcements', add_staff: 'staff' })[action] || null;
}
const PARTNER_WRITE_TOOLS = [
  { name: 'create_package', description: 'Create a package / membership / class-pack the partner sells. Propose it for the user to confirm.', input_schema: { type: 'object', properties: { name: { type: 'string' }, plan_type: { type: 'string', enum: ['recurring', 'pack', 'term'] }, price_aed: { type: 'number' }, credits: { type: 'number', description: 'sessions included (for a pack)' }, period_days: { type: 'number', description: 'validity in days' }, pay_requirement: { type: 'string', enum: ['free', 'required', 'optional'] }, notes: { type: 'string' } }, required: ['name'] } },
  { name: 'create_session', description: 'Create a session on the timetable (a bookable class / PT session members book). Propose it for the user to confirm.', input_schema: { type: 'object', properties: { title: { type: 'string' }, activity: { type: 'string', description: 'discipline, e.g. Yoga, HIIT, Spin' }, capacity: { type: 'number' }, price_aed: { type: 'number' }, duration_min: { type: 'number' }, pay_requirement: { type: 'string', enum: ['free', 'required', 'optional'] }, day_of_week: { type: 'integer', minimum: 0, maximum: 6, description: '0=Sun..6=Sat (optional first time slot)' }, slot_time: { type: 'string', description: 'HH:MM 24h (optional first time slot)' }, description: { type: 'string' } }, required: ['title', 'activity'] } },
  { name: 'set_availability', description: 'Add an availability slot for a staff member. Propose it for the user to confirm.', input_schema: { type: 'object', properties: { staff_name: { type: 'string', description: 'the staff member this availability is for' }, day_of_week: { type: 'integer', minimum: 0, maximum: 6, description: '0=Sun..6=Sat for a weekly slot' }, slot_date: { type: 'string', description: 'YYYY-MM-DD for a one-off slot' }, start_time: { type: 'string', description: 'HH:MM' }, end_time: { type: 'string', description: 'HH:MM' }, duration_min: { type: 'number' } }, required: ['start_time', 'end_time'] } },
  { name: 'post_announcement', description: 'Post an announcement to members. Propose it for the user to confirm.', input_schema: { type: 'object', properties: { subject: { type: 'string' }, body: { type: 'string' }, channel: { type: 'string', enum: ['email', 'push', 'sms'] } }, required: ['body'] } },
  { name: 'add_staff', description: 'Add a staff / team member. Propose it for the user to confirm.', input_schema: { type: 'object', properties: { full_name: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, role: { type: 'string', enum: ['Coach', 'Manager', 'Front desk', 'Owner', 'Other'] }, access_level: { type: 'string', enum: ['full', 'manage', 'coach', 'view'] }, bio: { type: 'string' } }, required: ['full_name'] } }
];
const PRO_WRITE_TOOLS = [
  { name: 'create_service', description: 'Create a service (a session type the coach offers, e.g. 1:1 PT or a group class). Propose it for the user to confirm.', input_schema: { type: 'object', properties: { name: { type: 'string' }, service_type: { type: 'string', description: 'e.g. pt_session, group_class' }, description: { type: 'string' }, duration_min: { type: 'number' }, capacity: { type: 'number' }, price_aed: { type: 'number' }, location: { type: 'string' }, bookable_online: { type: 'boolean' } }, required: ['name'] } },
  { name: 'create_package', description: 'Create a multi-session package the coach sells. Propose it for the user to confirm.', input_schema: { type: 'object', properties: { name: { type: 'string' }, service_names: { type: 'array', items: { type: 'string' }, description: 'which services this package covers (defaults to all)' }, pkg_type: { type: 'string', enum: ['sessions', 'recurring', 'term'] }, price_aed: { type: 'number' }, credits: { type: 'number', description: 'sessions included' }, period_days: { type: 'number' }, pay_requirement: { type: 'string', enum: ['free', 'required', 'optional'] }, notes: { type: 'string' } }, required: ['name'] } },
  { name: 'set_availability', description: 'Add a weekly bookable slot for one of the coach\'s services. Propose it for the user to confirm.', input_schema: { type: 'object', properties: { service_name: { type: 'string', description: 'which service this slot is for' }, day_of_week: { type: 'integer', minimum: 0, maximum: 6, description: '0=Sun..6=Sat' }, start_time: { type: 'string', description: 'HH:MM' }, duration_min: { type: 'number' }, capacity: { type: 'number' }, title: { type: 'string' } }, required: ['start_time'] } },
  { name: 'message_members', description: 'Send a message / broadcast to the coach\'s members. Propose it for the user to confirm.', input_schema: { type: 'object', properties: { subject: { type: 'string' }, body: { type: 'string' }, channel: { type: 'string', enum: ['email', 'push', 'sms'] } }, required: ['body'] } }
];
function actionSummary(role, action, a) {
  a = a || {};
  if (action === 'create_service') return 'Create service “' + (a.name || '') + '”' + (a.duration_min != null ? (' · ' + a.duration_min + ' min') : '') + (a.price_aed != null ? (' · AED ' + a.price_aed) : '');
  if (action === 'message_members') return 'Message members: “' + String(a.subject || a.body || '').slice(0, 70) + '”';
  if (action === 'create_package') {
    if (role === 'pro') return 'Create package “' + (a.name || '') + '”' + (a.price_aed != null ? (' · AED ' + a.price_aed) : '') + (a.credits != null ? (' · ' + a.credits + ' sessions') : '');
    return 'Create package “' + (a.name || '') + '”' + (a.price_aed != null ? (' · AED ' + a.price_aed) : '') + (a.credits != null ? (' · ' + a.credits + ' sessions') : '') + ' (' + (a.plan_type || 'recurring') + ')';
  }
  if (action === 'create_session') return 'Create session “' + (a.title || '') + '” · ' + (a.activity || '') + ((a.day_of_week != null && a.slot_time) ? (' · ' + DAY[a.day_of_week] + ' ' + a.slot_time) : '') + (a.price_aed != null ? (' · AED ' + a.price_aed) : '');
  if (action === 'set_availability') {
    var whoFor = (role === 'pro') ? (a.service_name ? (' for ' + a.service_name) : '') : (a.staff_name ? (' for ' + a.staff_name) : '');
    return 'Add availability' + whoFor + ' · ' + (a.slot_date || (a.day_of_week != null ? DAY[a.day_of_week] : '') || '') + ' ' + (a.start_time || '') + (a.end_time ? ('–' + a.end_time) : '');
  }
  if (action === 'post_announcement') return 'Post announcement: “' + String(a.subject || a.body || '').slice(0, 70) + '” to all members';
  if (action === 'add_staff') return 'Add staff: ' + (a.full_name || '') + (a.role ? (' (' + a.role + ')') : '');
  return action;
}

app.post('/api/agent/execute', async (req, res) => {
  try {
    const b = req.body || {};
    const action = String(b.action || '');
    const a = b.args || {};
    const providerId = String(b.provider_id || '');
    const jwt = String(b.jwt || '');
    if (WRITE_ACTIONS.indexOf(action) < 0) return res.status(400).json({ error: 'unknown action' });
    if (!jwt) return res.status(401).json({ error: 'not_authenticated' });
    if (!providerId) return res.status(400).json({ error: 'provider required' });
    const us = userClient(jwt);
    const enumOr = function (v, list, d) { return list.indexOf(v) >= 0 ? v : d; };
    const sv = function (v) { return (v == null) ? '' : String(v); };
    const role = (b.role === 'pro') ? 'pro' : 'partner';
    var rpc, params, okMsg;
    if (role === 'pro') {
      if (action === 'create_service') {
        if (!sv(a.name).trim()) return res.json({ ok: false, error: 'A service name is needed.' });
        params = { p_pro: providerId, p_id: null, p: { name: sv(a.name).trim(), service_type: sv(a.service_type) || 'pt_session', description: sv(a.description), duration_min: sv(a.duration_min != null ? a.duration_min : 60), capacity: sv(a.capacity != null ? a.capacity : 1), price_aed: sv(a.price_aed), location: sv(a.location), free_cancellation_hours: sv(a.free_cancellation_hours != null ? a.free_cancellation_hours : 24), bookable_online: a.bookable_online !== false } };
        rpc = 'pro_save_service'; okMsg = 'Created the service “' + sv(a.name).trim() + '”.';
      } else if (action === 'create_package') {
        if (!sv(a.name).trim()) return res.json({ ok: false, error: 'A package name is needed.' });
        var svcIds = [];
        try {
          var svl = await us.rpc('pro_list_services', { p_pro: providerId });
          var svs = (svl && svl.data) || [];
          if (Array.isArray(a.service_names) && a.service_names.length) { a.service_names.forEach(function (nm0) { var hit = svs.filter(function (s) { return String(s.name || '').toLowerCase().indexOf(String(nm0).toLowerCase()) >= 0; })[0]; if (hit) svcIds.push(hit.id); }); }
          if (!svcIds.length) svcIds = svs.map(function (s) { return s.id; });
        } catch (e) {}
        if (!svcIds.length) return res.json({ ok: false, error: 'Add a service first, then create a package that uses it.' });
        params = { p_pro: providerId, p_id: null, p: { name: sv(a.name).trim(), service_ids: svcIds, pkg_type: enumOr(a.pkg_type, ['sessions', 'recurring', 'term'], 'sessions'), price_aed: sv(a.price_aed), credits: sv(a.credits), period_days: sv(a.period_days), notes: sv(a.notes), pay_requirement: enumOr(a.pay_requirement, ['free', 'required', 'optional'], 'optional') } };
        rpc = 'pro_save_package'; okMsg = 'Created the package “' + sv(a.name).trim() + '”.';
      } else if (action === 'message_members') {
        if (!sv(a.body).trim()) return res.json({ ok: false, error: 'The message needs a body.' });
        params = { p_pro: providerId, p: { channel: enumOr(a.channel, ['email', 'push', 'sms'], 'email'), audience_type: 'all', audience_ref: '', audience_label: 'Everyone', subject: sv(a.subject), body: sv(a.body).trim() } };
        rpc = 'pro_save_broadcast'; okMsg = 'Saved the message to your members.';
      } else { // set_availability (pro slot — needs a service)
        if (!sv(a.start_time)) return res.json({ ok: false, error: 'A start time is needed.' });
        var svcId = null;
        try {
          var sl2 = await us.rpc('pro_list_services', { p_pro: providerId });
          var list2 = (sl2 && sl2.data) || [];
          if (a.service_name) { var nm2 = String(a.service_name).toLowerCase(); svcId = (list2.filter(function (s) { return String(s.name || '').toLowerCase() === nm2; })[0] || list2.filter(function (s) { return String(s.name || '').toLowerCase().indexOf(nm2) >= 0; })[0] || {}).id || null; }
          if (!svcId && list2.length === 1) svcId = list2[0].id;
        } catch (e) {}
        if (!svcId) return res.json({ ok: false, error: 'I couldn’t match that service — create the service first, then add availability for it.' });
        params = { p_pro: providerId, p_id: null, p: { service_id: svcId, slot_type: sv(a.slot_type) || 'one_to_one', title: sv(a.title), weekday: sv(a.day_of_week != null ? a.day_of_week : (a.weekday != null ? a.weekday : '')), start_time: sv(a.start_time), duration_min: sv(a.duration_min != null ? a.duration_min : 60), capacity: sv(a.capacity != null ? a.capacity : 1), location: sv(a.location), notes: sv(a.notes), client_ids: [] } };
        rpc = 'pro_save_slot'; okMsg = 'Added the availability slot.';
      }
    } else {
      if (action === 'create_package') {
        if (!sv(a.name).trim()) return res.json({ ok: false, error: 'A package name is needed.' });
        params = { p_provider: providerId, p_id: null, p: { name: sv(a.name).trim(), plan_type: enumOr(a.plan_type, ['recurring', 'pack', 'term'], 'recurring'), price_aed: sv(a.price_aed), credits: sv(a.credits), period_days: sv(a.period_days), notes: sv(a.notes), pay_requirement: enumOr(a.pay_requirement, ['free', 'required', 'optional'], 'optional'), template_ids: [] } };
        rpc = 'provider_save_plan'; okMsg = 'Created the package “' + sv(a.name).trim() + '”.';
      } else if (action === 'create_session') {
        if (!sv(a.title).trim() || !sv(a.activity).trim()) return res.json({ ok: false, error: 'A session title and activity are needed.' });
        var slots = (a.day_of_week != null && a.slot_time) ? [{ day_of_week: Number(a.day_of_week), slot_time: sv(a.slot_time), coach: null }] : [];
        params = { p_provider: providerId, p_id: null, p: { title: sv(a.title).trim(), activity: sv(a.activity).trim(), description: a.description ? sv(a.description) : null, capacity: sv(a.capacity != null ? a.capacity : 10), price_aed: sv(a.price_aed), duration_min: sv(a.duration_min != null ? a.duration_min : 60), free_cancellation_hours: '24', pay_requirement: enumOr(a.pay_requirement, ['free', 'required', 'optional'], 'optional'), hero_image_url: null, fitness_level: null, slots: slots, gallery: [] } };
        rpc = 'provider_save_session_template'; okMsg = 'Created the session “' + sv(a.title).trim() + '”.';
      } else if (action === 'post_announcement') {
        if (!sv(a.body).trim()) return res.json({ ok: false, error: 'The announcement needs a message.' });
        params = { p_provider: providerId, p: { channel: enumOr(a.channel, ['email', 'push', 'sms'], 'email'), audience_type: 'all', audience_ref: '', audience_label: 'Everyone', subject: sv(a.subject), body: sv(a.body).trim() } };
        rpc = 'provider_save_broadcast'; okMsg = 'Posted the announcement.';
      } else if (action === 'add_staff') {
        if (!sv(a.full_name).trim()) return res.json({ ok: false, error: 'A name is needed.' });
        params = { p_provider: providerId, p_id: null, p: { full_name: sv(a.full_name).trim(), email: sv(a.email), phone: sv(a.phone), role: enumOr(a.role, ['Coach', 'Manager', 'Front desk', 'Owner', 'Other'], 'Coach'), access_level: enumOr(a.access_level, ['full', 'manage', 'coach', 'view'], 'coach'), status: 'active', notes: '', bio: sv(a.bio), photo_url: '' } };
        rpc = 'provider_save_staff'; okMsg = 'Added ' + sv(a.full_name).trim() + ' to your team.';
      } else { // set_availability (staff)
        if (!sv(a.start_time) || !sv(a.end_time)) return res.json({ ok: false, error: 'A start and end time are needed.' });
        var staffId = null;
        try {
          var sl = await us.rpc('provider_list_staff', { p_provider: providerId });
          var list = (sl && sl.data) || [];
          if (a.staff_name) { var nm = String(a.staff_name).toLowerCase(); staffId = (list.filter(function (s) { return String(s.full_name || '').toLowerCase() === nm; })[0] || list.filter(function (s) { return String(s.full_name || '').toLowerCase().indexOf(nm) >= 0; })[0] || {}).id || null; }
          if (!staffId && list.length === 1) staffId = list[0].id;
        } catch (e) {}
        if (!staffId) return res.json({ ok: false, error: 'I couldn’t match that staff member — add the staff member first, then set their availability.' });
        var pp = { staff_id: staffId, service_id: '', start_time: sv(a.start_time), end_time: sv(a.end_time), duration_min: sv(a.duration_min != null ? a.duration_min : 60) };
        if (a.slot_date) pp.slot_date = sv(a.slot_date); else if (a.day_of_week != null) pp.day_of_week = sv(a.day_of_week);
        params = { p_provider: providerId, p_id: null, p: pp };
        rpc = 'provider_save_trainer_slot'; okMsg = 'Added the availability slot.';
      }
    }
    var rr = await us.rpc(rpc, params);
    if (rr.error) { console.error('[agent execute]', action, rr.error); return res.json({ ok: false, error: rr.error.message || 'That didn’t go through — please try from the screen.' }); }
    try { await supabase.from('ai_agent_events').insert({ member_id: b.member_id || null, session_id: b.session || null, surface: role, kind: 'action', query: action, meta: { args: a } }); } catch (e) {}
    return res.json({ ok: true, message: okMsg, navigate: actionPanel(role, action) });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// AI WORKOUT SUMMARY — short, concise coaching note from the sets the member actually performed.
app.post('/api/workout/summary', async (req, res) => {
  try {
    if (!ANTHROPIC_KEY) return res.status(503).json({ error: 'ai_not_configured' });
    const b = req.body || {};
    const payload = JSON.stringify({ title: b.title || 'Workout', duration_sec: b.duration_sec || 0, total_volume: b.total_volume || 0, sets: Array.isArray(b.sets) ? b.sets.slice(0, 80) : [] });
    const sys = 'You are a supportive, knowledgeable strength coach. Given a completed workout (title, the sets performed with reps and weight, duration and total volume), write a SHORT performance note for the member: 2 to 3 sentences, max ~45 words. ' +
      'Acknowledge one thing they did well and give one specific, actionable tip to improve next time (e.g. progression, rep targets, rest, form focus). Friendly, plain language, no markdown, no lists, no headings. Output plain text only.';
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(25000),
      body: JSON.stringify({ model: WORKOUT_MODEL, max_tokens: 300, system: sys, messages: [{ role: 'user', content: payload }] })
    });
    const j = await r.json();
    if (!r.ok) { console.error('[workout/summary] anthropic:', j && j.error); return res.status(502).json({ error: 'ai_error' }); }
    var txt = '';
    try { txt = (j.content || []).map(function (x) { return x.text || ''; }).join('').trim(); } catch (e) {}
    return res.json({ summary: txt });
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
      handoff_code: mintHandoffCode(sessionMember), // 60s one-time cross-origin code → ffppassport.com/auth-handoff.html → /api/auth/exchange {code}
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

// v118: ADMIN — provision a provider from an approved application (the Applications-queue "Approve" action).
// The admin UI (ffp-admin-applications-loader.js) has always POSTed here, but the route was never built, so
// Approve silently 404'd. Body: { application_id, subscription_tier, paid_until(ISO), monthly_fee_aed }.
// Auth: Authorization: Bearer <admin ffp_jwt>. Creates (or upgrades) the member + the provider, stamps the tier/
// expiry/fee, marks the application approved (reviewed_by/at), and emails the welcome/invite. Mirrors /api/provider/signup.
app.post('/api/admin/provision-provider', async (req, res) => {
  try {
    const auth = verifyAdminAccessJwt(req.headers.authorization || (req.body && req.body.jwt));
    if (!auth) return res.status(401).json({ error: 'Not authenticated. Please sign in again.' });
    const { data: adm } = await supabase.from('admin_users').select('id').eq('id', auth.memberId).maybeSingle();
    if (!adm) return res.status(403).json({ error: 'Admin access required.' });

    const b = req.body || {};
    const appId = b.application_id;
    const tier = ['standard', 'premium', 'partner'].includes(b.subscription_tier) ? b.subscription_tier : 'standard';
    const paidUntil = b.paid_until ? new Date(b.paid_until) : null;
    const fee = Number(b.monthly_fee_aed);
    if (!appId) return res.status(400).json({ error: 'Missing application_id.' });
    if (!paidUntil || isNaN(paidUntil.getTime())) return res.status(400).json({ error: 'Pick a valid subscription end date.' });

    const { data: appRow, error: aErr } = await supabase
      .from('provider_applications').select('*').eq('id', appId).maybeSingle();
    if (aErr || !appRow) return res.status(404).json({ error: 'Application not found.' });
    if (appRow.status === 'approved') return res.status(409).json({ error: 'This application is already approved.' });

    const cleanEmail = String(appRow.email || '').trim().toLowerCase();
    if (!cleanEmail) return res.status(400).json({ error: 'This application has no email on file.' });

    // Find-or-create the member by email (upgrade an existing account to provider rather than erroring).
    let { data: member } = await supabase.from('members').select('id, role').eq('email', cleanEmail).maybeSingle();
    if (!member) {
      const { hash } = generateCode(); // placeholder access code; replaced when they request a login code
      const passport_no = `FFP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9999 + 1)).padStart(4, '0')}`;
      const ins = await supabase.from('members').insert({
        email: cleanEmail, full_name: appRow.contact_name || cleanEmail, access_code: hash,
        role: 'provider', status: 'active', verified: true, passport_no
      }).select('id, role').single();
      if (ins.error) { console.error('[provision-provider] member insert:', ins.error); return res.status(500).json({ error: 'Could not create the provider account.' }); }
      member = ins.data;
    }

    // Don't double-create a provider for the same owner.
    const { data: existingProv } = await supabase
      .from('providers').select('owner_user_id').eq('owner_user_id', member.id).maybeSingle();
    if (existingProv) {
      await supabase.from('provider_applications')
        .update({ status: 'approved', reviewed_by: auth.memberId, reviewed_at: new Date().toISOString() }).eq('id', appId);
      return res.status(409).json({ error: 'A provider already exists for this email — marked the application approved.' });
    }

    const { error: pErr } = await supabase.from('providers').insert({
      owner_user_id: member.id, business_name: appRow.business_name || 'Provider',
      category: appRow.category || null, provider_type: appRow.provider_type || null,
      country: appRow.country || null, city: appRow.city || null,
      contact_email: cleanEmail, contact_phone: appRow.phone || null,
      website: appRow.website || null, about: appRow.about || null,
      status: 'approved', approved_at: new Date().toISOString(), approved_by: auth.memberId,
      subscription_tier: tier, paid_until: paidUntil.toISOString(),
      monthly_fee_aed: isNaN(fee) ? null : fee, payments_status: 'not_connected'
    });
    if (pErr) { console.error('[provision-provider] provider insert:', pErr); return res.status(500).json({ error: 'Could not create the provider profile.' }); }

    await supabase.from('provider_applications')
      .update({ status: 'approved', reviewed_by: auth.memberId, reviewed_at: new Date().toISOString() }).eq('id', appId);

    let email_sent = false;
    try { await sendProviderWelcomeEmail(cleanEmail, appRow.business_name || 'your business', appRow.contact_name || '', `${SITE_URL}/login`); email_sent = true; }
    catch (e) { console.error('[provision-provider] welcome email failed (non-blocking):', e); }

    res.json({ success: true, email_sent, provider_owner: member.id });
  } catch (error) {
    console.error('[provision-provider] error:', error);
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

// PUBLIC passport page (the member's QR → /my-passport.html?p=FFP-YYYY-NNNN). Resolves the passport_no to the
// member's public card fields + their journey/streak stats + their UPCOMING HOSTED meet-ups, so a scanner gets
// "just enough to want to join". No auth — public, read-only, public fields only.
app.get('/api/passport/:passportNo', async (req, res) => {
  try {
    const pno = String(req.params.passportNo || '').trim();
    if (!pno) return res.status(400).json({ error: 'Missing passport number' });
    const { data: m, error } = await supabase.from('members')
      .select('id, passport_no, full_name, given_names, surname, photo_url, nationality, gender, date_of_birth, country, city, tier, status, verified, referral_code, passport_expires_at')
      .eq('passport_no', pno).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    if (!m) return res.status(404).json({ error: 'no_passport' });

    var member = {
      passport_no: m.passport_no, full_name: m.full_name, given_names: m.given_names, surname: m.surname,
      photo_url: m.photo_url, nationality: m.nationality, gender: m.gender, date_of_birth: m.date_of_birth,
      country: m.country, city: m.city, tier: m.tier, status: m.status, verified: m.verified,
      referral_code: m.referral_code, expires: m.passport_expires_at, member_since: null
    };

    // Journey stats from activity_logs (streak, totals, cities, places)
    var stats = { activities: 0, streak: 0, cities: 0, venues: 0 };
    try {
      const { data: logs } = await supabase.from('activity_logs').select('logged_at, city, venue').eq('member_id', m.id);
      if (logs && logs.length) {
        stats.activities = logs.length;
        var cities = {}, venues = {}, days = {}, today = new Date(); today.setHours(0, 0, 0, 0);
        logs.forEach(function (l) {
          if (l.city) cities[String(l.city).toLowerCase()] = 1;
          if (l.venue) venues[String(l.venue).toLowerCase()] = 1;
          if (l.logged_at) { var d = new Date(l.logged_at); d.setHours(0, 0, 0, 0); var da = Math.round((today - d) / 86400000); if (da >= 0) days[da] = 1; }
        });
        stats.cities = Object.keys(cities).length; stats.venues = Object.keys(venues).length;
        var s = 0, di = days[0] ? 0 : (days[1] ? 1 : -1); if (di >= 0) { while (days[di]) { s++; di++; } } stats.streak = s;
      }
    } catch (e) {}

    // Upcoming meet-ups this member is HOSTING
    var meetups = [];
    try {
      const { data: mk } = await supabase.from('meetups')
        .select('id, title, sport, city, venue, meets_at, max_people')
        .eq('host_member_id', m.id).in('status', ['open', 'full'])
        .gte('meets_at', new Date().toISOString()).order('meets_at', { ascending: true }).limit(5);
      meetups = mk || [];
    } catch (e) {}

    return res.json({ success: true, member: member, stats: stats, meetups: meetups });
  } catch (e) { return res.status(500).json({ error: e.message }); }
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
      .select('id, activity, category, venue, provider_id, duration_min, duration_sec, intensity, calories, distance_km, avg_heart_rate, notes, logged_at, city, country, verified, checkin_lat, checkin_lng, photo_url, photos, shared, source, metrics')
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
// v88: A member shares a logged activity → notify everyone in their collection (member_connections).
// Phone push for activity TAGS. The in-app bell row for each tagged connection is written transactionally
// by the activity_add_partners RPC; this just rides the phone push so the "you were tagged" alert isn't
// missed. Pushes to the PENDING tags on the activity (those just created by the tagger).
app.post('/api/activity/notify-tags', async (req, res) => {
  try {
    const taggerId = (req.body && req.body.member_id) || null;
    const activityId = (req.body && req.body.activity_id) || null;
    if (!taggerId || !activityId) return res.status(400).json({ error: 'Missing member or activity' });
    const { data: act } = await supabase.from('activity_logs').select('id, member_id, activity, city').eq('id', activityId).maybeSingle();
    if (!act || act.member_id !== taggerId) return res.status(404).json({ error: 'Activity not found' });
    const { data: tagger } = await supabase.from('members').select('full_name').eq('id', taggerId).maybeSingle();
    const who = (tagger && tagger.full_name) ? tagger.full_name : 'A connection';
    const { data: tags } = await supabase.from('activity_partners')
      .select('partner_member_id').eq('activity_id', activityId).eq('tagged_by', taggerId).eq('status', 'pending');
    const what = act.activity || 'an activity';
    const where = act.city ? (' · ' + act.city) : '';
    let pushed = 0;
    for (const t of (tags || [])) {
      try {
        await sendPushToMember(t.partner_member_id, {
          title: who + ' added you to an activity',
          body: what + where + ' — tap to confirm it on your journey',
          url: '/ffp-member-dashboard.html#activity-tags',
          icon: '/assets/icons/ffp-icon-192.png'
        });
        pushed++;
      } catch (e) {}
    }
    return res.json({ success: true, pushed });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});
app.post('/api/activity/notify', async (req, res) => {
  try {
    const memberId = (req.body && (req.body.member_id || req.body.from_member_id)) || null;
    const activityId = (req.body && req.body.activity_id) || null;
    if (!memberId || !activityId) return res.status(400).json({ error: 'Missing member or activity' });

    // The activity must belong to this member AND be shared.
    const { data: act } = await supabase
      .from('activity_logs').select('id, member_id, activity, city, shared').eq('id', activityId).single();
    if (!act || act.member_id !== memberId) return res.status(404).json({ error: 'Activity not found' });
    if (!act.shared) return res.json({ success: true, notified: 0, skipped: 'not shared' });

    // Collection = member_connections involving this member (non-rejected).
    const { data: conns } = await supabase
      .from('member_connections')
      .select('requester_id, addressee_id, status')
      .or('requester_id.eq.' + memberId + ',addressee_id.eq.' + memberId);
    const ids = Array.from(new Set((conns || [])
      .filter(c => (c.status || '') !== 'rejected')
      .map(c => (c.requester_id === memberId ? c.addressee_id : c.requester_id))
      .filter(x => x && x !== memberId)));

    // Don't DOUBLE-notify people tagged on this activity — they get the specific "added you to an
    // activity" tag notification instead, so the generic "logged an activity" share is skipped for them.
    const tagged = new Set();
    try {
      const { data: taggedRows } = await supabase.from('activity_partners').select('partner_member_id').eq('activity_id', activityId);
      (taggedRows || []).forEach(t => { if (t.partner_member_id) tagged.add(t.partner_member_id); });
    } catch (e) {}
    const ids2 = ids.filter(x => !tagged.has(x));

    const { data: me } = await supabase.from('members').select('full_name').eq('id', memberId).maybeSingle();
    const who = (me && me.full_name) ? me.full_name : 'A connection';
    const what = act.activity || 'an activity';
    const where = act.city ? (' in ' + act.city) : '';

    let notified = 0;
    for (const toId of ids2) {
      try {
        await notifyMember(toId, {
          title: who + ' logged an activity',
          body: what + where + ' — tap to see how it went',
          icon: 'fitness_center',
          link: '/ffp-member-dashboard.html?activity=' + encodeURIComponent(activityId) + '#panel-passport'
        });
        notified++;
      } catch (e) {}
    }
    res.json({ success: true, notified });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// v92: Invite FFP connections to a meet-up — each invitee gets a bell + push deep-linking to it.
app.post('/api/meetups/:id/invite', async (req, res) => {
  try {
    const meetupId = req.params.id;
    const fromId = (req.body && (req.body.from_member_id || req.body.member_id)) || null;
    let toIds = (req.body && req.body.to_member_ids) || [];
    if (!Array.isArray(toIds)) toIds = [];
    toIds = Array.from(new Set(toIds.filter(x => x && x !== fromId)));
    if (!fromId || !toIds.length) return res.status(400).json({ error: 'Missing inviter or recipients' });
    const { data: m } = await supabase.from('meetups').select('id, title, sport, city').eq('id', meetupId).single();
    if (!m) return res.status(404).json({ error: 'Meet-up not found' });
    const { data: inviter } = await supabase.from('members').select('full_name').eq('id', fromId).maybeSingle();
    const who = (inviter && inviter.full_name) ? inviter.full_name : 'A friend';
    const what = m.title || m.sport || 'a meet-up';
    let sent = 0;
    for (const toId of toIds) {
      try {
        await notifyMember(toId, {
          title: who + ' invited you to a meet-up',
          body: 'Join “' + what + '”' + (m.city ? ' in ' + m.city : '') + ' — tap to take a look',
          icon: 'group_add',
          link: '/ffp-member-dashboard.html?meetup=' + encodeURIComponent(meetupId) + '#panel-meetups'
        });
        sent++;
      } catch (e) {}
    }
    res.json({ success: true, sent });
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
// New-booking host alert. Called by the DB trigger (net.http_post) on every new
// professional/provider-session booking. Verifies a shared secret, resolves the host
// email via the booking_host_notify_payload RPC, and emails the pro/partner.
const BOOKINGS_NOTIFY_SECRET = process.env.BOOKINGS_NOTIFY_SECRET || '';
app.post('/api/bookings/notify-host', async (req, res) => {
  try {
    if (!BOOKINGS_NOTIFY_SECRET || req.get('x-ffp-secret') !== BOOKINGS_NOTIFY_SECRET) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const bid = req.body && req.body.booking_id;
    if (!bid) return res.status(400).json({ error: 'booking_id required' });
    const { data, error } = await supabase.rpc('booking_host_notify_payload', { p_booking: bid });
    if (error) { console.error('[booking notify] rpc:', error); return res.status(500).json({ error: 'lookup failed' }); }
    if (!data) return res.json({ ok: true, skipped: 'no_payload' });
    await sendBookingHostEmail(data);
    res.json({ ok: true });
  } catch (e) {
    console.error('[booking notify]:', e);
    res.status(500).json({ error: 'failed' });
  }
});
// Member-facing booking email (cancel / reschedule / credit returned). Called by the notifications trigger.
app.post('/api/notifications/email-member', async (req, res) => {
  try {
    if (!BOOKINGS_NOTIFY_SECRET || req.get('x-ffp-secret') !== BOOKINGS_NOTIFY_SECRET) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    const nid = req.body && req.body.notification_id;
    if (!nid) return res.status(400).json({ error: 'notification_id required' });
    const { data, error } = await supabase.rpc('member_notify_email_payload', { p_notif: nid });
    if (error) { console.error('[member notify] rpc:', error); return res.status(500).json({ error: 'lookup failed' }); }
    if (!data) return res.json({ ok: true, skipped: 'no_payload' });
    await sendMemberNotifyEmail(data);
    res.json({ ok: true });
  } catch (e) {
    console.error('[member notify]:', e);
    res.status(500).json({ error: 'failed' });
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
// ════════════════════════════════════════════════════════════════════════════
// COACH MEMORY (Phase 1) — distil each member's recent data into a living profile the Coach reads.
// Deterministic facts + one cheap Haiku "summary" (the Coach's private memory). Feeds the Sunday
// summary now; nudges + social accountability (Phases 2/3) will read the same profile.
// ════════════════════════════════════════════════════════════════════════════
async function computeCoachProfile(memberId) {
  const DAY = 86400000, now = Date.now();
  // Activities — last 45 days
  let acts = [];
  try {
    const ar = await supabase.from('activity_logs').select('activity, logged_at')
      .eq('member_id', memberId).gte('logged_at', new Date(now - 45 * DAY).toISOString()).order('logged_at', { ascending: false });
    acts = (ar && ar.data) ? ar.data : [];
  } catch (e) {}
  let thisW = 0, lastW = 0, c30 = 0, lastActiveDays = null; const actCount = {};
  acts.forEach(function (a) {
    const t = a.logged_at ? new Date(a.logged_at).getTime() : 0; if (!t) return;
    const d = (now - t) / DAY;
    if (d <= 7) thisW++; else if (d <= 14) lastW++;
    if (d <= 30) c30++;
    if (lastActiveDays == null) lastActiveDays = Math.floor(d);
    if (a.activity) actCount[a.activity] = (actCount[a.activity] || 0) + 1;
  });
  let topActivity = '', topN = 0;
  Object.keys(actCount).forEach(function (k) { if (actCount[k] > topN) { topN = actCount[k]; topActivity = k; } });
  // Wearable — last 14 days
  let wd = [];
  try {
    const wr = await supabase.from('member_wearable_daily').select('day, recovery_pct, sleep_hours, strain')
      .eq('member_id', memberId).gte('day', new Date(now - 14 * DAY).toISOString().slice(0, 10)).order('day', { ascending: false });
    wd = (wr && wr.data) ? wr.data : [];
  } catch (e) {}
  let latestRec = null, latestStrain = null;
  for (let i = 0; i < wd.length; i++) { if (latestRec == null && wd[i].recovery_pct != null) latestRec = wd[i].recovery_pct; if (latestStrain == null && wd[i].strain != null) latestStrain = wd[i].strain; }
  const sl = wd.filter(function (x) { return x.sleep_hours != null; }).slice(0, 7);
  const avgSleep = sl.length ? Math.round(sl.reduce(function (a, x) { return a + Number(x.sleep_hours); }, 0) / sl.length * 10) / 10 : null;
  // Connections + SOCIAL SUPPORT OPS (Phase 3). Activity STATUS only (active/quiet/streak) — NEVER another member's health.
  let connections = null; let support_ops = [];
  const isoDay = function (d) { return d.toISOString().slice(0, 10); };
  try {
    const cr = await supabase.from('member_connections').select('requester_id, addressee_id')
      .or('requester_id.eq.' + memberId + ',addressee_id.eq.' + memberId).eq('status', 'accepted');
    const rows = (cr && cr.data) ? cr.data : [];
    connections = rows.length;
    const otherIds = rows.map(function (r) { return r.requester_id === memberId ? r.addressee_id : r.requester_id; }).filter(Boolean);
    if (otherIds.length) {
      const nm = {};
      try { const mr = await supabase.from('members').select('id, given_names, full_name').in('id', otherIds); (mr.data || []).forEach(function (x) { nm[x.id] = String(x.given_names || x.full_name || 'A friend').split(' ')[0]; }); } catch (e) {}
      const dayMap = {}; const latestShared = {};   // latestShared[member] = their most recent SHARED activity id (to high-five)
      try {
        const ar2 = await supabase.from('activity_logs').select('id, member_id, logged_at, shared').in('member_id', otherIds).gte('logged_at', new Date(now - 45 * DAY).toISOString()).order('logged_at', { ascending: false });
        (ar2.data || []).forEach(function (a) {
          if (!a.member_id || !a.logged_at) return;
          const k = new Date(a.logged_at).toISOString().slice(0, 10); (dayMap[a.member_id] = dayMap[a.member_id] || {})[k] = 1;
          if (a.shared && !latestShared[a.member_id]) latestShared[a.member_id] = a.id;   // first (most recent) shared
        });
      } catch (e) {}
      otherIds.forEach(function (id) {
        const set = dayMap[id]; if (!set) return;                       // never active in window → don't nag about them
        const keys = Object.keys(set); if (!keys.length) return;
        let maxT = 0; keys.forEach(function (k) { const t = new Date(k + 'T00:00:00Z').getTime(); if (t > maxT) maxT = t; });
        const lad = Math.floor((now - maxT) / DAY);
        let s = 0, d = new Date(); if (!set[isoDay(d)]) d.setUTCDate(d.getUTCDate() - 1); while (set[isoDay(d)]) { s++; d.setUTCDate(d.getUTCDate() - 1); }
        if (lad >= 10 && lad <= 60) support_ops.push({ kind: 'quiet', member_id: id, name: nm[id] || 'A friend', days: lad, activity_id: latestShared[id] || null });
        else if (s >= 3) support_ops.push({ kind: 'streak', member_id: id, name: nm[id] || 'A friend', streak: s, activity_id: latestShared[id] || null });
      });
    }
  } catch (e) {}
  // Upcoming meetups THIS member hosts with open spots → invite-your-crew op.
  try {
    const mu = await supabase.from('meetups').select('id, title, meets_at, max_people, status').eq('host_member_id', memberId)
      .gte('meets_at', new Date(now).toISOString()).lte('meets_at', new Date(now + 7 * DAY).toISOString());
    const muRows = (mu && mu.data) ? mu.data : [];
    for (let k = 0; k < muRows.length; k++) {
      const M = muRows[k]; if (M.status === 'cancelled' || !M.max_people) continue;
      let cnt = 0; try { const ac = await supabase.from('meetup_attendees').select('id', { count: 'exact', head: true }).eq('meetup_id', M.id).neq('status', 'cancelled'); if (ac && typeof ac.count === 'number') cnt = ac.count; } catch (e) {}
      const spots = M.max_people - cnt; if (spots > 0) support_ops.push({ kind: 'meetup_fill', meetup_id: M.id, title: M.title, spots: spots });
    }
  } catch (e) {}
  support_ops = support_ops.slice(0, 6);
  const facts = {
    activities_30d: c30,
    weekly_cadence: Math.round(c30 / 30 * 7 * 10) / 10,
    top_activity: topActivity || null,
    last_active_days: lastActiveDays,
    momentum: thisW > lastW ? 'rising' : (thisW < lastW ? 'slipping' : 'steady'),
    latest_recovery: latestRec, latest_strain: latestStrain, avg_sleep_7d: avgSleep,
    connections: connections, at_risk: (lastActiveDays != null && lastActiveDays > 10)
  };
  let summary = '';
  try {
    if (ANTHROPIC_KEY) {
      const sys = 'You are Grant, FFP\'s fitness coach. From these JSON facts about ONE member, write 2-3 short sentences (max ~45 words, no emojis) capturing what you know about their training — favourite activity, how often they train, momentum, and recovery/sleep if present. Specific and factual; this is your private memory to personalise future coaching. Speak about them in third person ("they").';
      const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(25000), body: JSON.stringify({ model: WORKOUT_MODEL, max_tokens: 150, system: sys, messages: [{ role: 'user', content: JSON.stringify(facts) }] }) });
      const j = await r.json(); if (r.ok) summary = ((j.content || []).map(function (b) { return b.text || ''; }).join('')).trim();
    }
  } catch (e) {}
  try { await supabase.from('member_coach_profile').upsert({ member_id: memberId, summary: summary || null, facts: facts, support_ops: support_ops, updated_at: new Date().toISOString() }, { onConflict: 'member_id' }); } catch (e) {}
  return { summary: summary, facts: facts, support_ops: support_ops };
}

// On-demand profile (member app posts {refresh}). Returns cached if <24h old, else recomputes.
app.post('/api/coach/profile', async (req, res) => {
  try {
    const v = verifyRefreshToken((req.body && req.body.refresh) || '');
    if (!v) return res.status(401).json({ error: 'auth' });
    const { data: ex } = await supabase.from('member_coach_profile').select('summary, facts, support_ops, updated_at').eq('member_id', v.memberId).maybeSingle();
    if (ex && ex.updated_at && (Date.now() - new Date(ex.updated_at).getTime() < 24 * 60 * 60 * 1000)) return res.json({ summary: ex.summary, facts: ex.facts, support_ops: ex.support_ops || [] });
    const p = await computeCoachProfile(v.memberId);
    return res.json(p);
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// Nightly batch derivation (Vercel cron, secret-gated). ?only=<member|email> for a safe single test.
app.get('/api/cron/coach-profiles', async (req, res) => {
  const secret = process.env.CRON_SECRET || '';
  const auth = req.headers['authorization'] || '';
  if (!(secret && (auth === ('Bearer ' + secret) || req.query.secret === secret))) return res.status(401).json({ error: 'unauthorized' });
  try {
    const only = (req.query.only || '').trim();
    let qy = supabase.from('members').select('id').eq('role', 'member').eq('status', 'active');
    if (only) qy = (only.indexOf('@') > -1) ? supabase.from('members').select('id').eq('email', only) : supabase.from('members').select('id').eq('id', only);
    const { data: members } = await qy;
    let done = 0;
    for (let i = 0; i < (members || []).length; i++) { try { await computeCoachProfile(members[i].id); done++; } catch (e) {} }
    return res.json({ success: true, profiled: done, total: (members || []).length });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

// ════════════════════════════════════════════════════════════════════════════
// COACH NUDGES (Phase 2) — one proactive, "based-on-now" message/member/day via notifyMember (bell + push, NO email).
// Pure rules over member_coach_profile.facts + TODAY's wearable + whether they've logged today. AI writes nothing here.
// Honours preferences.no_coach_nudges. 1/day enforced via member_coach_profile.last_nudge_at; same key won't repeat back-to-back.
// ════════════════════════════════════════════════════════════════════════════
async function evalCoachNudge(memberId, facts) {
  const today = new Date().toISOString().slice(0, 10);
  let rec = null;
  try { const w = await supabase.from('member_wearable_daily').select('recovery_pct, sleep_hours').eq('member_id', memberId).eq('day', today).maybeSingle(); if (w && w.data) rec = w.data.recovery_pct; } catch (e) {}
  let actToday = 0;
  try { const a = await supabase.from('activity_logs').select('id', { count: 'exact', head: true }).eq('member_id', memberId).gte('logged_at', today + 'T00:00:00Z'); if (a && typeof a.count === 'number') actToday = a.count; } catch (e) {}
  const top = (facts && facts.top_activity) ? facts.top_activity : 'a session';
  if (rec != null && rec < 34) return { key: 'recovery_low', title: 'Ease off today', body: 'Your recovery is low (' + Math.round(rec) + '%). Keep it light — a walk or some mobility, not a hard session.', icon: 'self_improvement' };
  if (rec != null && rec >= 67 && actToday === 0) return { key: 'recovery_high', title: "You're primed today", body: "Recovery's high (" + Math.round(rec) + '%). Great day to push — up for ' + top + '?', icon: 'bolt' };
  if (actToday === 0 && facts && facts.at_risk) return { key: 'nudge_back', title: 'Quick one today?', body: "It's been " + facts.last_active_days + ' days. You usually love ' + top + ' — even 20 minutes counts.', icon: 'directions_run' };
  if (actToday === 0 && facts && facts.momentum === 'slipping' && facts.last_active_days != null && facts.last_active_days >= 2) return { key: 'momentum', title: 'Keep it rolling', body: 'A short ' + top + ' today keeps your week on track.', icon: 'trending_up' };
  return null;
}

// Social fallback — if no personal nudge fired, turn the top support op into a "support your crew" message.
function socialNudge(ops) {
  const o = (ops && ops.length) ? ops[0] : null; if (!o) return null;
  if (o.kind === 'quiet') return { key: 'social_quiet', title: 'Check on ' + o.name, body: o.name + " has gone quiet (" + o.days + " days). A quick message might be just what they need.", icon: 'waving_hand', link: '/ffp-member-dashboard.html' };
  if (o.kind === 'streak') return { key: 'social_streak', title: 'High-five ' + o.name, body: o.name + ' is on a ' + o.streak + '-day streak — send some encouragement.', icon: 'celebration', link: '/ffp-member-dashboard.html' };
  if (o.kind === 'meetup_fill') return { key: 'social_meetup', title: 'Fill your meet-up', body: '"' + o.title + '" has ' + o.spots + ' spot' + (o.spots > 1 ? 's' : '') + ' left — invite a couple of connections.', icon: 'group_add', link: '/ffp-member-dashboard.html' };
  return null;
}

// Daily nudge cron (Vercel cron, secret-gated). ?only=<member|email> for a safe single test; ?dry=1 to preview without sending.
app.get('/api/cron/coach-nudges', async (req, res) => {
  const secret = process.env.CRON_SECRET || '';
  const auth = req.headers['authorization'] || '';
  if (!(secret && (auth === ('Bearer ' + secret) || req.query.secret === secret))) return res.status(401).json({ error: 'unauthorized' });
  try {
    const only = (req.query.only || '').trim();
    const dry = req.query.dry === '1' || req.query.dry === 'true';
    const today = new Date().toISOString().slice(0, 10);
    // Members with a profile (only they have facts to nudge from).
    let pq = supabase.from('member_coach_profile').select('member_id, facts, support_ops, last_nudge_at, last_nudge_key');
    if (only && only.indexOf('@') === -1) pq = pq.eq('member_id', only);
    const { data: profiles } = await pq;
    // Member opt-in / status / email lookup.
    const ids = (profiles || []).map(function (p) { return p.member_id; });
    const memMap = {};
    if (ids.length) { try { const { data: mems } = await supabase.from('members').select('id, email, preferences, role, status').in('id', ids); (mems || []).forEach(function (m) { memMap[m.id] = m; }); } catch (e) {} }
    let sent = 0, skipped = 0; const preview = [];
    for (let i = 0; i < (profiles || []).length; i++) {
      const p = profiles[i]; const m = memMap[p.member_id];
      if (!m || m.role !== 'member' || m.status !== 'active') { skipped++; continue; }
      if (only && only.indexOf('@') > -1 && m.email !== only) { skipped++; continue; }
      const prefs = m.preferences || {};
      if (prefs.no_coach_nudges === true) { skipped++; continue; }
      if (p.last_nudge_at && String(p.last_nudge_at).slice(0, 10) === today) { skipped++; continue; }  // already nudged today
      let n = await evalCoachNudge(p.member_id, p.facts || {});
      if (!n) n = socialNudge(p.support_ops || []);
      if (!n) { skipped++; continue; }
      preview.push({ member_id: p.member_id, key: n.key, title: n.title, body: n.body });
      if (!dry) {
        try { await notifyMember(p.member_id, { title: n.title, body: n.body, icon: n.icon, link: '/ffp-member-dashboard.html' }); } catch (e) {}
        try { await supabase.from('member_coach_profile').update({ last_nudge_at: new Date().toISOString(), last_nudge_key: n.key }).eq('member_id', p.member_id); } catch (e) {}
        sent++;
      }
    }
    return res.json({ success: true, dry: dry, sent: sent, skipped: skipped, candidates: preview });
  } catch (e) { return res.status(500).json({ error: e.message }); }
});

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
  + (d.coach_note ? '<tr><td style="padding:18px 30px 0;"><table role="presentation" width="100%" style="background:rgba(255,204,0,.10);border:1px solid rgba(255,204,0,.32);border-radius:14px;"><tr><td style="padding:16px 18px;"><div style="font-size:11px;color:'+C.yellow+';letter-spacing:1.5px;text-transform:uppercase;font-weight:800;margin-bottom:6px;">Grant&#39;s note</div><div style="font-size:13.5px;color:'+C.white+';line-height:1.6;">'+d.coach_note+'</div></td></tr></table></td></tr>' : '')
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
      // Grant's coaching note — one short, specific, encouraging line built from THIS member's week (Haiku, cheap).
      d.coach_note = '';
      try {
        if (ANTHROPIC_KEY) {
          var firstNm = String(m.given_names || m.full_name || 'there').split(' ')[0];
          // Coach memory — refresh + read this member's living profile so the note is personal (recovery, cadence, what they love).
          var _cp = null; try { _cp = await computeCoachProfile(m.id); } catch (e) {}
          var _cpCtx = _cp ? (' Your memory of them: ' + (_cp.summary || '') + ' Facts(JSON): ' + JSON.stringify(_cp.facts || {}).slice(0, 400)) : '';
          var csys = 'You are Grant from FFP, a warm, encouraging fitness coach. Write ONE short coaching note (max 2 sentences, ~35 words, NO emojis) about this member\'s past week. Use what you remember about them, reference a real number, celebrate a win, and give ONE concrete suggestion for next week. Speak directly to them as "you".';
          var cusr = 'Member first name: ' + firstNm + '. This week — meetups hosted ' + ((d.meetups && d.meetups.hosted) || 0) + ', joined ' + ((d.meetups && d.meetups.joined) || 0) + '; new connections ' + ((d.connections && d.connections.new_this_week) || 0) + '; new venues ' + ((d.places && d.places.venues_new) || 0) + ', new cities ' + ((d.places && d.places.cities_new) || 0) + '; tier ' + (d.tier || 'member') + '. Fitness rankings (JSON): ' + JSON.stringify(d.rankings || []).slice(0, 600) + '.' + _cpCtx;
          var cr = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' }, signal: AbortSignal.timeout(25000), body: JSON.stringify({ model: WORKOUT_MODEL, max_tokens: 120, system: csys, messages: [{ role: 'user', content: cusr }] }) });
          var cj = await cr.json();
          if (cr.ok) { d.coach_note = ((cj.content || []).map(function (b) { return b.text || ''; }).join('')).trim(); }
        }
      } catch (e) {}
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
