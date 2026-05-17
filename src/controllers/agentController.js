const { v4: uuid } = require('uuid');
const supabase = require('../utils/supabase');

const getAgents = async (req, res, next) => {
  try {
    const { data: agents, error } = await supabase
      .from('Agent')
      .select('*, messages(count)')
      .eq('businessId', req.business.id);

    if (error) throw error;
    
    const formattedAgents = agents.map(a => ({
      ...a,
      _count: { messages: a.messages[0]?.count || 0 }
    }));
    
    res.json(formattedAgents);
  } catch (err) { next(err); }
};

const createAgent = async (req, res, next) => {
  try {
    const { name, email, role = 'agent' } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'name and email are required' });
    
    const { data: agent, error } = await supabase
      .from('Agent')
      .insert([{ id: uuid(), businessId: req.business.id, name, email, role }])
      .select()
      .single();
      
    if (error) throw error;
    res.status(201).json(agent);
  } catch (err) { next(err); }
};

const deleteAgent = async (req, res, next) => {
  try {
    const { error } = await supabase.from('Agent').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Agent removed' });
  } catch (err) { next(err); }
};

// PATCH /leads/:leadId/assign
const assignLead = async (req, res, next) => {
  try {
    const { agentId } = req.body;
    const { data: lead, error } = await supabase
      .from('Lead')
      .update({ assignedAgentId: agentId })
      .eq('id', req.params.leadId)
      .select()
      .single();
      
    if (error) throw error;
    res.json(lead);
  } catch (err) { next(err); }
};

module.exports = { getAgents, createAgent, deleteAgent, assignLead };
