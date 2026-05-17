const { v4: uuid } = require('uuid');
const prisma = require('../utils/prisma');
const { sendDocumentMessage } = require('../services/whatsappService');
const { generateInvoiceText } = require('../services/aiService');

// GET /catalogue — all active products formatted for sharing
const getCatalogue = async (req, res, next) => {
  try {
    const { category } = req.query;
    const products = await prisma.product.findMany({
      where: { businessId: req.business.id, isActive: true, ...(category && { category }) },
      orderBy: [{ category: 'asc' }, { name: 'asc' }]
    });
    // Group by category
    const grouped = products.reduce((acc, p) => {
      const cat = p.category || 'General';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(p);
      return acc;
    }, {});
    res.json({ catalogue: grouped, totalProducts: products.length });
  } catch (err) { next(err); }
};

// POST /catalogue/share — send catalogue to a lead via WhatsApp
const shareCatalogue = async (req, res, next) => {
  try {
    const { leadId, productIds, message } = req.body;
    if (!leadId) return res.status(400).json({ error: 'leadId is required' });

    const lead = await prisma.lead.findFirst({ where: { id: leadId, businessId: req.business.id } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const products = productIds?.length
      ? await prisma.product.findMany({ where: { id: { in: productIds }, businessId: req.business.id } })
      : await prisma.product.findMany({ where: { businessId: req.business.id, isActive: true }, take: 20 });

    const catalogueText = buildCatalogueText(products, message || `Hi ${lead.name}! Here's our catalogue:`);
    const { sendTextMessage } = require('../services/whatsappService');
    const result = await sendTextMessage(lead.phone, catalogueText);

    // Save message
    const msg = await prisma.message.create({
      data: {
        id: uuid(), businessId: req.business.id, leadId,
        direction: 'outgoing', content: catalogueText, type: 'catalogue',
        status: result.status, isAiGenerated: false
      }
    });

    // Move lead stage to catalogue_sent
    const prevLead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (prevLead.stage === 'new') {
      await prisma.$transaction([
        prisma.lead.update({ where: { id: leadId }, data: { stage: 'catalogue_sent', updatedAt: new Date() } }),
        prisma.stageHistory.create({ data: { id: uuid(), leadId, fromStage: 'new', toStage: 'catalogue_sent', reason: 'Catalogue shared' } })
      ]);
    }

    res.json({ message: msg, productsShared: products.length });
  } catch (err) { next(err); }
};

// POST /catalogue/invoice
const generateInvoice = async (req, res, next) => {
  try {
    const { leadId, items } = req.body;
    if (!leadId || !items?.length) return res.status(400).json({ error: 'leadId and items are required' });

    const lead = await prisma.lead.findFirst({ where: { id: leadId, businessId: req.business.id } });
    if (!lead) return res.status(404).json({ error: 'Lead not found' });

    const productIds = items.map(i => i.productId);
    const products = await prisma.product.findMany({ where: { id: { in: productIds } } });
    const enriched = items.map(i => {
      const p = products.find(p => p.id === i.productId);
      return { name: p?.name || 'Item', qty: i.quantity || 1, price: p?.price || 0 };
    });
    const subtotal = enriched.reduce((a, i) => a + i.price * i.qty, 0);
    const invoice = await generateInvoiceText(lead, enriched, subtotal);

    // Send invoice via WhatsApp
    const { sendTextMessage } = require('../services/whatsappService');
    await sendTextMessage(lead.phone, invoice);

    // Update lead lifetime value
    const gst = subtotal * 0.18;
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        lifetimeValue: { increment: subtotal + gst },
        orderCount: { increment: 1 },
        stage: 'closed_won', updatedAt: new Date()
      }
    });

    res.json({ invoice, subtotal, gst: Math.round(gst), total: Math.round(subtotal + gst) });
  } catch (err) { next(err); }
};

function buildCatalogueText(products, header) {
  const lines = [header, ''];
  const grouped = products.reduce((a, p) => { (a[p.category||'General'] = a[p.category||'General']||[]).push(p); return a; }, {});
  Object.entries(grouped).forEach(([cat, items]) => {
    lines.push(`📦 *${cat}*`);
    items.forEach(p => {
      const price = p.discountPrice ? `~~₹${p.price}~~ ₹${p.discountPrice}` : `₹${p.price}`;
      lines.push(`• ${p.name} — ${price}${p.stock < 5 ? ' ⚠️ Low stock' : ''}`);
    });
    lines.push('');
  });
  lines.push('Reply with product name + quantity to order! 🛒');
  return lines.join('\n');
}

module.exports = { getCatalogue, shareCatalogue, generateInvoice };
