const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const supabase = require('../utils/supabase');

const signToken = (businessId, email) =>
  jwt.sign({ businessId, email }, process.env.JWT_SECRET, { expiresIn: '7d' });

// POST /auth/register
const register = async (req, res, next) => {
  try {
    const { name, email, password, phone, whatsappNumber } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'name, email and password are required' });

    const { data: existing } = await supabase.from('Business').select('id').eq('email', email).single();
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const { data: business, error } = await supabase
      .from('Business')
      .insert([{ id: uuid(), name, email, passwordHash, phone, whatsappNumber }])
      .select()
      .single();
      
    if (error) throw error;

    const token = signToken(business.id, business.email);
    res.status(201).json({
      token,
      business: { id: business.id, name: business.name, email: business.email, plan: business.plan }
    });
  } catch (err) { next(err); }
};

// POST /auth/login
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'email and password are required' });

    const { data: business, error } = await supabase.from('Business').select('*').eq('email', email).single();
    if (error || !business) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, business.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(business.id, business.email);
    res.json({
      token,
      business: { id: business.id, name: business.name, email: business.email, plan: business.plan }
    });
  } catch (err) { next(err); }
};

// GET /auth/me
const me = async (req, res, next) => {
  try {
    const { data: business, error } = await supabase
      .from('Business')
      .select('id, name, email, phone, whatsappNumber, plan, createdAt')
      .eq('id', req.business.id)
      .single();
      
    if (error) throw error;
    res.json(business);
  } catch (err) { next(err); }
};

// PATCH /auth/profile
const updateProfile = async (req, res, next) => {
  try {
    const { name, phone, whatsappNumber } = req.body;
    const { data: business, error } = await supabase
      .from('Business')
      .update({ name, phone, whatsappNumber })
      .eq('id', req.business.id)
      .select('id, name, email, phone, whatsappNumber')
      .single();
      
    if (error) throw error;
    res.json(business);
  } catch (err) { next(err); }
};

// POST /auth/change-password
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const { data: business, error: findError } = await supabase.from('Business').select('passwordHash').eq('id', req.business.id).single();
    if (findError) throw findError;
    
    const valid = await bcrypt.compare(currentPassword, business.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const { error: updateError } = await supabase.from('Business').update({ passwordHash }).eq('id', req.business.id);
    if (updateError) throw updateError;
    
    res.json({ message: 'Password updated successfully' });
  } catch (err) { next(err); }
};

module.exports = { register, login, me, updateProfile, changePassword };
