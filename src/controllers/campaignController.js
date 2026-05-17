const { v4: uuid } = require('uuid');
const prisma = require('../utils/prisma');
const { sendTextMessage } = require('../services/whatsappService');

// GET /campaigns
const getCampaigns = async (req, res, next) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { businessId: req.business.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json(campaigns);
  } catch (err) { next(err); }
};

// POST /campaigns
const createCampaign = async (req, res, next) => {
  try {
    const { name, type, content, segment, scheduledAt } = req.body;
    if (!name || !content) return res.status(400).json({ error: 'name and content are required' });
    const campaign = await prisma.campaign.create({
      data: {
        id: uuid(), businessId: req.business.id,
        name, type: type || 'broadcast', content, segment,
        status: scheduledAt ? 'scheduled' : 'draft',
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null
      }
    });
    res.status(201).json(campaign);
  } catch (err) { next(err); }
};

// POST /campaigns/:id/send  — send immediately
const sendCampaign = async (req, res, next) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, businessId: req.business.id }
    });
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.status === 'sent') return res.status(400).json({ error: 'Campaign already sent' });

    // Parse segment filter
    const segmentFilter = parseSegment(campaign.segment);
    const leads = await prisma.lead.findMany({
      where: { businessId: req.business.id, status: 'active', ...segmentFilter }
    });

    let sent = 0;
    const errors = [];
    for (const lead of leads) {
      try {
        const personalised = campaign.content.replace('{{name}}', lead.name);
        await sendTextMessage(lead.phone, personalised);
        sent++;
      } catch (e) {
        errors.push({ leadId: lead.id, error: e.message });
      }
    }

    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'sent', sentAt: new Date(), sentCount: sent }
    });
    res.json({ campaign: updated, sent, errors });
  } catch (err) { next(err); }
};

// POST /campaigns/flash-sale
const createFlashSale = async (req, res, next) => {
  try {
    const { productId, discountPercent, expiresInHours = 24, segment } = req.body;
    const product = await prisma.product.findFirst({ where: { id: productId, businessId: req.business.id } });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const salePrice = Math.round(product.price * (1 - discountPercent / 100));
    const expiresAt = new Date(Date.now() + expiresInHours * 3600000);
    const content = `🔥 FLASH SALE! Hi {{name}}, get "${product.name}" at ₹${salePrice} (${discountPercent}% off)! Offer ends in ${expiresInHours}h. Reply NOW to grab yours! ⏰`;

    const campaign = await prisma.campaign.create({
      data: {
        id: uuid(), businessId: req.business.id,
        name: `Flash Sale - ${product.name}`, type: 'flash_sale',
        content, segment, status: 'draft'
      }
    });
    res.status(201).json({ campaign, salePrice, expiresAt, content });
  } catch (err) { next(err); }
};

// DELETE /campaigns/:id
const deleteCampaign = async (req, res, next) => {
  try {
    await prisma.campaign.delete({ where: { id: req.params.id } });
    res.json({ message: 'Campaign deleted' });
  } catch (err) { next(err); }
};

function parseSegment(segment) {
  if (!segment) return {};
  const map = {
    'hot':    { intentScore: { gte: 80 } },
    'warm':   { intentScore: { gte: 40, lt: 80 } },
    'cold':   { intentScore: { lt: 40 } },
    'new':    { stage: 'new' },
    'negotiating': { stage: 'negotiating' },
  };
  return map[segment] || {};
}

module.exports = { getCampaigns, createCampaign, sendCampaign, createFlashSale, deleteCampaign };
