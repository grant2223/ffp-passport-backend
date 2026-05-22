// FFP Passport — Auth API (Vercel Serverless Functions)
// Deploy to Vercel: vercel deploy

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY   // service key for server-side writes
);

// ── Email transporter (uses any SMTP — Resend recommended) ───────────────────
const mailer = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,     // smtp.resend.com
  port:   465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,     // resend api key
    pass: process.env.SMTP_PASS,
  }
});

// Generate a 6-digit code and hash it for storage
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
        To sign in: enter your email + this 6-digit code at passport.findFitpeople.com
        <br/>This code does not expire until you reset it.
      </p>

      <div style="margin-top:32px;padding-top:24px;border-top:1px solid rgba(43,168,224,.1);font-size:11px;color:#6a90a8;">
        FFP Passport · UAE 2026 · findFitpeople.com
      </div>
    </div>
  `;

  await mailer.sendMail({
    from: '"FFP Passport" <noreply@findFitpeople.com>',
    to: email,
    subject,
    html
  });
}

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
export async function signup(req, res) {
  const { email, full_name, role = 'member' } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  // Check if already exists
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
    .insert({ email, full_name, access_code: hash, role, passport_no })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });

  await sendCodeEmail(email, full_name, code, 'signup');

  res.json({ success: true, message: 'Account created. Check your email for your access code.' });
}

// ── POST /api/auth/signin ─────────────────────────────────────────────────────
export async function signin(req, res) {
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

  // Update last login
  await supabase.from('members').update({ last_login: new Date() }).eq('id', member.id);

  // Create a Supabase session token (or your own JWT)
  const token = crypto.randomBytes(32).toString('hex');

  // Store session (simplified — in prod use proper JWT or Supabase session)
  await supabase.from('members').update({ 
    last_login: new Date().toISOString() 
  }).eq('id', member.id);

  res.json({
    success: true,
    token,
    member: {
      id:          member.id,
      email:       member.email,
      full_name:   member.full_name,
      passport_no: member.passport_no,
      role:        member.role,
      points:      member.points,
    },
    redirect: member.role === 'admin' ? '/ffp-admin.html'
             : member.role === 'provider' ? '/ffp-provider.html'
             : '/ffp-member-dashboard.html'
  });
}

// ── POST /api/auth/reset ──────────────────────────────────────────────────────
export async function reset(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });

  const { data: member } = await supabase
    .from('members')
    .select('id, full_name')
    .eq('email', email)
    .single();

  // Always respond success (don't reveal if email exists)
  if (!member) return res.json({ success: true, message: 'If that email exists, a new code has been sent.' });

  const { code, hash } = generateCode();
  await supabase.from('members').update({ access_code: hash }).eq('id', member.id);
  await sendCodeEmail(email, member.full_name, code, 'reset');

  res.json({ success: true, message: 'New code sent. Your old code no longer works.' });
}
