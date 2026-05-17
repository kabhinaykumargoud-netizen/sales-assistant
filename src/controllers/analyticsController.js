const supabase = require('../utils/supabase');

// GET /analytics/dashboard
const getDashboard = async (req, res, next) => {
  try {
    const bizId = req.business.id;
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0,0,0,0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const getCount = async (table, builder) => {
      let q = supabase.from(table).select('*', { count: 'exact', head: true }).eq('businessId', bizId);
      if (builder) q = builder(q);
      const { count } = await q;
      return count || 0;
    };

    const [
      totalLeads, activeLeads, todayMessages, monthMessages,
      openReminders, overdueReminders, sentCampaigns
    ] = await Promise.all([
      getCount('Lead'),
      getCount('Lead', q => q.eq('status', 'active')),
      getCount('Message', q => q.gte('createdAt', startOfDay.toISOString())),
      getCount('Message', q => q.gte('createdAt', startOfMonth.toISOString())),
      getCount('Reminder', q => q.eq('status', 'pending')),
      getCount('Reminder', q => q.eq('status', 'pending').lt('dueAt', now.toISOString())),
      getCount('Campaign', q => q.eq('status', 'sent'))
    ]);

    res.json({
      leads: { total: totalLeads, active: activeLeads },
      messages: { today: todayMessages, thisMonth: monthMessages },
      reminders: { open: openReminders, overdue: overdueReminders },
      campaigns: { sent: sentCampaigns },
      avgResponseMinutes: Math.round(180000 / 60000),
    });
  } catch (err) { next(err); }
};

// GET /analytics/funnel
const getFunnel = async (req, res, next) => {
  try {
    const stages = ['new','catalogue_sent','negotiating','closed_won','closed_lost'];
    const results = await Promise.all(stages.map(async (stage) => {
      const { count } = await supabase.from('Lead')
        .select('*', { count: 'exact', head: true })
        .eq('businessId', req.business.id)
        .eq('stage', stage);
      return { stage, count: count || 0 };
    }));
    const total = results.find(r => r.stage === 'new')?.count || 1;
    const funnel = results.map(r => ({
      ...r,
      conversionRate: ((r.count / total) * 100).toFixed(1) + '%'
    }));
    res.json(funnel);
  } catch (err) { next(err); }
};

// GET /analytics/heatmap — reply patterns by hour/day
const getReplyHeatmap = async (req, res, next) => {
  try {
    const { data: messages, error } = await supabase
      .from('Message')
      .select('createdAt')
      .eq('businessId', req.business.id)
      .eq('direction', 'incoming');
      
    if (error) throw error;

    // Build hour x day grid
    const grid = {};
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) grid[`${d}_${h}`] = 0;
    
    (messages || []).forEach(m => {
      const d = new Date(m.createdAt).getDay();
      const h = new Date(m.createdAt).getHours();
      grid[`${d}_${h}`] = (grid[`${d}_${h}`] || 0) + 1;
    });
    
    const heatmap = Object.entries(grid).map(([key, count]) => {
      const [d, h] = key.split('_').map(Number);
      return { day: days[d], hour: h, count };
    });
    const peak = heatmap.sort((a,b) => b.count - a.count).slice(0, 5);
    res.json({ heatmap, peakTimes: peak });
  } catch (err) { next(err); }
};

// GET /analytics/revenue
const getRevenueForecast = async (req, res, next) => {
  try {
    const stages = [
      { stage: 'new',            prob: 0.10 },
      { stage: 'catalogue_sent', prob: 0.25 },
      { stage: 'negotiating',    prob: 0.60 },
      { stage: 'closed_won',     prob: 1.00 },
    ];
    
    const results = await Promise.all(stages.map(async ({ stage, prob }) => {
      const { data, count } = await supabase
        .from('Lead')
        .select('lifetimeValue', { count: 'exact' })
        .eq('businessId', req.business.id)
        .eq('stage', stage);
        
      const value = (data || []).reduce((sum, lead) => sum + (lead.lifetimeValue || 0), 0);
      return { stage, count: count || 0, value, expectedRevenue: Math.round(value * prob), prob };
    }));
    
    const totalForecast = results.reduce((a, r) => a + r.expectedRevenue, 0);
    res.json({ breakdown: results, totalForecastedRevenue: totalForecast });
  } catch (err) { next(err); }
};

// GET /analytics/sentiment
const getSentimentTrend = async (req, res, next) => {
  try {
    const days = 7;
    const since = new Date(Date.now() - days * 86400000).toISOString();
    
    const { data: messages, error } = await supabase
      .from('Message')
      .select('sentiment, createdAt')
      .eq('businessId', req.business.id)
      .eq('direction', 'incoming')
      .gte('createdAt', since);
      
    if (error) throw error;

    const byDay = {};
    (messages || []).forEach(m => {
      const day = new Date(m.createdAt).toISOString().split('T')[0];
      if (!byDay[day]) byDay[day] = { positive:0, neutral:0, hesitant:0, frustrated:0 };
      if (m.sentiment) byDay[day][m.sentiment] = (byDay[day][m.sentiment] || 0) + 1;
    });
    res.json(Object.entries(byDay).map(([date, counts]) => ({ date, ...counts })));
  } catch (err) { next(err); }
};

// GET /analytics/agents
const getAgentPerformance = async (req, res, next) => {
  try {
    const { data: agents, error } = await supabase
      .from('Agent')
      .select('id, name, messages(createdAt, direction)')
      .eq('businessId', req.business.id);
      
    if (error) throw error;

    const performance = (agents || []).map(a => {
      const msgs = a.messages || [];
      return {
        id: a.id, name: a.name,
        totalSent: msgs.filter(m => m.direction === 'outgoing').length,
        totalReceived: msgs.filter(m => m.direction === 'incoming').length,
      };
    });
    res.json(performance);
  } catch (err) { next(err); }
};

module.exports = { getDashboard, getFunnel, getReplyHeatmap, getRevenueForecast, getSentimentTrend, getAgentPerformance };
