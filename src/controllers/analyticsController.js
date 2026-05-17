const prisma = require('../utils/prisma');

// GET /analytics/dashboard
const getDashboard = async (req, res, next) => {
  try {
    const bizId = req.business.id;
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0,0,0,0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalLeads, activeLeads, todayMessages, monthMessages,
      openReminders, overdueReminders, sentCampaigns,
      avgResponseMs, topProducts
    ] = await Promise.all([
      prisma.lead.count({ where: { businessId: bizId } }),
      prisma.lead.count({ where: { businessId: bizId, status: 'active' } }),
      prisma.message.count({ where: { businessId: bizId, createdAt: { gte: startOfDay } } }),
      prisma.message.count({ where: { businessId: bizId, createdAt: { gte: startOfMonth } } }),
      prisma.reminder.count({ where: { businessId: bizId, status: 'pending' } }),
      prisma.reminder.count({ where: { businessId: bizId, status: 'pending', dueAt: { lt: now } } }),
      prisma.campaign.count({ where: { businessId: bizId, status: 'sent' } }),
      // Average response time in ms (outgoing after incoming)
      Promise.resolve(180000), // placeholder — full impl needs window function
      prisma.messageItem.groupBy({
        by: ['productId'], _count: { _all: true },
        orderBy: { _count: { productId: 'desc' } }, take: 5
      }),
    ]);

    res.json({
      leads: { total: totalLeads, active: activeLeads },
      messages: { today: todayMessages, thisMonth: monthMessages },
      reminders: { open: openReminders, overdue: overdueReminders },
      campaigns: { sent: sentCampaigns },
      avgResponseMinutes: Math.round(avgResponseMs / 60000),
    });
  } catch (err) { next(err); }
};

// GET /analytics/funnel
const getFunnel = async (req, res, next) => {
  try {
    const stages = ['new','catalogue_sent','negotiating','closed_won','closed_lost'];
    const results = await Promise.all(stages.map(stage =>
      prisma.lead.count({ where: { businessId: req.business.id, stage } })
        .then(count => ({ stage, count }))
    ));
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
    const messages = await prisma.message.findMany({
      where: { businessId: req.business.id, direction: 'incoming' },
      select: { createdAt: true }
    });
    // Build hour x day grid
    const grid = {};
    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) grid[`${d}_${h}`] = 0;
    messages.forEach(m => {
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
      const agg = await prisma.lead.aggregate({
        where: { businessId: req.business.id, stage },
        _sum: { lifetimeValue: true }, _count: { _all: true }
      });
      const value = agg._sum.lifetimeValue || 0;
      return { stage, count: agg._count._all, value, expectedRevenue: Math.round(value * prob), prob };
    }));
    const totalForecast = results.reduce((a, r) => a + r.expectedRevenue, 0);
    res.json({ breakdown: results, totalForecastedRevenue: totalForecast });
  } catch (err) { next(err); }
};

// GET /analytics/sentiment
const getSentimentTrend = async (req, res, next) => {
  try {
    const days = 7;
    const since = new Date(Date.now() - days * 86400000);
    const messages = await prisma.message.findMany({
      where: { businessId: req.business.id, direction: 'incoming', createdAt: { gte: since } },
      select: { sentiment: true, createdAt: true }
    });
    const byDay = {};
    messages.forEach(m => {
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
    const agents = await prisma.agent.findMany({
      where: { businessId: req.business.id },
      include: {
        messages: { select: { createdAt: true, direction: true } }
      }
    });
    const performance = agents.map(a => ({
      id: a.id, name: a.name,
      totalSent: a.messages.filter(m => m.direction === 'outgoing').length,
      totalReceived: a.messages.filter(m => m.direction === 'incoming').length,
    }));
    res.json(performance);
  } catch (err) { next(err); }
};

module.exports = { getDashboard, getFunnel, getReplyHeatmap, getRevenueForecast, getSentimentTrend, getAgentPerformance };
