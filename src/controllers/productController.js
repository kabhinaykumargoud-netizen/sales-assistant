const { v4: uuid } = require('uuid');
const supabase = require('../utils/supabase');
const { recommendBundles } = require('../services/aiService');

// GET /products
const getProducts = async (req, res, next) => {
  try {
    const { category, isActive, search, page = 1, limit = 20 } = req.query;
    const pageNum = Number(page);
    const limitNum = Number(limit);

    let query = supabase
      .from('Product')
      .select('*', { count: 'exact' })
      .eq('businessId', req.business.id)
      .order('createdAt', { ascending: false })
      .range((pageNum - 1) * limitNum, pageNum * limitNum - 1);

    if (category) query = query.eq('category', category);
    if (isActive !== undefined) query = query.eq('isActive', isActive === 'true');
    if (search) query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);

    const { data: products, count, error } = await query;
    if (error) throw error;

    res.json({ products: products || [], total: count || 0 });
  } catch (err) { next(err); }
};

// GET /products/:id
const getProduct = async (req, res, next) => {
  try {
    const { data: product, error } = await supabase
      .from('Product')
      .select('*')
      .eq('id', req.params.id)
      .eq('businessId', req.business.id)
      .single();
      
    if (error || !product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) { next(err); }
};

// POST /products
const createProduct = async (req, res, next) => {
  try {
    const { name, description, price, discountPrice, stock, category, imageUrl, videoUrl } = req.body;
    if (!name || price === undefined) return res.status(400).json({ error: 'name and price are required' });
    
    const { data: product, error } = await supabase
      .from('Product')
      .insert([{
        id: uuid(), businessId: req.business.id, 
        name, description, price: Number(price), 
        discountPrice: discountPrice ? Number(discountPrice) : null, 
        stock: Number(stock || 0), category, imageUrl, videoUrl
      }])
      .select()
      .single();
      
    if (error) throw error;
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
    
    const { data: product, error } = await supabase
      .from('Product')
      .update(data)
      .eq('id', req.params.id)
      .select()
      .single();
      
    if (error) throw error;
    res.json(product);
  } catch (err) { next(err); }
};

// DELETE /products/:id
const deleteProduct = async (req, res, next) => {
  try {
    const { error } = await supabase.from('Product').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'Product deleted' });
  } catch (err) { next(err); }
};

// POST /products/:id/restock
const restockProduct = async (req, res, next) => {
  try {
    const { quantity } = req.body;
    if (!quantity) return res.status(400).json({ error: 'quantity is required' });

    // Fetch current stock
    const { data: currentProduct, error: pErr } = await supabase.from('Product').select('stock, name').eq('id', req.params.id).single();
    if (pErr || !currentProduct) return res.status(404).json({ error: 'Product not found' });

    const { data: product, error: updateErr } = await supabase
      .from('Product')
      .update({ stock: (currentProduct.stock || 0) + Number(quantity) })
      .eq('id', req.params.id)
      .select()
      .single();
    if (updateErr) throw updateErr;

    // Notify waitlisted leads
    const { data: waitlist } = await supabase.from('Waitlist').select('*').eq('productId', req.params.id).eq('notified', false);
    
    if (waitlist && waitlist.length) {
      const { sendTextMessage } = require('../services/whatsappService');
      for (const w of waitlist) {
        const { data: lead } = await supabase.from('Lead').select('phone, name').eq('id', w.leadId).single();
        if (lead) {
          await sendTextMessage(lead.phone, `Hi ${lead.name}! Great news — "${product.name}" is back in stock! Reply to order now 🎉`).catch(() => {});
          await supabase.from('Waitlist').update({ notified: true }).eq('id', w.id);
        }
      }
    }
    res.json({ product, waitlistNotified: waitlist ? waitlist.length : 0 });
  } catch (err) { next(err); }
};

// POST /products/:id/waitlist
const joinWaitlist = async (req, res, next) => {
  try {
    const { leadId } = req.body;
    if (!leadId) return res.status(400).json({ error: 'leadId is required' });
    
    const { data: entry, error } = await supabase
      .from('Waitlist')
      .insert([{ id: uuid(), leadId, productId: req.params.id }])
      .select()
      .single();
      
    if (error) throw error;
    res.status(201).json(entry);
  } catch (err) { next(err); }
};

// GET /products/:id/bundle-recommendations
const getBundleRecommendations = async (req, res, next) => {
  try {
    const { data: product, error: pErr } = await supabase.from('Product').select('*').eq('id', req.params.id).eq('businessId', req.business.id).single();
    if (pErr || !product) return res.status(404).json({ error: 'Product not found' });

    const { data: allProducts } = await supabase.from('Product').select('name, id').eq('businessId', req.business.id).eq('isActive', true).neq('id', req.params.id);
    
    const names = await recommendBundles(product.name, allProducts || []);
    const recommended = (allProducts || []).filter(p => names.includes(p.name));
    res.json({ product: product.name, recommendedBundles: recommended });
  } catch (err) { next(err); }
};

module.exports = { getProducts, getProduct, createProduct, updateProduct, deleteProduct, restockProduct, joinWaitlist, getBundleRecommendations };
