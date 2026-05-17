const { v4: uuid } = require('uuid');
const prisma = require('../utils/prisma');
const { generateFollowUp } = require('../services/aiService');

// GET /reminders
const getReminders = async (req, res, next) => {
  try {
    const { status, priority } = req.query;
    const now = new Date();
    const reminders = await prisma.reminder.findMany({
      where: {
        businessId: req.business.id,
        ...(status && { status }),
        ...(priority && { priority })
      },
      orderBy: { dueAt: 'asc' },
      include: { lead: { select: { name: true, phone: true, stage: true, intentScore: true } } }
    });

    const categorised = {
      overdue:  reminders.filter(r => r.status === 'pending' && new Date(r.dueAt) < now),
      today:    reminders.filter(r => r.status === 'pending' && isToday(r.dueAt)),
      upcoming: reminders.filter(r => r.status === 'pending' && new Date(r.dueAt) > endOfToday()),
      done:     reminders.filter(r => r.status === 'completed'),
    };
    res.json(categorised);
  } catch (err) { next(err); }
};

// POST /reminders
const createReminder = async (req, res, next) => {
  try {
    const { leadId, title, notes, dueAt, priority = 'normal' } = req.body;
    if (!leadId || !title || !dueAt) return res.status(400).json({ error: 'leadId, title, dueAt are required' });
    const reminder = await prisma.reminder.create({
      data: { id: uuid(), businessId: req.business.id, leadId, title, notes, dueAt: new Date(dueAt), priority }
    });
    res.status(201).json(reminder);
  } catch (err) { next(err); }
};

// PATCH /reminders/:id/complete
const completeReminder = async (req, res, next) => {
  try {
    const reminder = await prisma.reminder.update({
      where: { id: req.params.id },
      data: { status: 'completed', completedAt: new Date() }
    });
    res.json(reminder);
  } catch (err) { next(err); }
};

// PATCH /reminders/:id/snooze
const snoozeReminder = async (req, res, next) => {
  try {
    const { minutes = 60 } = req.body;
    const reminder = await prisma.reminder.findUnique({ where: { id: req.params.id } });
    const newDue = new Date(Date.now() + minutes * 60000);
    const updated = await prisma.reminder.update({
      where: { id: req.params.id },
      data: { dueAt: newDue }
    });
    res.json(updated);
  } catch (err) { next(err); }
};

// POST /reminders/:id/follow-up  — AI generates follow-up message
const generateFollowUpMessage = async (req, res, next) => {
  try {
    const reminder = await prisma.reminder.findFirst({
      where: { id: req.params.id, businessId: req.business.id },
      include: { lead: true }
    });
    if (!reminder) return res.status(404).json({ error: 'Reminder not found' });
    const message = await generateFollowUp(
      reminder.lead.name,
      reminder.notes || reminder.title,
      reminder.lead.language || 'english'
    );
    res.json({ message, lead: reminder.lead });
  } catch (err) { next(err); }
};

// DELETE /reminders/:id
const deleteReminder = async (req, res, next) => {
  try {
    await prisma.reminder.delete({ where: { id: req.params.id } });
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
