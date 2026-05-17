const { v4: uuid } = require('uuid');
const prisma = require('../utils/prisma');
const { recommendBundles } = require('../services/aiService');

// GET /products
const getProducts = async (req, res, next) => {
  try {
    const { category, isActive, search, page = 1, limit = 20 } = req.query;
    const where = {
      businessId: req.business.id,
      ...(category && { category }),
      ...(isActive !== undefined && { isActive: isActive === 'true' }),
      ...(search && {
        OR: [{ name: { contains: search } }, { description: { contains: search } }]
      })
    };
    const [products, total] = await Promise.all([
      prisma.product.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page-1)*Number(limit), take: Number(limit) }),
      prisma.product.count({ where })
    ]);
    res.json({ products, total });
  } catch (err) { next(err); }
};

// GET /products/:id
const getProduct = async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, businessId: req.business.id }
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) { next(err); }
};

// POST /products
const createProduct = async (req, res, next) => {
  try {
    const { name, description, price, discountPrice, stock, category, imageUrl, videoUrl } = req.body;
    if (!name || price === undefined) return res.status(400).json({ error: 'name and price are required' });
    const product = await prisma.product.create({
      data: { id: uuid(), businessId: req.business.id, name, description, price: Number(price), discountPrice: discountPrice ? Number(discountPrice) : null, stock: Number(stock || 0), category, imageUrl, videoUrl }
    });
    res.status(201).json(product);
  } catch (err) { next(err); }
};

// PATCH /products/:id
const updateProduct = async (req, res, next) => {
  try {
    const allowed = ['name','description','price','discountPrice','stock','category','imageUrl','videoUrl','isActive'];
    const data = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
    if (data.price) data.price = Number(data.price);
    if (data.stock) data.stock = Number(data.stock);
    const product = await prisma.product.update({ where: { id: req.params.id }, data });
    res.json(product);
  } catch (err) { next(err); }
};

// DELETE /products/:id
const deleteProduct = async (req, res, next) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    res.json({ message: 'Product deleted' });
  } catch (err) { next(err); }
};

// POST /products/:id/restock
const restockProduct = async (req, res, next) => {
  try {
    const { quantity } = req.body;
    if (!quantity) return res.status(400).json({ error: 'quantity is required' });
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { stock: { increment: Number(quantity) } }
    });
    // Notify waitlisted leads
    const waitlist = await prisma.waitlist.findMany({
      where: { productId: req.params.id, notified: false }
    });
    if (waitlist.length) {
      const { sendTextMessage } = require('../services/whatsappService');
      for (const w of waitlist) {
        const lead = await prisma.lead.findUnique({ where: { id: w.leadId }, select: { phone: true, name: true } });
        if (lead) {
          await sendTextMessage(lead.phone, `Hi ${lead.name}! Great news — "${product.name}" is back in stock! Reply to order now 🎉`).catch(() => {});
          await prisma.waitlist.update({ where: { id: w.id }, data: { notified: true } });
        }
      }
    }
    res.json({ product, waitlistNotified: waitlist.length });
  } catch (err) { next(err); }
};

// POST /products/:id/waitlist
const joinWaitlist = async (req, res, next) => {
  try {
    const { leadId } = req.body;
    if (!leadId) return res.status(400).json({ error: 'leadId is required' });
    const entry = await prisma.waitlist.create({
      data: { id: uuid(), leadId, productId: req.params.id }
    });
    res.status(201).json(entry);
  } catch (err) { next(err); }
};

// GET /products/:id/bundle-recommendations
const getBundleRecommendations = async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({ where: { id: req.params.id, businessId: req.business.id } });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    const allProducts = await prisma.product.findMany({
      where: { businessId: req.business.id, isActive: true, id: { not: req.params.id } },
      select: { name: true, id: true }
    });
    const names = await recommendBundles(product.name, allProducts);
    const recommended = allProducts.filter(p => names.includes(p.name));
    res.json({ product: product.name, recommendedBundles: recommended });
  } catch (err) { next(err); }
};

module.exports = { getProducts, getProduct, createProduct, updateProduct, deleteProduct, restockProduct, joinWaitlist, getBundleRecommendations };
