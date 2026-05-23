// FFP Passport — Express Server (Railway-compatible)
// Updated with profile, member discovery, and meetup endpoints
// Deploy: Push to GitHub, connect to Railway, set environment variables
// v2 - Profile & Meetups

import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import nodemailer from 'nodemailer';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ── Supabase Client ───────────────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ── Email Transporter ────────────────────────────────────────────────────
const mailer = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  }
});

// ── Helper Functions ────────────────────────────────────────────────────
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

// ── Routes ──────────────────────────────────────────────────────────────

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'FFP Passport API running' });
});

// ════════════════════════════════════════════════════════════════════════════
// AUTHENTICATION
// ════════════════════════════════════════════════════════════════════════════

// Signup
app.post('/api/auth/signup', async (req, res) => {
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
      .insert({ email, full_name, access_code: hash, role, passport_no })
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

// Signin
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

    res.json({
      success: true,
      token,
      member: {
        id:              member.id,
        email:           member.email,
        full_name:       member.full_name,
        passport_no:     member.passport_no,
        role:            member.role,
        points:          member.points,
        profile_complete: member.profile_complete,
      },
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

// Reset password
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

// ════════════════════════════════════════════════════════════════════════════
// MEMBER PROFILE
// ════════════════════════════════════════════════════════════════════════════

// Get member profile by ID
app.get('/api/members/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const { data: member, error } = await supabase
      .from('members')
      .select('id, email, full_name, passport_no, photo_url, bio, interests, fitness_level, date_of_birth, gender, points, tier, ambassador_tier, joined_at, visit_count')
      .eq('id', id)
      .single();

    if (error || !member) return res.status(404).json({ error: 'Member not found' });

    res.json({ success: true, member });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update member profile
app.put('/api/members/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      full_name, 
      photo_url, 
      bio, 
      interests, 
      fitness_level, 
      date_of_birth, 
      gender 
    } = req.body;

    const { data: member, error } = await supabase
      .from('members')
      .update({
        full_name: full_name || undefined,
        photo_url: photo_url || undefined,
        bio: bio || undefined,
        interests: interests || undefined,
        fitness_level: fitness_level || undefined,
        date_of_birth: date_of_birth || undefined,
        gender: gender || undefined,
        profile_complete: true
      })
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    res.json({ 
      success: true, 
      message: 'Profile updated',
      member 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all members (for member discovery)
app.get('/api/members', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const { data: members, error } = await supabase
      .from('members')
      .select('id, full_name, photo_url, bio, interests, fitness_level, points, tier, ambassador_tier, visit_count')
      .eq('status', 'active')
      .order('points', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return res.status(500).json({ error: error.message });

    res.json({ 
      success: true, 
      members,
      count: members.length 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// MEETUPS
// ════════════════════════════════════════════════════════════════════════════

// Create meetup
app.post('/api/meetups', async (req, res) => {
  try {
    const { creator_id, title, description, location, date_time, max_attendees = 20 } = req.body;
    
    if (!creator_id || !title || !location || !date_time) {
      return res.status(400).json({ error: 'creator_id, title, location, and date_time required' });
    }

    const { data: meetup, error } = await supabase
      .from('meetups')
      .insert({
        creator_id,
        title,
        description,
        location,
        date_time,
        max_attendees,
        status: 'active'
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    // Auto-add creator as attendee
    await supabase
      .from('meetup_attendees')
      .insert({ meetup_id: meetup.id, member_id: creator_id });

    res.json({ success: true, meetup });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all meetups
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

    // Get attendee count for each meetup
    const meetupsWithAttendees = await Promise.all(
      meetups.map(async (meetup) => {
        const { data: attendees } = await supabase
          .from('meetup_attendees')
          .select('member_id')
          .eq('meetup_id', meetup.id);

        // Get creator info
        const { data: creator } = await supabase
          .from('members')
          .select('id, full_name, photo_url')
          .eq('id', meetup.creator_id)
          .single();

        return {
          ...meetup,
          attendee_count: attendees?.length || 0,
          creator: creator
        };
      })
    );

    res.json({ success: true, meetups: meetupsWithAttendees });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single meetup with attendees
app.get('/api/meetups/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: meetup, error: meetupError } = await supabase
      .from('meetups')
      .select('*')
      .eq('id', id)
      .single();

    if (meetupError || !meetup) return res.status(404).json({ error: 'Meetup not found' });

    // Get attendees with member details
    const { data: attendeeRecords } = await supabase
      .from('meetup_attendees')
      .select('member_id')
      .eq('meetup_id', id);

    const attendeeIds = attendeeRecords?.map(r => r.member_id) || [];

    const { data: attendees } = await supabase
      .from('members')
      .select('id, full_name, photo_url, bio, interests')
      .in('id', attendeeIds);

    // Get creator info
    const { data: creator } = await supabase
      .from('members')
      .select('id, full_name, photo_url')
      .eq('id', meetup.creator_id)
      .single();

    res.json({
      success: true,
      meetup: {
        ...meetup,
        creator,
        attendees,
        attendee_count: attendees?.length || 0
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Join meetup
app.post('/api/meetups/:id/join', async (req, res) => {
  try {
    const { id } = req.params;
    const { member_id } = req.body;

    if (!member_id) return res.status(400).json({ error: 'member_id required' });

    // Check if already joined
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

// Leave meetup
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

// ════════════════════════════════════════════════════════════════════════════
// CALORIE TRACKING
// ════════════════════════════════════════════════════════════════════════════

// Save calorie log
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

// ════════════════════════════════════════════════════════════════════════════
// PROVIDER / QR CODE VISITS
// ════════════════════════════════════════════════════════════════════════════

// Log visit (QR scan)
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

    // Increment visit count on member
    await supabase
      .from('members')
      .update({ visit_count: supabase.raw('visit_count + 1') })
      .eq('id', member_id);

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`FFP Passport API running on http://localhost:${PORT}`);
});
