const { v4: uuid } = require('uuid');
const supabase = require('../utils/supabase');
const { generateFollowUp } = require('../services/aiService');

// GET /reminders
const getReminders = async (req, res, next) => {
  try {
    const { status, priority } = req.query;
    const now = new Date();
    
    let query = supabase
      .from('Reminder')
      .select('*, lead:Lead(name, phone, stage, intentScore)')
      .eq('businessId', req.business.id)
      .order('dueAt', { ascending: true });
      
    if (status) query = query.eq('status', status);
    if (priority) query = query.eq('priority', priority);

    const { data: reminders, error } = await query;
    if (error) throw error;

    const categorised = {
      overdue:  (reminders || []).filter(r => r.status === 'pending' && new Date(r.dueAt) < now),
      today:    (reminders || []).filter(r => r.status === 'pending' && isToday(r.dueAt)),
      upcoming: (reminders || []).filter(r => r.status === 'pending' && new Date(r.dueAt) > endOfToday()),
      done:     (reminders || []).filter(r => r.status === 'completed'),
    };
    res.json(categorised);
  } catch (err) { next(err); }
};

// POST /reminders
const createReminder = async (req, res, next) => {
  try {
    const { leadId, title, notes, dueAt, priority = 'normal' } = req.body;
    if (!leadId || !title || !dueAt) return res.status(400).json({ error: 'leadId, title, dueAt are required' });
    
    const { data: reminder, error } = await supabase
      .from('Reminder')
      .insert([{
        id: uuid(), businessId: req.business.id, 
        leadId, title, notes, dueAt: new Date(dueAt).toISOString(), priority
      }])
      .select()
      .single();
      
    if (error) throw error;
    res.status(201).json(reminder);
  } catch (err) { next(err); }
};

// PATCH /reminders/:id/complete
const completeReminder = async (req, res, next) => {
  try {
    const { data: reminder, error } = await supabase
      .from('Reminder')
      .update({ status: 'completed', completedAt: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
      
    if (error) throw error;
    res.json(reminder);
  } catch (err) { next(err); }
};

// PATCH /reminders/:id/snooze
const snoozeReminder = async (req, res, next) => {
  try {
    const { minutes = 60 } = req.body;
    
    const { data: reminder, error: findErr } = await supabase.from('Reminder').select('dueAt').eq('id', req.params.id).single();
    if (findErr || !reminder) return res.status(404).json({ error: 'Reminder not found' });
    
    // Calculate new dueAt from the existing one, or from now if missing
    const baseDate = reminder.dueAt ? new Date(reminder.dueAt).getTime() : Date.now();
    const newDue = new Date(baseDate + minutes * 60000).toISOString();
    
    const { data: updated, error: updateErr } = await supabase
      .from('Reminder')
      .update({ dueAt: newDue })
      .eq('id', req.params.id)
      .select()
      .single();
      
    if (updateErr) throw updateErr;
    res.json(updated);
  } catch (err) { next(err); }
};

// POST /reminders/:id/follow-up  — AI generates follow-up message
const generateFollowUpMessage = async (req, res, next) => {
  try {
    const { data: reminder, error } = await supabase
      .from('Reminder')
      .select('*, lead:Lead(*)')
      .eq('id', req.params.id)
      .eq('businessId', req.business.id)
      .single();
      
    if (error || !reminder) return res.status(404).json({ error: 'Reminder not found' });
    
    // In supabase JS, join relations are arrays if 1-to-many or objects if 1-to-1, Waitlist to Lead is many-to-one so should be object but let's be safe
    const lead = Array.isArray(reminder.lead) ? reminder.lead[0] : reminder.lead;
    if (!lead) return res.status(404).json({ error: 'Lead not found for this reminder' });

    const message = await generateFollowUp(
      lead.name,
      reminder.notes || reminder.title,
      lead.language || 'english'
    );
    res.json({ message, lead });
  } catch (err) { next(err); }
};

// DELETE /reminders/:id
const deleteReminder = async (req, res, next) => {
  try {
    const { error } = await supabase.from('Reminder').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Reminder deleted' });
  } catch (err) { next(err); }
};

function isToday(date) {
  const d = new Date(date), now = new Date();
  return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}
function endOfToday() {
  const d = new Date(); d.setHours(23,59,59,999); return d;
}

module.exports = { getReminders, createReminder, completeReminder, snoozeReminder, generateFollowUpMessage, deleteReminder };
