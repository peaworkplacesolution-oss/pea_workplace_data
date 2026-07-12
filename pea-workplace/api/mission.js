import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getBangkokDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

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

function isActiveToday(mission, today) {
  if (mission.start_date && today < mission.start_date) {
    return false;
  }

  if (mission.end_date && today > mission.end_date) {
    return false;
  }

  return true;
}

export default async function handler(req, res) {
  try {
    const today = getBangkokDate();
    const period = getBangkokPeriod();

    // ==========================================
    // 1. Mission แบบทำครั้งเดียวตลอดแคมเปญ
    // URL อยู่ใน mission_config
    // ==========================================
    const { data: onceMissions, error: onceError } = await supabase
      .from('mission_config')
      .select(`
        mission_id,
        mission_name,
        mission_type,
        mission_url,
        survey_id,
        score,
        detail,
        start_date,
        end_date
      `)
      .eq('enabled', true)
      .eq('mission_type', 'mission_once');

    if (onceError) {
      throw onceError;
    }

    const activeOnceMissions = (onceMissions || [])
      .filter((mission) => {
        return (
          isActiveToday(mission, today) &&
          Boolean(mission.mission_url)
        );
      })
      .map((mission) => ({
        mission_id: mission.mission_id,
        mission_name: mission.mission_name,
        mission_type: mission.mission_type,
        mission_url: mission.mission_url,
        survey_id: mission.survey_id,
        score: mission.score,
        detail: mission.detail
      }));

    // ==========================================
    // 2. Mission แบบเช้า-บ่าย
    // URL อยู่ใน mission_plan
    // ==========================================
    const { data: periodPlans, error: periodError } = await supabase
      .from('mission_plan')
      .select(`
        mission_id,
        survey_id,
        mission_url,
        mission_config!inner (
          mission_name,
          mission_type,
          enabled,
          score,
          detail,
          start_date,
          end_date
        )
      `)
      .eq('show_date', today)
      .eq('period', period)
      .eq('mission_config.enabled', true)
      .eq('mission_config.mission_type', 'mission_period');

    if (periodError) {
      throw periodError;
    }

    const activePeriodMissions = (periodPlans || [])
      .filter((plan) => {
        const config = plan.mission_config;

        return (
          config &&
          isActiveToday(config, today) &&
          Boolean(plan.mission_url)
        );
      })
      .map((plan) => ({
        mission_id: plan.mission_id,
        mission_name: plan.mission_config.mission_name,
        mission_type: plan.mission_config.mission_type,
        mission_url: plan.mission_url,
        survey_id: plan.survey_id,
        score: plan.mission_config.score,
        detail: plan.mission_config.detail
      }));

    const missions = [
      ...activeOnceMissions,
      ...activePeriodMissions
    ];

    return res.json({
      enabled: missions.length > 0,
      date: today,
      period,
      missions
    });

  } catch (error) {
    console.error('mission API error:', error);

    return res.status(500).json({
      enabled: false,
      status: 'server_error',
      message: error.message
    });
  }
}