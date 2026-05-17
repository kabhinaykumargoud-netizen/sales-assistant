const axios = require('axios');

const BASE = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}`;
const HEADERS = {
  Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
  'Content-Type': 'application/json'
};

const sendTextMessage = async (to, text) => {
  if (!process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_TOKEN === 'your_whatsapp_business_token_here') {
    console.log(`[WA MOCK] To: ${to} | Message: ${text}`);
    return { messageId: `mock_${Date.now()}`, status: 'simulated' };
  }
  const res = await axios.post(`${BASE}/messages`, {
    messaging_product: 'whatsapp', recipient_type: 'individual',
    to, type: 'text', text: { preview_url: false, body: text }
  }, { headers: HEADERS });
  return { messageId: res.data.messages[0].id, status: 'sent' };
};

const sendTemplateMessage = async (to, templateName, language = 'en', components = []) => {
  if (!process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_TOKEN === 'your_whatsapp_business_token_here') {
    console.log(`[WA MOCK] Template "${templateName}" to ${to}`);
    return { messageId: `mock_tmpl_${Date.now()}`, status: 'simulated' };
  }
  const res = await axios.post(`${BASE}/messages`, {
    messaging_product: 'whatsapp', to, type: 'template',
    template: { name: templateName, language: { code: language }, components }
  }, { headers: HEADERS });
  return { messageId: res.data.messages[0].id, status: 'sent' };
};

const sendDocumentMessage = async (to, documentUrl, filename, caption = '') => {
  if (!process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_TOKEN === 'your_whatsapp_business_token_here') {
    console.log(`[WA MOCK] Document "${filename}" to ${to}`);
    return { messageId: `mock_doc_${Date.now()}`, status: 'simulated' };
  }
  const res = await axios.post(`${BASE}/messages`, {
    messaging_product: 'whatsapp', to, type: 'document',
    document: { link: documentUrl, filename, caption }
  }, { headers: HEADERS });
  return { messageId: res.data.messages[0].id, status: 'sent' };
};

const sendImageMessage = async (to, imageUrl, caption = '') => {
  if (!process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_TOKEN === 'your_whatsapp_business_token_here') {
    console.log(`[WA MOCK] Image to ${to}: ${imageUrl}`);
    return { messageId: `mock_img_${Date.now()}`, status: 'simulated' };
  }
  const res = await axios.post(`${BASE}/messages`, {
    messaging_product: 'whatsapp', to, type: 'image',
    image: { link: imageUrl, caption }
  }, { headers: HEADERS });
  return { messageId: res.data.messages[0].id, status: 'sent' };
};

const markMessageRead = async (messageId) => {
  if (!process.env.WHATSAPP_TOKEN || process.env.WHATSAPP_TOKEN === 'your_whatsapp_business_token_here') return;
  await axios.post(`${BASE}/messages`, {
    messaging_product: 'whatsapp', status: 'read', message_id: messageId
  }, { headers: HEADERS }).catch(() => {});
};

const parseWebhookPayload = (body) => {
  try {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    if (!value?.messages?.length) return null;
    const msg = value.messages[0];
    const contact = value.contacts?.[0];
    return {
      messageId:  msg.id,
      from:       msg.from,
      type:       msg.type,
      text:       msg.text?.body || '',
      name:       contact?.profile?.name || msg.from,
      timestamp:  new Date(parseInt(msg.timestamp) * 1000),
      status:     msg.status,
    };
  } catch { return null; }
};

module.exports = {
  sendTextMessage, sendTemplateMessage, sendDocumentMessage,
  sendImageMessage, markMessageRead, parseWebhookPayload
};
