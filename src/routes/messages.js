const router = require('express').Router();
const c = require('../controllers/messageController');
const { authenticate } = require('../middleware/auth');
router.use(authenticate);
router.get('/inbox',           c.getInbox);
router.get('/',                c.getMessages);
router.post('/send',           c.sendMessage);
router.post('/ai-suggestions', c.getAiSuggestions);
module.exports = router;
