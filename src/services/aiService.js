const axios = require('axios');

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

const callClaude = async (system, userMsg, maxTokens = 500) => {
  const res = await axios.post(
    ANTHROPIC_API,
    { model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: userMsg }] },
    { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } }
  );
  return res.data.content[0].text;
};

// Detect language from message text
const detectLanguage = async (text) => {
  try {
    const result = await callClaude(
      'You detect languages. Reply ONLY with one word: english, hindi, telugu, tamil, kannada, or other.',
      `Detect the language of: "${text}"`
    );
    return result.trim().toLowerCase();
  } catch { return 'english'; }
};

// Score buyer intent 0–100
const scoreIntent = async (conversationHistory) => {
  try {
    const msgs = conversationHistory.slice(-10).map(m => `${m.direction}: ${m.content}`).join('\n');
    const result = await callClaude(
      'You score sales intent. Reply ONLY with a number 0-100. 0=no interest, 50=asking questions, 80=ready to buy, 95=placing order.',
      `Score the buyer intent in this WhatsApp conversation:\n${msgs}`
    );
    return Math.min(100, Math.max(0, parseInt(result.trim()) || 50));
  } catch { return 50; }
};

// Generate 3 AI reply suggestions
const generateReplySuggestions = async (conversationHistory, businessContext, language = 'english') => {
  try {
    const msgs = conversationHistory.slice(-8).map(m => `${m.direction}: ${m.content}`).join('\n');
    const langNote = language !== 'english' ? ` Reply in ${language}.` : '';
    const result = await callClaude(
      `You are a sales assistant for a business.${langNote} Generate exactly 3 short WhatsApp reply options (under 30 words each). Return as JSON array: ["reply1","reply2","reply3"]. No markdown, no explanation.`,
      `Business: ${JSON.stringify(businessContext)}\n\nConversation:\n${msgs}\n\nGenerate 3 reply options.`,
      300
    );
    const clean = result.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch { return ['Sure, let me help you!', 'Can you share more details?', 'I will send the catalogue right away.']; }
};

// Analyse message sentiment
const analyseSentiment = async (text) => {
  try {
    const result = await callClaude(
      'Analyse sentiment. Reply ONLY with one word: positive, hesitant, neutral, frustrated, or excited.',
      `Sentiment of: "${text}"`
    );
    return result.trim().toLowerCase();
  } catch { return 'neutral'; }
};

// Generate follow-up message
const generateFollowUp = async (leadName, context, language = 'english') => {
  try {
    const langNote = language !== 'english' ? ` Write in ${language}.` : '';
    return await callClaude(
      `You write friendly WhatsApp follow-up messages for a sales business.${langNote} Keep it under 50 words, warm and non-pushy.`,
      `Write a follow-up for customer ${leadName}. Context: ${context}`
    );
  } catch { return `Hi ${leadName}! Just checking in — let me know if you have any questions 😊`; }
};

// Generate negotiation counter-offer suggestion
const generateCounterOffer = async (buyerOffer, floorPrice, listedPrice) => {
  try {
    return await callClaude(
      'You are a negotiation assistant. Suggest a professional counter-offer in one sentence (under 25 words).',
      `Listed: ₹${listedPrice}, Floor: ₹${floorPrice}, Buyer offered: ₹${buyerOffer}. Suggest counter-offer.`
    );
  } catch { return `We can offer you ₹${Math.round((floorPrice + listedPrice) / 2)} — best possible price for you!`; }
};

// Score AI reply quality 0–100
const scoreReplyQuality = async (replyText, context) => {
  try {
    const result = await callClaude(
      'Score this WhatsApp sales reply 0-100 for: clarity, persuasiveness, tone, and appropriateness. Reply ONLY with a number.',
      `Context: ${context}\nReply: "${replyText}"`
    );
    return Math.min(100, Math.max(0, parseInt(result.trim()) || 70));
  } catch { return 70; }
};

// Bundle recommendation
const recommendBundles = async (enquiredProduct, availableProducts) => {
  try {
    const productList = availableProducts.map(p => p.name).join(', ');
    const result = await callClaude(
      'You are a product bundling assistant. Reply ONLY with a JSON array of product names to bundle. No explanation.',
      `Customer asked about: ${enquiredProduct}. Available: ${productList}. Which 2-3 products bundle well? Return as JSON array.`
    );
    const clean = result.replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch { return []; }
};

// Generate GST invoice text
const generateInvoiceText = async (lead, products, totalAmount) => {
  try {
    const items = products.map(p => `${p.name} x${p.qty} @ ₹${p.price}`).join('\n');
    return await callClaude(
      'Generate a simple GST invoice as plain text for a WhatsApp message. Include invoice number, date, items, subtotal, GST (18%), total.',
      `Customer: ${lead.name}, Phone: ${lead.phone}\nItems:\n${items}\nTotal before tax: ₹${totalAmount}`
    );
  } catch { return `Invoice for ${lead.name}: ₹${totalAmount} + GST`; }
};

module.exports = {
  detectLanguage, scoreIntent, generateReplySuggestions,
  analyseSentiment, generateFollowUp, generateCounterOffer,
  scoreReplyQuality, recommendBundles, generateInvoiceText
};
