// templateController.js
const { v4: uuid } = require('uuid');
const supabase = require('../utils/supabase');

const getTemplates = async (req, res, next) => {
  try {
    const { category, language } = req.query;
    
    let query = supabase
      .from('Template')
      .select('*')
      .eq('businessId', req.business.id)
      .order('usageCount', { ascending: false })
      .order('createdAt', { ascending: false });
      
    if (category) query = query.eq('category', category);
    if (language) query = query.eq('language', language);

    const { data: templates, error } = await query;
    if (error) throw error;
    res.json(templates);
  } catch (err) { next(err); }
};

const createTemplate = async (req, res, next) => {
  try {
    const { name, category, content, language = 'en' } = req.body;
    if (!name || !content) return res.status(400).json({ error: 'name and content are required' });
    
    const { data: t, error } = await supabase
      .from('Template')
      .insert([{
        id: uuid(), businessId: req.business.id, 
        name, category: category || 'general', content, language
      }])
      .select()
      .single();
      
    if (error) throw error;
    res.status(201).json(t);
  } catch (err) { next(err); }
};

const useTemplate = async (req, res, next) => {
  try {
    const { leadId } = req.body;
    
    const { data: template, error: tErr } = await supabase
      .from('Template')
      .select('*')
      .eq('id', req.params.id)
      .eq('businessId', req.business.id)
      .single();
      
    if (tErr || !template) return res.status(404).json({ error: 'Template not found' });
    
    await supabase.from('Template').update({ usageCount: (template.usageCount || 0) + 1 }).eq('id', req.params.id);
    
    let content = template.content;
    if (leadId) {
      const { data: lead } = await supabase.from('Lead').select('name').eq('id', leadId).single();
      if (lead) content = content.replace(/{{name}}/g, lead.name);
    }
    res.json({ content, template });
  } catch (err) { next(err); }
};

const deleteTemplate = async (req, res, next) => {
  try {
    const { error } = await supabase.from('Template').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Template deleted' });
  } catch (err) { next(err); }
};

module.exports = { getTemplates, createTemplate, useTemplate, deleteTemplate };
