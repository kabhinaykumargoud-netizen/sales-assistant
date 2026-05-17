const { v4: uuid } = require('uuid');
const prisma = require('../utils/prisma');

const getAgents = async (req, res, next) => {
  try {
    const agents = await prisma.agent.findMany({
      where: { businessId: req.business.id },
      include: { _count: { select: { messages: true } } }
    });
    res.json(agents);
  } catch (err) { next(err); }
};

const createAgent = async (req, res, next) => {
  try {
    const { name, email, role = 'agent' } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'name and email are required' });
    const agent = await prisma.agent.create({
      data: { id: uuid(), businessId: req.business.id, name, email, role }
    });
    res.status(201).json(agent);
  } catch (err) { next(err); }
};

const deleteAgent = async (req, res, next) => {
  try {
    await prisma.agent.delete({ where: { id: req.params.id } });
    res.json({ message: 'Agent removed' });
  } catch (err) { next(err); }
};

// PATCH /leads/:leadId/assign
const assignLead = async (req, res, next) => {
  try {
    const { agentId } = req.body;
    const lead = await prisma.lead.update({
      where: { id: req.params.leadId },
      data: { assignedAgentId: agentId }
    });
    res.json(lead);
  } catch (err) { next(err); }
};

module.exports = { getAgents, createAgent, deleteAgent, assignLead };
