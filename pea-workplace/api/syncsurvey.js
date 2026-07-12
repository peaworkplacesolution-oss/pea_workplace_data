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
  const time = new Date(
    item.created_at ||
    item.update_at ||
    0
  ).getTime();

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

    /*
      ถ้าพนักงานตอบซ้ำในแบบสำรวจเดียวกัน
      เก็บผลตอบครั้งแรกไว้เป็นหลักฐาน
    */
    if (getCreatedTime(item) < getCreatedTime(existing)) {
      uniqueResults.set(empId, item);
    }
  }

  return Array
    .from(uniqueResults.entries())
    .map(([empId, item]) => ({
      emp_id: empId,
      external_result_id: String(item.id)
    }));
}

export default async function handler(req, res) {
  /*
    รองรับ POST สำหรับ Supabase Cron และ Thunder Client
  */
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

    /*
      ถ้าส่ง period มา เช่นตอนทดสอบ ให้ใช้ค่าที่ส่งมา
      ถ้า Cron ไม่ส่งมา ให้คำนวณจากเวลาไทยอัตโนมัติ
    */
    const requestedPeriod = String(
      req.body?.period || getBangkokPeriod()
    ).trim();

    if (!['morning', 'noon'].includes(requestedPeriod)) {
      return res.status(400).json({
        status: 'invalid_period'
      });
    }

    const today = getBangkokDate();

    /*
      mission_config ใช้ชื่อ mission_type
      activity_logs ใช้ชื่อ activity_type
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
      let surveyId = null;
      let apiKey = null;

      /*
        Mission ทำครั้งเดียวตลอดแคมเปญ:
        survey_id และ api_key อยู่ใน mission_config
      */
      if (mission.mission_type === 'mission_once') {
        surveyId = mission.survey_id;
        apiKey = mission.api_key;
      }

      /*
        Mission เปลี่ยนแบบสำรวจทุกวัน/ทุกช่วง:
        survey_id และ api_key อยู่ใน mission_plan
      */
      else if (mission.mission_type === 'mission_period') {
        const { data: plan, error: planError } = await supabase
          .from('mission_plan')
          .select(`
            survey_id,
            mission_url,
            api_key
          `)
          .eq('mission_id', mission.mission_id)
          .eq('show_date', today)
          .eq('period', requestedPeriod)
          .maybeSingle();

        if (planError) {
          summaries.push({
            mission_id: mission.mission_id,
            status: 'plan_query_error',
            message: planError.message
          });

          continue;
        }

        if (!plan) {
          summaries.push({
            mission_id: mission.mission_id,
            status: 'no_plan_for_period',
            date: today,
            period: requestedPeriod
          });

          continue;
        }

        surveyId = plan.survey_id;
        apiKey = plan.api_key;
      }

      /*
        ข้าม Mission ประเภทอื่นที่ API นี้ยังไม่รองรับ
      */
      else {
        summaries.push({
          mission_id: mission.mission_id,
          status: 'unsupported_mission_type',
          mission_type: mission.mission_type
        });

        continue;
      }

      if (!surveyId || !apiKey) {
        summaries.push({
          mission_id: mission.mission_id,
          status: 'incomplete_mission_config'
        });

        continue;
      }

      const xchoResponse = await fetch(
        `https://xcho.pea.co.th/api/external/results/${encodeURIComponent(
          surveyId
        )}`,
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
        จาก Response ที่ทดสอบ:
        status = 31 คือส่งแบบสำรวจสำเร็จ
        is_deleted = false คือข้อมูลยังใช้งานอยู่
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
          mission_name: mission.mission_name,
          mission_type: mission.mission_type,
          survey_id: surveyId,
          status: 'success',
          fetched: rawResults.length,
          unique_completed: 0,
          inserted: 0
        });

        continue;
      }

      /*
        เรียก PostgreSQL Function process_mission_results

        mission_type จาก mission_config
        จะถูกส่งไปบันทึกใน activity_logs.activity_type
      */
      const { data: insertedCount, error: rpcError } =
        await supabase.rpc('process_mission_results', {
          input_results: resultsForDatabase,
          input_mission_id: mission.mission_id,
          input_activity_type: mission.mission_type,
          input_activity_date: today,
          input_period: requestedPeriod,
          input_score: mission.score ?? 1,
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
        survey_id: surveyId,
        date: today,
        period: requestedPeriod,
        status: 'success',
        fetched: rawResults.length,
        unique_completed: resultsForDatabase.length,
        inserted: insertedCount ?? 0
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