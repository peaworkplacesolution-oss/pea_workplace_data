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

function isDateWithinMission(today, startDate, endDate) {
    if (startDate && today < startDate) return false;
    if (endDate && today > endDate) return false;
    return true;
}

function getEmployeeId(item) {
    return String(
        item.employee_id ??
        item.personal_id ??
        item.respondent_id ??
        ''
    ).trim();
}

function getCreatedTime(item) {
    const time = new Date(item.created_at || item.update_at || 0).getTime();

    return Number.isNaN(time) ? 0 : time;
}

function removeDuplicateEmployees(results) {
    const uniqueResults = new Map();

    for (const item of results) {
        const empId = getEmployeeId(item);

        if (!empId) continue;

        const existing = uniqueResults.get(empId);

        if (!existing) {
            uniqueResults.set(empId, item);
            continue;
        }

        // เก็บผลตอบครั้งแรกของพนักงานในรอบนั้น
        if (getCreatedTime(item) < getCreatedTime(existing)) {
            uniqueResults.set(empId, item);
        }
    }

    return Array.from(uniqueResults.entries()).map(([empId, item]) => ({
        emp_id: empId,
        external_result_id: String(item.id)
    }));
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({
            status: 'method_not_allowed'
        });
    }

    try {
        const authHeader = req.headers.authorization;

        if (
            !process.env.SURVEY_SYNC_SECRET ||
            authHeader !== `Bearer ${process.env.SURVEY_SYNC_SECRET}`
        ) {
            return res.status(401).json({
                status: 'unauthorized'
            });
        }

        const requestedPeriod = String(req.body?.period || '').trim();

        if (!['morning', 'noon'].includes(requestedPeriod)) {
            return res.status(400).json({
                status: 'invalid_period'
            });
        }

        const today = getBangkokDate();

        /*
          mission_config ใช้ mission_type
          activity_logs ใช้ activity_type
        */
        const { data: missions, error: missionError } = await supabase
            .from('mission_config')
            .select(`
                mission_id,
                mission_name,
                mission_type,
                enabled,
                survey_id,
                mission_url,
                api_key,
                score,
                detail,
                start_date,
                end_date
            `)
            .eq('enabled', true);

        if (missionError) {
            throw missionError;
        }

        const activeMissions = (missions || []).filter((mission) =>
            isDateWithinMission(
                today,
                mission.start_date,
                mission.end_date
            )
        );

        if (activeMissions.length === 0) {
            return res.json({
                status: 'no_active_mission',
                date: today,
                period: requestedPeriod
            });
        }

        const summaries = [];

        for (const mission of activeMissions) {
            let surveyId;
            let missionUrl;
            let apiKey;

            if (mission.mission_type === 'mission_once') {
                surveyId = mission.survey_id;
                missionUrl = mission.mission_url;
                apiKey = mission.api_key;
            }

            if (mission.mission_type === 'mission_period') {
                const { data: plan, error: planError } = await supabase
                    .from('mission_plan')
                    .select('survey_id, mission_url, api_key')
                    .eq('mission_id', mission.mission_id)
                    .eq('show_date', today)
                    .eq('period', requestedPeriod)
                    .maybeSingle();

                if (planError) {
                    throw planError;
                }

                if (!plan) {
                    summaries.push({
                        mission_id: mission.mission_id,
                        status: 'no_plan_for_period'
                    });

                    continue;
                }

                surveyId = plan.survey_id;
                missionUrl = plan.mission_url;
                apiKey = plan.api_key;
            }

            if (!surveyId || !apiKey) {
                summaries.push({
                    mission_id: mission.mission_id,
                    status: 'incomplete_mission_config'
                });

                continue;
            }
            const xchoResponse = await fetch(
                `https://xcho.pea.co.th/api/external/results/${encodeURIComponent(surveyId)}`,
                {
                    method: 'GET',
                    headers: {
                        'X-API-Key': apiKey,
                        Accept: 'application/json'
                    }
                }
            );
            let xchoData;

            try {
                xchoData = await xchoResponse.json();
            } catch {
                summaries.push({
                    mission_id: mission.mission_id,
                    status: 'invalid_xcho_response',
                    http_status: xchoResponse.status
                });

                continue;
            }

            if (!xchoResponse.ok || xchoData.success !== true) {
                summaries.push({
                    mission_id: mission.mission_id,
                    status: 'xcho_api_error',
                    http_status: xchoResponse.status,
                    response: xchoData
                });

                continue;
            }

            const rawResults = Array.isArray(xchoData.data)
                ? xchoData.data
                : [];

            /*
              จาก response ที่คุณทดสอบ:
              status = 31 คือผลที่ส่งสำเร็จ
              is_deleted = false คือยังใช้งานอยู่
            */
            const completedResults = rawResults.filter((item) => {
                const empId = getEmployeeId(item);

                return (
                    empId !== '' &&
                    item.is_deleted !== true &&
                    Number(item.status) === 31
                );
            });

            const resultsForDatabase =
                removeDuplicateEmployees(completedResults);

            if (resultsForDatabase.length === 0) {
                summaries.push({
                    mission_id: mission.mission_id,
                    survey_id: surveyId,
                    status: 'success',
                    fetched: rawResults.length,
                    unique_completed: 0,
                    inserted: 0
                });

                continue;
            }

            /*
              เรียก PostgreSQL function:
              process_mission_results()
      
              mission.mission_type จะถูกนำไปบันทึกใน
              activity_logs.activity_type
            */
            const { data: insertedCount, error: rpcError } =
                await supabase.rpc('process_mission_results', {
                    input_results: resultsForDatabase,
                    input_mission_id: mission.mission_id,
                    input_activity_type: mission.mission_type,
                    input_activity_date: today,
                    input_period: requestedPeriod,
                    input_score: mission.score || 1,
                    input_detail: mission.detail
                });

            if (rpcError) {
                summaries.push({
                    mission_id: mission.mission_id,
                    status: 'database_process_error',
                    message: rpcError.message
                });

                continue;
            }

            summaries.push({
                mission_id: mission.mission_id,
                mission_name: mission.mission_name,
                mission_type: mission.mission_type,
                survey_id: plan.survey_id,
                date: today,
                period: requestedPeriod,
                status: 'success',
                fetched: rawResults.length,
                unique_completed: resultsForDatabase.length,
                inserted: insertedCount || 0
            });
        }

        return res.json({
            status: 'success',
            date: today,
            period: requestedPeriod,
            missions: summaries
        });

    } catch (error) {
        console.error('syncSurvey error:', error);

        return res.status(500).json({
            status: 'server_error',
            message: error.message
        });
    }
}