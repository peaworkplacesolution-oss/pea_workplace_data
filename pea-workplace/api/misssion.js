const period = getBangkokPeriod();
const today = getBangkokDate();

const { data: plan } = await supabase
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
    .maybeSingle();