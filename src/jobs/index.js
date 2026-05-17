const cron  = require('node-cron');
const supabase = require('../utils/supabase');
const { sendTextMessage } = require('../services/whatsappService');
const { generateFollowUp } = require('../services/aiService');
const { v4: uuid } = require('uuid');

// ── Job 1: Re-engagement drip (runs every hour) ───────────────────────────
const dripJob = cron.schedule('0 * * * *', async () => {
  console.log('[JOB] Running drip sequence check...');
  try {
    const cutoffs = [
      { days: 3,  label: 'day3' },
      { days: 7,  label: 'day7' },
      { days: 14, label: 'day14' },
    ];
    for (const { days, label } of cutoffs) {
      const since = new Date(Date.now() - days * 86400000).toISOString();
      const until = new Date(Date.now() - days * 86400000 + 3600000).toISOString();
      
      const { data: coldLeads, error } = await supabase
        .from('Lead')
        .select('*')
        .eq('status', 'active')
        .in('stage', ['new', 'catalogue_sent'])
        .gte('lastContactedAt', since)
        .lt('lastContactedAt', until)
        .lt('updatedAt', since)
        .limit(50);
        
      if (error) continue;

      for (const lead of (coldLeads || [])) {
        try {
          const msg = await generateFollowUp(
            lead.name,
            `Re-engagement ${label} — customer has not responded in ${days} days`,
            lead.language || 'english'
          );
          const result = await sendTextMessage(lead.phone, msg);
          
          await supabase.from('Message').insert([{
            id: uuid(), businessId: lead.businessId, leadId: lead.id,
            direction: 'outgoing', content: msg, type: 'text',
            status: result.status, isAiGenerated: true
          }]);
          
          await supabase.from('Lead').update({ lastContactedAt: new Date().toISOString() }).eq('id', lead.id);
          
          console.log(`[DRIP] Sent ${label} to ${lead.name} (${lead.phone})`);
        } catch (e) { console.error(`[DRIP ERROR] ${lead.id}:`, e.message); }
      }
    }
  } catch (err) { console.error('[DRIP JOB ERROR]', err.message); }
}, { scheduled: false });

// ── Job 2: Scheduled campaigns (runs every 5 minutes) ───────────────────────
const campaignJob = cron.schedule('*/5 * * * *', async () => {
  try {
    const now = new Date().toISOString();
    
    const { data: due, error } = await supabase
      .from('Campaign')
      .select('*')
      .eq('status', 'scheduled')
      .lte('scheduledAt', now);
      
    if (error) throw error;

    for (const campaign of (due || [])) {
      console.log(`[JOB] Sending scheduled campaign: ${campaign.name}`);
      
      const { data: leads } = await supabase
        .from('Lead')
        .select('*')
        .eq('businessId', campaign.businessId)
        .eq('status', 'active')
        .limit(500);
        
      let sent = 0;
      for (const lead of (leads || [])) {
        try {
          const msg = campaign.content.replace('{{name}}', lead.name);
          await sendTextMessage(lead.phone, msg);
          sent++;
        } catch {}
      }
      
      await supabase
        .from('Campaign')
        .update({ status: 'sent', sentAt: new Date().toISOString(), sentCount: sent })
        .eq('id', campaign.id);
        
      console.log(`[JOB] Campaign "${campaign.name}" sent to ${sent} leads`);
    }
  } catch (err) { console.error('[CAMPAIGN JOB ERROR]', err.message); }
}, { scheduled: false });

// ── Job 3: Reminder alerts (runs every 30 minutes) ──────────────────────────
const reminderJob = cron.schedule('*/30 * * * *', async () => {
  try {
    const soon = new Date(Date.now() + 30 * 60000).toISOString();
    const now = new Date().toISOString();
    
    const { data: upcoming, error } = await supabase
      .from('Reminder')
      .select('*, lead:Lead(name)')
      .eq('status', 'pending')
      .lte('dueAt', soon)
      .gte('dueAt', now);
      
    if (error) throw error;

    for (const r of (upcoming || [])) {
      const leadName = Array.isArray(r.lead) ? r.lead[0]?.name : r.lead?.name;
      console.log(`[REMINDER] Due soon: "${r.title}" for lead ${leadName}`);
      // In production: push notification to seller's dashboard via WebSocket
    }
  } catch (err) { console.error('[REMINDER JOB ERROR]', err.message); }
}, { scheduled: false });

// ── Job 4: Do-not-disturb flush (runs at 8:01 AM daily) ─────────────────────
const dndFlushJob = cron.schedule('1 8 * * *', async () => {
  console.log('[JOB] DND flush — sending queued messages');
  // In production: flush queued messages from a DND queue table
  // Placeholder: log intent
  console.log('[JOB] DND flush complete');
}, { scheduled: false });

// ── Job 5: Daily analytics snapshot (runs at midnight) ──────────────────────
const analyticsJob = cron.schedule('0 0 * * *', async () => {
  console.log('[JOB] Daily analytics snapshot');
  try {
    const { data: businesses } = await supabase.from('Business').select('id');
    
    for (const biz of (businesses || [])) {
      const getCount = async (table, filter) => {
        let q = supabase.from(table).select('id', { count: 'exact', head: true }).eq('businessId', biz.id);
        if (filter) q = filter(q);
        const { count } = await q;
        return count || 0;
      };

      const [leads, messages, conversions] = await Promise.all([
        getCount('Lead'),
        getCount('Message'),
        getCount('Lead', q => q.eq('stage', 'closed_won')),
      ]);
      console.log(`[ANALYTICS] Biz ${biz.id}: ${leads} leads, ${messages} msgs, ${conversions} won`);
    }
  } catch (err) { console.error('[ANALYTICS JOB ERROR]', err.message); }
}, { scheduled: false });

const startJobs = () => {
  dripJob.start();
  campaignJob.start();
  reminderJob.start();
  dndFlushJob.start();
  analyticsJob.start();
  console.log('⏰  Background jobs started:');
  console.log('    • Drip sequences    — every hour');
  console.log('    • Scheduled campaigns — every 5 min');
  console.log('    • Reminder alerts   — every 30 min');
  console.log('    • DND flush         — daily 8:01 AM');
  console.log('    • Analytics snapshot — daily midnight');
};

module.exports = { startJobs };
