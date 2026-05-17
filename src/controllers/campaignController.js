const { v4: uuid } = require('uuid');
const supabase = require('../utils/supabase');
const { sendTextMessage } = require('../services/whatsappService');

// GET /campaigns
const getCampaigns = async (req, res, next) => {
  try {
    const { data: campaigns, error } = await supabase
      .from('Campaign')
      .select('*')
      .eq('businessId', req.business.id)
      .order('createdAt', { ascending: false });
      
    if (error) throw error;
    res.json(campaigns);
  } catch (err) { next(err); }
};

// POST /campaigns
const createCampaign = async (req, res, next) => {
  try {
    const { name, type, content, segment, scheduledAt } = req.body;
    if (!name || !content) return res.status(400).json({ error: 'name and content are required' });
    
    const { data: campaign, error } = await supabase
      .from('Campaign')
      .insert([{
        id: uuid(), businessId: req.business.id,
        name, type: type || 'broadcast', content, segment,
        status: scheduledAt ? 'scheduled' : 'draft',
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null
      }])
      .select()
      .single();
      
    if (error) throw error;
    res.status(201).json(campaign);
  } catch (err) { next(err); }
};

// POST /campaigns/:id/send  — send immediately
const sendCampaign = async (req, res, next) => {
  try {
    const { data: campaign, error: cError } = await supabase
      .from('Campaign')
      .select('*')
      .eq('id', req.params.id)
      .eq('businessId', req.business.id)
      .single();
      
    if (cError || !campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.status === 'sent') return res.status(400).json({ error: 'Campaign already sent' });

    // Fetch leads with segment filter
    let query = supabase.from('Lead').select('*').eq('businessId', req.business.id).eq('status', 'active');
    query = applySegmentFilter(query, campaign.segment);
    
    const { data: leads, error: lError } = await query;
    if (lError) throw lError;

    let sent = 0;
    const errors = [];
    for (const lead of (leads || [])) {
      try {
        const personalised = campaign.content.replace('{{name}}', lead.name);
        await sendTextMessage(lead.phone, personalised);
        sent++;
      } catch (e) {
        errors.push({ leadId: lead.id, error: e.message });
      }
    }

    const { data: updated, error: uError } = await supabase
      .from('Campaign')
      .update({ status: 'sent', sentAt: new Date().toISOString(), sentCount: sent })
      .eq('id', campaign.id)
      .select()
      .single();
      
    if (uError) throw uError;
    res.json({ campaign: updated, sent, errors });
  } catch (err) { next(err); }
};

// POST /campaigns/flash-sale
const createFlashSale = async (req, res, next) => {
  try {
    const { productId, discountPercent, expiresInHours = 24, segment } = req.body;
    const { data: product, error: pError } = await supabase
      .from('Product')
      .select('*')
      .eq('id', productId)
      .eq('businessId', req.business.id)
      .single();
      
    if (pError || !product) return res.status(404).json({ error: 'Product not found' });

    const salePrice = Math.round(product.price * (1 - discountPercent / 100));
    const expiresAt = new Date(Date.now() + expiresInHours * 3600000);
    const content = `🔥 FLASH SALE! Hi {{name}}, get "${product.name}" at ₹${salePrice} (${discountPercent}% off)! Offer ends in ${expiresInHours}h. Reply NOW to grab yours! ⏰`;

    const { data: campaign, error } = await supabase
      .from('Campaign')
      .insert([{
        id: uuid(), businessId: req.business.id,
        name: `Flash Sale - ${product.name}`, type: 'flash_sale',
        content, segment, status: 'draft'
      }])
      .select()
      .single();
      
    if (error) throw error;
    res.status(201).json({ campaign, salePrice, expiresAt: expiresAt.toISOString(), content });
  } catch (err) { next(err); }
};

// DELETE /campaigns/:id
const deleteCampaign = async (req, res, next) => {
  try {
    const { error } = await supabase.from('Campaign').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Campaign deleted' });
  } catch (err) { next(err); }
};

function applySegmentFilter(query, segment) {
  if (!segment) return query;
  if (segment === 'hot') return query.gte('intentScore', 80);
  if (segment === 'warm') return query.gte('intentScore', 40).lt('intentScore', 80);
  if (segment === 'cold') return query.lt('intentScore', 40);
  if (segment === 'new') return query.eq('stage', 'new');
  if (segment === 'negotiating') return query.eq('stage', 'negotiating');
  return query;
}

module.exports = { getCampaigns, createCampaign, sendCampaign, createFlashSale, deleteCampaign };
