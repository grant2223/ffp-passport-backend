// FFP Passport — Calorie Log API
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// POST /api/calorie/save — save or update today's log
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { member_id, log_date, meals, exercise, cal_target, total_in, total_burned } = req.body;
  if (!member_id || !log_date) return res.status(400).json({ error: 'member_id and log_date required' });

  const { data, error } = await supabase
    .from('calorie_logs')
    .upsert({
      member_id, log_date,
      meals:        meals        || [],
      exercise:     exercise     || [],
      cal_target:   cal_target   || 2500,
      total_in:     total_in     || 0,
      total_burned: total_burned || 0,
      updated_at:   new Date().toISOString()
    }, { onConflict: 'member_id,log_date' })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, data });
}
