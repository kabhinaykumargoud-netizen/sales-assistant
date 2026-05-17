const router = require('express').Router();
const c = require('../controllers/templateController');
const { authenticate } = require('../middleware/auth');
router.use(authenticate);
router.get('/',          c.getTemplates);
router.post('/',         c.createTemplate);
router.post('/:id/use',  c.useTemplate);
router.delete('/:id',    c.deleteTemplate);
module.exports = router;
