// FFP Passport — Visit / QR Scan API
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// POST /api/visits/log — provider logs a member visit
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { member_id, provider_id, deal_id, visit_type = 'checkin' } = req.body;
  if (!member_id || !provider_id) return res.status(400).json({ error: 'member_id and provider_id required' });

  // Verify member exists and is active
  const { data: member } = await supabase
    .from('members')
    .select('id, full_name, passport_no, status, visit_count, points')
    .eq('id', member_id)
    .single();

  if (!member || member.status !== 'active')
    return res.status(404).json({ error: 'Member not found or inactive' });

  // Log the visit
  await supabase.from('visit_logs').insert({ member_id, provider_id, deal_id, visit_type });

  // Increment visit count + points
  await supabase.from('members').update({
    visit_count: (member.visit_count || 0) + 1,
    points:      (member.points      || 0) + 1
  }).eq('id', member_id);

  res.json({
    success: true,
    member: {
      id:          member.id,
      full_name:   member.full_name,
      passport_no: member.passport_no,
      visit_count: (member.visit_count || 0) + 1,
      points:      (member.points      || 0) + 1,
    }
  });
}
