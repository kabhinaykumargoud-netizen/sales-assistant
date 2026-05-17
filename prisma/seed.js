require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Seeding database...');

  // Business
  const passwordHash = await bcrypt.hash('password123', 12);
  const business = await prisma.business.upsert({
    where: { email: 'demo@salesbot.com' },
    update: {},
    create: {
      id: 'biz-demo-001',
      name: 'Lakshmi Silk House',
      email: 'demo@salesbot.com',
      passwordHash,
      phone: '+91 98765 00000',
      whatsappNumber: '919876500000',
      plan: 'pro'
    }
  });
  console.log('  ✓ Business:', business.name);

  // Agent
  await prisma.agent.upsert({
    where: { id: 'agent-001' },
    update: {},
    create: { id: 'agent-001', businessId: business.id, name: 'Ravi Sharma', email: 'ravi@salesbot.com', role: 'agent' }
  });

  // Products
  const products = [
    { id: 'prod-001', name: 'Banarasi Silk Saree', price: 4500, category: 'Sarees', stock: 38 },
    { id: 'prod-002', name: 'Cotton Printed Kurta', price: 799,  category: 'Kurtas', stock: 120 },
    { id: 'prod-003', name: 'Lehenga Choli Set',   price: 8200, category: 'Lehengas', stock: 15 },
    { id: 'prod-004', name: 'Designer Blouse',      price: 1200, category: 'Blouses', stock: 60 },
    { id: 'prod-005', name: 'Bridal Dupatta',       price: 2800, category: 'Dupattas', stock: 8 },
    { id: 'prod-006', name: 'Kids Ethnic Wear',     price: 550,  category: 'Kids', stock: 200 },
  ];
  for (const p of products) {
    await prisma.product.upsert({ where: { id: p.id }, update: {}, create: { ...p, businessId: business.id } });
  }
  console.log('  ✓ Products seeded:', products.length);

  // Leads
  const leads = [
    { id: 'lead-001', name: 'Ravi Kumar',   phone: '919876543210', stage: 'catalogue_sent', intentScore: 82, language: 'english' },
    { id: 'lead-002', name: 'Priya Sharma', phone: '918765432109', stage: 'new',            intentScore: 55, language: 'hindi' },
    { id: 'lead-003', name: 'Anjali Verma', phone: '917654321098', stage: 'new',            intentScore: 30, language: 'telugu' },
    { id: 'lead-004', name: 'Suresh Patel', phone: '916543210987', stage: 'negotiating',    intentScore: 90, language: 'english' },
    { id: 'lead-005', name: 'Meena Lal',    phone: '915432109876', stage: 'catalogue_sent', intentScore: 60, language: 'hindi' },
  ];
  for (const l of leads) {
    await prisma.lead.upsert({
      where: { id: l.id }, update: {},
      create: { ...l, businessId: business.id, status: 'active', source: 'whatsapp', lifetimeValue: 0 }
    });
  }
  console.log('  ✓ Leads seeded:', leads.length);

  // Templates
  const templates = [
    { id: 'tmpl-001', name: 'Greeting', category: 'greeting', content: 'Hi {{name}}! Welcome to Lakshmi Silk House 🙏 How can I help you today?' },
    { id: 'tmpl-002', name: 'Catalogue offer', category: 'catalogue', content: 'Hi {{name}}! I\'d love to share our latest collection with you. Shall I send the catalogue?' },
    { id: 'tmpl-003', name: 'Price negotiation', category: 'negotiation', content: 'Hi {{name}}, I understand your budget. Let me check the best price I can offer for you!' },
    { id: 'tmpl-004', name: 'Follow up', category: 'followup', content: 'Hi {{name}}! Just checking in — did you get a chance to look at our collection? Happy to answer any questions 😊' },
    { id: 'tmpl-005', name: 'Festive offer', category: 'promotion', content: 'Hi {{name}}! 🎉 Festive special: 20% off all sarees this week only! Interested?' },
  ];
  for (const t of templates) {
    await prisma.template.upsert({
      where: { id: t.id }, update: {},
      create: { ...t, businessId: business.id, language: 'en' }
    });
  }
  console.log('  ✓ Templates seeded:', templates.length);

  // Reminders
  const now = new Date();
  await prisma.reminder.upsert({
    where: { id: 'rem-001' }, update: {},
    create: {
      id: 'rem-001', businessId: business.id, leadId: 'lead-001',
      title: 'Bulk quote follow-up', notes: 'Customer asked for 50 piece pricing',
      dueAt: new Date(now.getTime() - 86400000), priority: 'high'
    }
  });
  await prisma.reminder.upsert({
    where: { id: 'rem-002' }, update: {},
    create: {
      id: 'rem-002', businessId: business.id, leadId: 'lead-004',
      title: 'Send payment link', notes: 'Suresh confirmed order for Banarasi lot',
      dueAt: new Date(now.getTime() + 3600000), priority: 'high'
    }
  });
  console.log('  ✓ Reminders seeded');

  console.log('\n✅ Seed complete!');
  console.log('   Login: demo@salesbot.com / password123');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
