const { v4: uuid } = require('uuid');
const prisma = require('../utils/prisma');
const { detectLanguage, scoreIntent } = require('../services/aiService');

// GET /leads
const getLeads = async (req, res, next) => {
  try {
    const { stage, status, search, sortBy = 'updatedAt', order = 'desc', page = 1, limit = 20 } = req.query;
    const where = {
      businessId: req.business.id,
      ...(stage  && { stage }),
      ...(status && { status }),
      ...(search && {
        OR: [
          { name:  { contains: search } },
          { phone: { contains: search } },
        ]
      })
    };
    const [leads, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { [sortBy]: order },
        skip: (page - 1) * Number(limit),
        take: Number(limit),
        include: {
          _count: { select: { messages: true, reminders: true } }
        }
      }),
      prisma.lead.count({ where })
    ]);
    res.json({ leads, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) { next(err); }
};

// GET /leads/:id
const getLead = async (req, res, next) => {
  try {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, businessId: req.business.id },
      include: {
        messages:      { orderBy: { createdAt: 'asc' }, take: 50 },
        reminders:     { where: { status: 'pending' }, orderBy: { dueAt: 'asc' } },
        stageHistory:  { orderBy: { changedAt: 'desc' } },
        enquiries:     { orderBy: { createdAt: 'desc' } },
      }
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (err) { next(err); }
};

// POST /leads
const createLead = async (req, res, next) => {
  try {
    const { name, phone, notes, tags, source, assignedAgentId } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'name and phone are required' });
    const lead = await prisma.lead.create({
      data: {
        id: uuid(), businessId: req.business.id,
        name, phone, notes, tags, source, assignedAgentId,
        stage: 'new', status: 'active'
      }
    });
    res.status(201).json(lead);
  } catch (err) { next(err); }
};

// PATCH /leads/:id
const updateLead = async (req, res, next) => {
  try {
    const allowed = ['name','phone','notes','tags','status','lostReason','assignedAgentId'];
    const data = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: { ...data, updatedAt: new Date() }
    });
    res.json(lead);
  } catch (err) { next(err); }
};

// DELETE /leads/:id
const deleteLead = async (req, res, next) => {
  try {
    await prisma.lead.delete({ where: { id: req.params.id } });
    res.json({ message: 'Lead deleted' });
  } catch (err) { next(err); }
};

// POST /leads/:id/stage
const moveStage = async (req, res, next) => {
  try {
    const { stage, reason } = req.body;
    const validStages = ['new','catalogue_sent','negotiating','closed_won','closed_lost'];
    if (!validStages.includes(stage))
      return res.status(400).json({ error: `stage must be one of: ${validStages.join(', ')}` });

    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id, businessId: req.business.id }
    });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const [updated] = await prisma.$transaction([
      prisma.lead.update({
        where: { id: lead.id },
        data: { stage, updatedAt: new Date(), lastContactedAt: new Date() }
      }),
      prisma.stageHistory.create({
        data: { id: uuid(), leadId: lead.id, fromStage: lead.stage, toStage: stage, reason }
      })
    ]);
    res.json(updated);
  } catch (err) { next(err); }
};

// GET /leads/pipeline/summary
const pipelineSummary = async (req, res, next) => {
  try {
    const stages = ['new','catalogue_sent','negotiating','closed_won','closed_lost'];
    const results = await Promise.all(
      stages.map(stage =>
        prisma.lead.aggregate({
          where: { businessId: req.business.id, stage },
          _count: { _all: true },
          _sum:  { lifetimeValue: true }
        }).then(r => ({ stage, count: r._count._all, value: r._sum.lifetimeValue || 0 }))
      )
    );
    const total = results.reduce((a, s) => a + s.value, 0);
    const forecast = results
      .map(s => {
        const prob = { new:0.1, catalogue_sent:0.25, negotiating:0.6, closed_won:1, closed_lost:0 };
        return s.value * (prob[s.stage] || 0);
      })
      .reduce((a, v) => a + v, 0);

    res.json({ stages: results, totalPipelineValue: total, revenueForecasted: Math.round(forecast) });
  } catch (err) { next(err); }
};

// POST /leads/:id/tag-lost
const tagLost = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const lead = await prisma.lead.update({
      where: { id: req.params.id },
      data: { stage: 'closed_lost', status: 'lost', lostReason: reason, updatedAt: new Date() }
    });
    res.json(lead);
  } catch (err) { next(err); }
};

module.exports = { getLeads, getLead, createLead, updateLead, deleteLead, moveStage, pipelineSummary, tagLost };
