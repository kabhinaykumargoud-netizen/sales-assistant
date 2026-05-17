const router = require('express').Router();
const { verifyWebhook, handleWebhook } = require('../controllers/webhookController');
router.get('/',  verifyWebhook);
router.post('/', handleWebhook);
module.exports = router;
