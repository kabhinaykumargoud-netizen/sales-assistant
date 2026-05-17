const { v4: uuid } = require('uuid');
const prisma = require('../utils/prisma');
const { parseWebhookPayload, markMessageRead } = require('../services/whatsappService');
const { detectLanguage, analyseSentiment, scoreIntent } = require('../services/aiService');
const { processAutoReply } = require('./messageController');

// GET /webhook — WhatsApp verification handshake
const verifyWebhook = (req, res) => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    console.log('[WEBHOOK] Verification successful');
    return res.status(200).send(challenge);
  }
  return res.status(403).json({ error: 'Verification failed' });
};

// POST /webhook — incoming messages
const handleWebhook = async (req, res) => {
  // Always respond 200 immediately (WhatsApp requirement)
  res.sendStatus(200);

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const parsed = parseWebhookPayload(body);
    if (!parsed || !parsed.text) return;

    const { from, text, name, messageId, timestamp } = parsed;

    // Find which business owns this WhatsApp number
    const business = await prisma.business.findFirst({
      where: { whatsappNumber: from }
    });

    // For demo: use first business if whatsappNumber not set up
    const biz = business || await prisma.business.findFirst({});
    if (!biz) return;

    // Find or create lead
    let lead = await prisma.lead.findFirst({ where: { phone: from, businessId: biz.id } });
    if (!lead) {
      const language = await detectLanguage(text);
      lead = await prisma.lead.create({
        data: {
          id: uuid(), businessId: biz.id,
          name, phone: from, language, stage: 'new', status: 'active', source: 'whatsapp'
        }
      });
    }

    // Detect language & sentiment in background
    const [sentiment, language] = await Promise.all([
      analyseSentiment(text),
      lead.language ? Promise.resolve(lead.language) : detectLanguage(text)
    ]);

    // Store incoming message
    const message = await prisma.message.create({
      data: {
        id: uuid(), businessId: biz.id, leadId: lead.id,
        direction: 'incoming', content: text, type: 'text',
        status: 'received', sentiment, intentScore: 0,
        createdAt: timestamp
      }
    });

    // Score intent from full history
    const history = await prisma.message.findMany({
      where: { leadId: lead.id }, orderBy: { createdAt: 'asc' }, take: 15
    });
    const intentScore = await scoreIntent(history);

    // Update lead
    await prisma.lead.update({
      where: { id: lead.id },
      data: { intentScore, language, lastContactedAt: new Date(), updatedAt: new Date() }
    });

    // Mark as read on WhatsApp
    await markMessageRead(messageId);

    // Auto-reply if intent is clear enough and business has auto-reply on
    // (in production this would check a settings flag)
    if (intentScore < 85) {
      // Only auto-reply for low-confidence messages; high intent = human should step in
      await processAutoReply(biz.id, lead.id, text);
    }

    console.log(`[WEBHOOK] Message from ${from} (${name}), intent: ${intentScore}, sentiment: ${sentiment}`);
  } catch (err) {
    console.error('[WEBHOOK ERROR]', err.message);
  }
};

module.exports = { verifyWebhook, handleWebhook };
