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