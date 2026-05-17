const router = require('express').Router();
const c = require('../controllers/catalogueController');
const { authenticate } = require('../middleware/auth');
router.use(authenticate);
router.get('/',          c.getCatalogue);
router.post('/share',    c.shareCatalogue);
router.post('/invoice',  c.generateInvoice);
module.exports = router;
