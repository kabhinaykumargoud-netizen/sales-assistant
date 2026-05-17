const router = require('express').Router();
const c = require('../controllers/agentController');
const { authenticate } = require('../middleware/auth');
router.use(authenticate);
router.get('/',                       c.getAgents);
router.post('/',                      c.createAgent);
router.delete('/:id',                 c.deleteAgent);
router.patch('/leads/:leadId/assign', c.assignLead);
module.exports = router;
