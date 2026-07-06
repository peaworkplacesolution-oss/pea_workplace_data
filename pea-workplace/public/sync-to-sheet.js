import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
            return res.status(401).json({ status: 'unauthorized' });
        }

        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_CLIENT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });

        const sheets = google.sheets({ version: 'v4', auth });

        // =========================
        // 1) Sync activity_logs
        // =========================
        const { data: logsData, error: logsError } = await supabase
            .from('activity_logs')
            .select(`
        id,
        emp_id,
        activity_date,
        period,
        score,
        detail
      `)
            .eq('synced_to_sheet', false)
            .order('id', { ascending: true })
            .limit(1000);

        if (logsError) throw logsError;

        let syncedLogs = 0;

        if (logsData && logsData.length > 0) {
            const logValues = logsData.map(row => [
                row.id,
                row.emp_id,
                row.activity_date,
                row.period,
                row.score,
                row.detail
            ]);

            await sheets.spreadsheets.values.append({
                spreadsheetId: process.env.GOOGLE_SHEET_ID,
                range: 'activity_logs!A:F',
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: logValues
                }
            });

            const ids = logsData.map(row => row.id);

            const { error: updateError } = await supabase
                .from('activity_logs')
                .update({
                    synced_to_sheet: true,
                    synced_at: new Date().toISOString()
                })
                .in('id', ids);

            if (updateError) throw updateError;

            syncedLogs = logsData.length;
        }

        // =========================
        // 2) Sync employee_dashboard
        // =========================
        const { data: dashboardData, error: dashboardError } = await supabase
            .from('employee_dashboard')
            .select('*')
            .order('rank_all', { ascending: true });

        if (dashboardError) throw dashboardError;

        const dashboardValues = dashboardData.map(row => [
            row.emp_id,
            row.prefix || '',
            row.first_name || '',
            row.last_name || '',
            row.department || '',
            row.region || '',
            row.position || '',
            row.full_department || '',
            row.sex || '',
            row.age || '',
            row.total_score || 0,
            row.total_join || 0,
            row.rank_all || '',
            row.rank_region || '',
            row.rank_department || ''
        ]);

        await sheets.spreadsheets.values.clear({
            spreadsheetId: process.env.GOOGLE_SHEET_ID,
            range: 'employee_dashboard!A2:O'
        });

        if (dashboardValues.length > 0) {
            await sheets.spreadsheets.values.update({
                spreadsheetId: process.env.GOOGLE_SHEET_ID,
                range: 'employee_dashboard!A2',
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: dashboardValues
                }
            });
        }

        return res.json({
            status: 'success',
            synced_logs: syncedLogs,
            synced_dashboard: dashboardValues.length
        });

    } catch (err) {
        return res.status(500).json({
            status: 'sync_error',
            message: err.message
        });
    }
}