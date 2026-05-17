const { v4: uuid } = require('uuid');
const prisma         = require('../utils/prisma');
const { sendTextMessage, sendDocumentMessage, sendImageMessage } = require('../services/whatsappService');
const { generateReplySuggestions, analyseSentiment, scoreIntent, scoreReplyQuality, detectLanguage } = require('../services/aiService');

// GET /messages?leadId=
const getMessages = async (req, res, next) => {
  try {
    const { leadId, page = 1, limit = 50 } = req.query;
    if (!leadId) return res.status(400).json({ error: 'leadId is required' });
    const messages = await prisma.message.findMany({
      where: { businessId: req.business.id, leadId },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * Number(limit),
      take: Number(limit),
    });
    res.json(messages);
  } catch (err) { next(err); }
};

// POST /messages/send
const sendMessage = async (req, res, next) => {
  try {
    const { leadId, content, type = 'text', mediaUrl, isAiGenerated = false } = req.body;
    if (!leadId || !content) return res.status(400).json({ error: 'leadId and content are required' });

    const lead = await prisma.lead.findFirst({ where: { id: leadId, businessId: req.business.id } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    // Send via WhatsApp
    let waResult;
    if (type === 'document' && mediaUrl) {
      waResult = await sendDocumentMessage(lead.phone, mediaUrl, 'catalogue.pdf', content);
    } else if (type === 'image' && mediaUrl) {
      waResult = await sendImageMessage(lead.phone, mediaUrl, content);
    } else {
      waResult = await sendTextMessage(lead.phone, content);
    }

    // Score quality if AI generated
    let aiScore = null;
    if (isAiGenerated) {
      aiScore = await scoreReplyQuality(content, `Lead: ${lead.name}`).catch(() => null);
    }

    const message = await prisma.message.create({
      data: {
        id: uuid(), businessId: req.business.id,
        leadId, direction: 'outgoing', content, type,
        status: waResult.status, isAiGenerated,
        agentId: req.agentId || null, aiScore,
      }
    });

    // Update lead last contacted
    await prisma.lead.update({
      where: { id: leadId },
      data: { lastContactedAt: new Date(), updatedAt: new Date() }
    });

    res.status(201).json({ message, whatsapp: waResult });
  } catch (err) { next(err); }
};

// POST /messages/ai-suggestions
const getAiSuggestions = async (req, res, next) => {
  try {
    const { leadId } = req.body;
    if (!leadId) return res.status(400).json({ error: 'leadId is required' });

    const lead = await prisma.lead.findFirst({ where: { id: leadId, businessId: req.business.id } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const business = await prisma.business.findUnique({
      where: { id: req.business.id },
      select: { name: true, whatsappNumber: true }
    });
    const history = await prisma.message.findMany({
      where: { leadId }, orderBy: { createdAt: 'asc' }, take: 15
    });

    const suggestions = await generateReplySuggestions(
      history, { businessName: business.name }, lead.language || 'english'
    );
    const intentScore = await scoreIntent(history);

    // Update intent score on lead
    await prisma.lead.update({ where: { id: leadId }, data: { intentScore } });

    res.json({ suggestions, intentScore, language: lead.language || 'english' });
  } catch (err) { next(err); }
};

// POST /messages/auto-reply (called by webhook internally)
const processAutoReply = async (businessId, leadId, incomingText) => {
  try {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, businessId } });
    if (!lead) return;

    const history = await prisma.message.findMany({
      where: { leadId }, orderBy: { createdAt: 'asc' }, take: 15
    });
    const business = await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } });
    const suggestions = await generateReplySuggestions(history, { businessName: business.name }, lead.language || 'english');

    const reply = suggestions[0];
    const waResult = await sendTextMessage(lead.phone, reply);

    await prisma.message.create({
      data: {
        id: uuid(), businessId, leadId, direction: 'outgoing',
        content: reply, type: 'text', status: waResult.status, isAiGenerated: true
      }
    });
  } catch (err) { console.error('[AUTO-REPLY ERROR]', err.message); }
};

// GET /messages/inbox — grouped by lead with last message
const getInbox = async (req, res, next) => {
  try {
    const { status = 'active' } = req.query;
    const leads = await prisma.lead.findMany({
      where: { businessId: req.business.id, status },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { messages: true } }
      }
    });
    const inbox = leads.map(l => ({
      leadId: l.id, name: l.name, phone: l.phone,
      stage: l.stage, intentScore: l.intentScore,
      lastMessage: l.messages[0] || null,
      messageCount: l._count.messages,
      updatedAt: l.updatedAt
    }));
    res.json(inbox);
  } catch (err) { next(err); }
};

module.exports = { getMessages, sendMessage, getAiSuggestions, processAutoReply, getInbox };
