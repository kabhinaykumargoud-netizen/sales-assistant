const { v4: uuid } = require('uuid');
const supabase       = require('../utils/supabase');
const { sendTextMessage, sendDocumentMessage, sendImageMessage } = require('../services/whatsappService');
const { generateReplySuggestions, analyseSentiment, scoreIntent, scoreReplyQuality, detectLanguage } = require('../services/aiService');

// GET /messages?leadId=
const getMessages = async (req, res, next) => {
  try {
    const { leadId, page = 1, limit = 50 } = req.query;
    if (!leadId) return res.status(400).json({ error: 'leadId is required' });
    const pageNum = Number(page);
    const limitNum = Number(limit);

    const { data: messages, error } = await supabase
      .from('Message')
      .select('*')
      .eq('businessId', req.business.id)
      .eq('leadId', leadId)
      .order('createdAt', { ascending: true })
      .range((pageNum - 1) * limitNum, pageNum * limitNum - 1);
      
    if (error) throw error;
    res.json(messages);
  } catch (err) { next(err); }
};

// POST /messages/send
const sendMessage = async (req, res, next) => {
  try {
    const { leadId, content, type = 'text', mediaUrl, isAiGenerated = false } = req.body;
    if (!leadId || !content) return res.status(400).json({ error: 'leadId and content are required' });

    const { data: lead, error: leadErr } = await supabase.from('Lead').select('*').eq('id', leadId).eq('businessId', req.business.id).single();
    if (leadErr || !lead) return res.status(404).json({ error: 'Lead not found' });

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

    const { data: message, error: msgErr } = await supabase
      .from('Message')
      .insert([{
        id: uuid(), businessId: req.business.id,
        leadId, direction: 'outgoing', content, type,
        status: waResult.status, isAiGenerated,
        agentId: req.agentId || null, aiScore,
      }])
      .select()
      .single();
      
    if (msgErr) throw msgErr;

    // Update lead last contacted
    await supabase.from('Lead').update({ lastContactedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }).eq('id', leadId);

    res.status(201).json({ message, whatsapp: waResult });
  } catch (err) { next(err); }
};

// POST /messages/ai-suggestions
const getAiSuggestions = async (req, res, next) => {
  try {
    const { leadId } = req.body;
    if (!leadId) return res.status(400).json({ error: 'leadId is required' });

    const { data: lead, error: leadErr } = await supabase.from('Lead').select('*').eq('id', leadId).eq('businessId', req.business.id).single();
    if (leadErr || !lead) return res.status(404).json({ error: 'Lead not found' });

    const { data: business } = await supabase.from('Business').select('name, whatsappNumber').eq('id', req.business.id).single();
    const { data: history } = await supabase.from('Message').select('*').eq('leadId', leadId).order('createdAt', { ascending: true }).limit(15);

    const suggestions = await generateReplySuggestions(
      history || [], { businessName: business.name }, lead.language || 'english'
    );
    const intentScore = await scoreIntent(history || []);

    // Update intent score on lead
    await supabase.from('Lead').update({ intentScore }).eq('id', leadId);

    res.json({ suggestions, intentScore, language: lead.language || 'english' });
  } catch (err) { next(err); }
};

// POST /messages/auto-reply (called by webhook internally)
const processAutoReply = async (businessId, leadId, incomingText) => {
  try {
    const { data: lead } = await supabase.from('Lead').select('*').eq('id', leadId).eq('businessId', businessId).single();
    if (!lead) return;

    const { data: history } = await supabase.from('Message').select('*').eq('leadId', leadId).order('createdAt', { ascending: true }).limit(15);
    const { data: business } = await supabase.from('Business').select('name').eq('id', businessId).single();
    const suggestions = await generateReplySuggestions(history || [], { businessName: business.name }, lead.language || 'english');

    const reply = suggestions[0];
    const waResult = await sendTextMessage(lead.phone, reply);

    await supabase.from('Message').insert([{
      id: uuid(), businessId, leadId, direction: 'outgoing',
      content: reply, type: 'text', status: waResult.status, isAiGenerated: true
    }]);
  } catch (err) { console.error('[AUTO-REPLY ERROR]', err.message); }
};

// GET /messages/inbox — grouped by lead with last message
const getInbox = async (req, res, next) => {
  try {
    const { status = 'active' } = req.query;
    
    // Fetch leads
    const { data: leads, error } = await supabase
      .from('Lead')
      .select('id, name, phone, stage, intentScore, updatedAt, messages(id, content, direction, createdAt, type)')
      .eq('businessId', req.business.id)
      .eq('status', status)
      .order('updatedAt', { ascending: false })
      .limit(30);
      
    if (error) throw error;

    const inbox = (leads || []).map(l => {
      const msgs = l.messages || [];
      msgs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Sort descending
      return {
        leadId: l.id, name: l.name, phone: l.phone,
        stage: l.stage, intentScore: l.intentScore,
        lastMessage: msgs[0] || null,
        messageCount: msgs.length,
        updatedAt: l.updatedAt
      };
    });
    res.json(inbox);
  } catch (err) { next(err); }
};

module.exports = { getMessages, sendMessage, getAiSuggestions, processAutoReply, getInbox };
