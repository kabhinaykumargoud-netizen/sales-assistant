const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { v4: uuid } = require('uuid');
const prisma  = require('../utils/prisma');

const signToken = (businessId, email) =>
  jwt.sign({ businessId, email }, process.env.JWT_SECRET, { expiresIn: '7d' });

// POST /auth/register
const register = async (req, res, next) => {
  try {
    const { name, email, password, phone, whatsappNumber } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ error: 'name, email and password are required' });

    const existing = await prisma.business.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const passwordHash = await bcrypt.hash(password, 12);
    const business = await prisma.business.create({
      data: { id: uuid(), name, email, passwordHash, phone, whatsappNumber }
    });

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

    const business = await prisma.business.findUnique({ where: { email } });
    if (!business) return res.status(401).json({ error: 'Invalid credentials' });

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
    const business = await prisma.business.findUnique({
      where: { id: req.business.id },
      select: { id:true, name:true, email:true, phone:true, whatsappNumber:true, plan:true, createdAt:true }
    });
    res.json(business);
  } catch (err) { next(err); }
};

// PATCH /auth/profile
const updateProfile = async (req, res, next) => {
  try {
    const { name, phone, whatsappNumber } = req.body;
    const business = await prisma.business.update({
      where: { id: req.business.id },
      data: { name, phone, whatsappNumber },
      select: { id:true, name:true, email:true, phone:true, whatsappNumber:true }
    });
    res.json(business);
  } catch (err) { next(err); }
};

// POST /auth/change-password
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const business = await prisma.business.findUnique({ where: { id: req.business.id } });
    const valid = await bcrypt.compare(currentPassword, business.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.business.update({ where: { id: req.business.id }, data: { passwordHash } });
    res.json({ message: 'Password updated successfully' });
  } catch (err) { next(err); }
};

module.exports = { register, login, me, updateProfile, changePassword };
