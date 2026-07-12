import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getBangkokPeriod() {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      hour12: false
    }).format(new Date())
  );

  return hour < 14 ? 'morning' : 'noon';
}

function getBangkokDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'method_not_allowed' });
  }

  try {
    const { empId } = req.body;

    if (!empId) {
      return res.status(400).json({ status: 'missing_emp_id' });
    }

    const { data: employee } = await supabase
      .from('employees')
      .select('emp_id')
      .eq('emp_id', empId)
      .single();

    if (!employee) {
      return res.json({ status: 'notfound' });
    }

    const period = getBangkokPeriod();
    const activityDate = getBangkokDate();

    const { error: logError } = await supabase
      .from('activity_logs')
      .insert({
        emp_id: empId,
        activity_date: activityDate,
        period,
        activity_type: 'video',
        mission_id: null,
        external_result_id: null,
        score: 1,
        detail: 'วิดีโอ'
      });

    if (logError) {
      if (logError.code === '23505') {
        return res.json({
          status: period === 'morning' ? 'limitmorning' : 'limitnoon'
        });
      }

      console.error(logError);
      return res.status(500).json({ status: 'db_error' });
    }

    const { error: rpcError } = await supabase.rpc('increment_employee_score', {
      input_emp_id: empId
    });

    if (rpcError) {
      console.error(rpcError);
      return res.status(500).json({ status: 'score_update_error' });
    }

    return res.json({ status: 'success' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: 'server_error' });
  }
}