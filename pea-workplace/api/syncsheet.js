// import { createClient } from '@supabase/supabase-js';
// import crypto from 'crypto';

// const supabase = createClient(
//     process.env.SUPABASE_URL,
//     process.env.SUPABASE_SERVICE_ROLE_KEY
// );

// function base64Url(input) {
//     return Buffer.from(input)
//         .toString('base64')
//         .replace(/=/g, '')
//         .replace(/\+/g, '-')
//         .replace(/\//g, '_');
// }

// async function getGoogleAccessToken() {
//     const now = Math.floor(Date.now() / 1000);

//     const header = {
//         alg: 'RS256',
//         typ: 'JWT'
//     };

//     const payload = {
//         iss: process.env.GOOGLE_CLIENT_EMAIL,
//         scope: 'https://www.googleapis.com/auth/spreadsheets',
//         aud: 'https://oauth2.googleapis.com/token',
//         exp: now + 3600,
//         iat: now
//     };

//     const unsignedToken =
//         base64Url(JSON.stringify(header)) + '.' + base64Url(JSON.stringify(payload));

//     const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

//     const signature = crypto.sign(
//         'RSA-SHA256',
//         Buffer.from(unsignedToken),
//         privateKey
//     );

//     const jwt = unsignedToken + '.' + base64Url(signature);

//     const response = await fetch('https://oauth2.googleapis.com/token', {
//         method: 'POST',
//         headers: {
//             'Content-Type': 'application/x-www-form-urlencoded'
//         },
//         body: new URLSearchParams({
//             grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
//             assertion: jwt
//         })
//     });

//     const data = await response.json();

//     if (!response.ok) {
//         throw new Error(JSON.stringify(data));
//     }

//     return data.access_token;
// }

// async function sheetsRequest(path, method, body) {
//     const accessToken = await getGoogleAccessToken();

//     const response = await fetch(
//         `https://sheets.googleapis.com/v4/spreadsheets/${process.env.GOOGLE_SHEET_ID}${path}`,
//         {
//             method,
//             headers: {
//                 Authorization: `Bearer ${accessToken}`,
//                 'Content-Type': 'application/json'
//             },
//             body: body ? JSON.stringify(body) : undefined
//         }
//     );

//     const data = await response.json();

//     if (!response.ok) {
//         throw new Error(JSON.stringify(data));
//     }

//     return data;
// }

// export default async function handler(req, res) {
//     try {
//         // เปิดใช้ทีหลัง ตอนทดสอบให้ปิดไว้ก่อน
//         // const authHeader = req.headers.authorization;
//         // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
//         //   return res.status(401).json({ status: 'unauthorized' });
//         // }

//         const { data: logsData, error: logsError } = await supabase
//             .from('activity_logs')
//             .select('id, emp_id, activity_date, period, score, detail')
//             .eq('synced_to_sheet', false)
//             .order('id', { ascending: true })
//             .limit(1000);

//         if (logsError) throw logsError;

//         let syncedLogs = 0;

//         if (logsData && logsData.length > 0) {
//             const logValues = logsData.map(row => [
//                 row.id,
//                 row.emp_id,
//                 row.activity_date,
//                 row.period,
//                 row.score,
//                 row.detail
//             ]);

//             await sheetsRequest(
//                 `/values/${encodeURIComponent('activity_logs!A:F')}:append?valueInputOption=USER_ENTERED`,
//                 'POST',
//                 {
//                     values: logValues
//                 }
//             );

//             const ids = logsData.map(row => row.id);

//             const { error: updateError } = await supabase
//                 .from('activity_logs')
//                 .update({
//                     synced_to_sheet: true,
//                     synced_at: new Date().toISOString()
//                 })
//                 .in('id', ids);

//             if (updateError) throw updateError;

//             syncedLogs = logsData.length;
//         }

//         const { data: dashboardData, error: dashboardError } = await supabase
//             .from('employee_dashboard')
//             .select('*')
//             .order('rank_all', { ascending: true });

//         if (dashboardError) throw dashboardError;

//         const dashboardValues = dashboardData.map(row => [
//             row.emp_id,
//             row.prefix || '',
//             row.first_name || '',
//             row.last_name || '',
//             row.department || '',
//             row.region || '',
//             row.position || '',
//             row.full_department || '',
//             row.sex || '',
//             row.age || '',
//             row.total_score || 0,
//             row.total_join || 0,
//             row.rank_all || '',
//             row.rank_region || '',
//             row.rank_department || ''
//         ]);

//         await sheetsRequest(
//             `/values/${encodeURIComponent('employee_dashboard!A2:O')}:clear`,
//             'POST',
//             {}
//         );

//         const chunkSize = 5000;

//         for (let i = 0; i < dashboardValues.length; i += chunkSize) {
//             const chunk = dashboardValues.slice(i, i + chunkSize);
//             const startRow = i + 2;

//             await sheetsRequest(
//                 `/values/${encodeURIComponent(`employee_dashboard!A${startRow}`)}?valueInputOption=USER_ENTERED`,
//                 'PUT',
//                 {
//                     values: chunk
//                 }
//             );
//         }

//         return res.json({
//             status: 'success',
//             synced_logs: syncedLogs,
//             synced_dashboard: dashboardValues.length
//         });

//     } catch (err) {
//         return res.status(500).json({
//             status: 'sync_error',
//             message: err.message
//         });
//     }
// }

// export default async function handler(req, res) {
//   return res.json({
//     status: 'sync api found'
//   });
// }

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEFAULT_VIDEO =
    "https://youtu.be/f8tc7Whev64?si=9QHTlcnSsDuX1MIi";

export default async function handler(req, res) {

    const now = new Date();

    const thailandDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Bangkok'
    }).format(now);

    const hour = Number(
        new Intl.DateTimeFormat('en-US', {
            hour: 'numeric',
            hour12: false,
            timeZone: 'Asia/Bangkok'
        }).format(now)
    );

    const period = hour < 14
        ? 'morning'
        : 'noon';

    const { data } = await supabase
        .from('video_plan')
        .select('youtube_url')
        .eq('show_date', thailandDate)
        .eq('period', period)
        .single();

    res.json({
        youtube_url: data
            ? data.youtube_url
            : DEFAULT_VIDEO
    });

}