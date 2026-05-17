const { v4: uuid } = require('uuid');
const supabase = require('../utils/supabase');
const { detectLanguage, scoreIntent } = require('../services/aiService');

// GET /leads
const getLeads = async (req, res, next) => {
  try {
    const { stage, status, search, sortBy = 'updatedAt', order = 'desc', page = 1, limit = 20 } = req.query;
    const pageNum = Number(page);
    const limitNum = Number(limit);

    let query = supabase
      .from('Lead')
      .select('*, messages(count), reminders(count)', { count: 'exact' })
      .eq('businessId', req.business.id)
      .order(sortBy, { ascending: order === 'asc' })
      .range((pageNum - 1) * limitNum, pageNum * limitNum - 1);

    if (stage) query = query.eq('stage', stage);
    if (status) query = query.eq('status', status);
    if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);

    const { data: rawLeads, count, error } = await query;
    if (error) throw error;

    const leads = (rawLeads || []).map(l => ({
      ...l,
      _count: {
        messages: l.messages?.[0]?.count || 0,
        reminders: l.reminders?.[0]?.count || 0
      }
    }));

    res.json({ leads, total: count || 0, page: pageNum, pages: Math.ceil((count || 0) / limitNum) });
  } catch (err) { next(err); }
};

// GET /leads/:id
const getLead = async (req, res, next) => {
  try {
    // Supabase JS doesn't easily support multiple nested order bys in one select string without postgrest advanced syntax
    // So we fetch the lead first, then fetch its relations manually or fetch all and sort in JS
    const { data: lead, error } = await supabase
      .from('Lead')
      .select('*, messages(*), reminders(*), stageHistory(*), enquiries(*)')
      .eq('id', req.params.id)
      .eq('businessId', req.business.id)
      .single();
      
    if (error || !lead) return res.status(404).json({ error: 'Lead not found' });

    // Filter and sort relations in JS to match Prisma behavior
    lead.messages = (lead.messages || []).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).slice(0, 50);
    lead.reminders = (lead.reminders || []).filter(r => r.status === 'pending').sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
    lead.stageHistory = (lead.stageHistory || []).sort((a, b) => new Date(b.changedAt) - new Date(a.changedAt));
    lead.enquiries = (lead.enquiries || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(lead);
  } catch (err) { next(err); }
};

// POST /leads
const createLead = async (req, res, next) => {
  try {
    const { name, phone, notes, tags, source, assignedAgentId } = req.body;
    if (!name || !phone) return res.status(400).json({ error: 'name and phone are required' });
    
    const { data: lead, error } = await supabase
      .from('Lead')
      .insert([{
        id: uuid(), businessId: req.business.id,
        name, phone, notes, tags, source, assignedAgentId,
        stage: 'new', status: 'active'
      }])
      .select()
      .single();
      
    if (error) throw error;
    res.status(201).json(lead);
  } catch (err) { next(err); }
};

// PATCH /leads/:id
const updateLead = async (req, res, next) => {
  try {
    const allowed = ['name','phone','notes','tags','status','lostReason','assignedAgentId'];
    const data = { updatedAt: new Date().toISOString() };
    allowed.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
    
    const { data: lead, error } = await supabase
      .from('Lead')
      .update(data)
      .eq('id', req.params.id)
      .select()
      .single();
      
    if (error) throw error;
    res.json(lead);
  } catch (err) { next(err); }
};

// DELETE /leads/:id
const deleteLead = async (req, res, next) => {
  try {
    const { error } = await supabase.from('Lead').delete().eq('id', req.params.id);
    if (error) throw error;
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

    const { data: lead, error: findError } = await supabase.from('Lead').select('*').eq('id', req.params.id).eq('businessId', req.business.id).single();
    if (findError || !lead) return res.status(404).json({ error: 'Lead not found' });

    await supabase.from('Lead').update({ stage, updatedAt: new Date().toISOString(), lastContactedAt: new Date().toISOString() }).eq('id', lead.id);
    await supabase.from('StageHistory').insert([{
      id: uuid(), leadId: lead.id, fromStage: lead.stage, toStage: stage, reason
    }]);

    const { data: updated } = await supabase.from('Lead').select('*').eq('id', lead.id).single();
    res.json(updated);
  } catch (err) { next(err); }
};

// GET /leads/pipeline/summary
const pipelineSummary = async (req, res, next) => {
  try {
    const stages = ['new','catalogue_sent','negotiating','closed_won','closed_lost'];
    
    const results = await Promise.all(stages.map(async (stage) => {
      const { data, count, error } = await supabase
        .from('Lead')
        .select('lifetimeValue', { count: 'exact' })
        .eq('businessId', req.business.id)
        .eq('stage', stage);
        
      if (error) throw error;
      const value = (data || []).reduce((sum, l) => sum + (l.lifetimeValue || 0), 0);
      return { stage, count: count || 0, value };
    }));
    
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
    const { data: lead, error } = await supabase
      .from('Lead')
      .update({ stage: 'closed_lost', status: 'lost', lostReason: reason, updatedAt: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
      
    if (error) throw error;
    res.json(lead);
  } catch (err) { next(err); }
};

module.exports = { getLeads, getLead, createLead, updateLead, deleteLead, moveStage, pipelineSummary, tagLost };
