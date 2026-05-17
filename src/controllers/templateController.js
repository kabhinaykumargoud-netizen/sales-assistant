// templateController.js
const { v4: uuid } = require('uuid');
const prisma = require('../utils/prisma');

const getTemplates = async (req, res, next) => {
  try {
    const { category, language } = req.query;
    const templates = await prisma.template.findMany({
      where: { businessId: req.business.id, ...(category && { category }), ...(language && { language }) },
      orderBy: [{ usageCount: 'desc' }, { createdAt: 'desc' }]
    });
    res.json(templates);
  } catch (err) { next(err); }
};

const createTemplate = async (req, res, next) => {
  try {
    const { name, category, content, language = 'en' } = req.body;
    if (!name || !content) return res.status(400).json({ error: 'name and content are required' });
    const t = await prisma.template.create({
      data: { id: uuid(), businessId: req.business.id, name, category: category || 'general', content, language }
    });
    res.status(201).json(t);
  } catch (err) { next(err); }
};

const useTemplate = async (req, res, next) => {
  try {
    const { leadId } = req.body;
    const template = await prisma.template.findFirst({ where: { id: req.params.id, businessId: req.business.id } });
    if (!template) return res.status(404).json({ error: 'Template not found' });
    await prisma.template.update({ where: { id: req.params.id }, data: { usageCount: { increment: 1 } } });
    let content = template.content;
    if (leadId) {
      const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { name: true } });
      if (lead) content = content.replace(/{{name}}/g, lead.name);
    }
    res.json({ content, template });
  } catch (err) { next(err); }
};

const deleteTemplate = async (req, res, next) => {
  try {
    await prisma.template.delete({ where: { id: req.params.id } });
    res.json({ message: 'Template deleted' });
  } catch (err) { next(err); }
};

module.exports = { getTemplates, createTemplate, useTemplate, deleteTemplate };
