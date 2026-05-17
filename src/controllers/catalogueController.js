const { v4: uuid } = require('uuid');
const supabase = require('../utils/supabase');
const { sendDocumentMessage, sendTextMessage } = require('../services/whatsappService');
const { generateInvoiceText } = require('../services/aiService');

// GET /catalogue — all active products formatted for sharing
const getCatalogue = async (req, res, next) => {
  try {
    const { category } = req.query;
    let query = supabase.from('Product').select('*').eq('businessId', req.business.id).eq('isActive', true).order('category').order('name');
    if (category) query = query.eq('category', category);
    
    const { data: products, error } = await query;
    if (error) throw error;
    
    // Group by category
    const grouped = (products || []).reduce((acc, p) => {
      const cat = p.category || 'General';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(p);
      return acc;
    }, {});
    res.json({ catalogue: grouped, totalProducts: (products || []).length });
  } catch (err) { next(err); }
};

// POST /catalogue/share — send catalogue to a lead via WhatsApp
const shareCatalogue = async (req, res, next) => {
  try {
    const { leadId, productIds, message } = req.body;
    if (!leadId) return res.status(400).json({ error: 'leadId is required' });

    const { data: lead, error: leadErr } = await supabase.from('Lead').select('*').eq('id', leadId).eq('businessId', req.business.id).single();
    if (leadErr || !lead) return res.status(404).json({ error: 'Lead not found' });

    let products = [];
    if (productIds?.length) {
      const { data } = await supabase.from('Product').select('*').in('id', productIds).eq('businessId', req.business.id);
      products = data || [];
    } else {
      const { data } = await supabase.from('Product').select('*').eq('businessId', req.business.id).eq('isActive', true).limit(20);
      products = data || [];
    }

    const catalogueText = buildCatalogueText(products, message || `Hi ${lead.name}! Here's our catalogue:`);
    const result = await sendTextMessage(lead.phone, catalogueText);

    // Save message
    const { data: msg, error: msgErr } = await supabase.from('Message').insert([{
      id: uuid(), businessId: req.business.id, leadId,
      direction: 'outgoing', content: catalogueText, type: 'catalogue',
      status: result.status, isAiGenerated: false
    }]).select().single();
    if (msgErr) throw msgErr;

    // Move lead stage to catalogue_sent
    if (lead.stage === 'new') {
      await supabase.from('Lead').update({ stage: 'catalogue_sent', updatedAt: new Date().toISOString() }).eq('id', leadId);
      await supabase.from('StageHistory').insert([{
        id: uuid(), leadId, fromStage: 'new', toStage: 'catalogue_sent', reason: 'Catalogue shared'
      }]);
    }

    res.json({ message: msg, productsShared: products.length });
  } catch (err) { next(err); }
};

// POST /catalogue/invoice
const generateInvoice = async (req, res, next) => {
  try {
    const { leadId, items } = req.body;
    if (!leadId || !items?.length) return res.status(400).json({ error: 'leadId and items are required' });

    const { data: lead, error: leadErr } = await supabase.from('Lead').select('*').eq('id', leadId).eq('businessId', req.business.id).single();
    if (leadErr || !lead) return res.status(404).json({ error: 'Lead not found' });

    const productIds = items.map(i => i.productId);
    const { data: products } = await supabase.from('Product').select('*').in('id', productIds);
    
    const enriched = items.map(i => {
      const p = (products || []).find(p => p.id === i.productId);
      return { name: p?.name || 'Item', qty: i.quantity || 1, price: p?.price || 0 };
    });
    const subtotal = enriched.reduce((a, i) => a + i.price * i.qty, 0);
    const invoice = await generateInvoiceText(lead, enriched, subtotal);

    // Send invoice via WhatsApp
    await sendTextMessage(lead.phone, invoice);

    // Update lead lifetime value
    const gst = subtotal * 0.18;
    const currentLtv = lead.lifetimeValue || 0;
    const currentOrders = lead.orderCount || 0;
    
    await supabase.from('Lead').update({
      lifetimeValue: currentLtv + subtotal + gst,
      orderCount: currentOrders + 1,
      stage: 'closed_won', 
      updatedAt: new Date().toISOString()
    }).eq('id', leadId);

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
