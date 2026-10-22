const router = require('express').Router();
const { handleUSSD } = require('../services/ussdService');
const logger = require('../utils/logger');

// Africa's Talking sends POST with form-encoded body
router.post('/', async (req, res) => {
  const { sessionId, serviceCode, phoneNumber, text } = req.body;

  if (!sessionId || !phoneNumber) {
    return res.status(400).send('END Invalid request.');
  }

  try {
    const response = await handleUSSD({ sessionId, serviceCode, phoneNumber, text: text || '' });
    res.set('Content-Type', 'text/plain');
    return res.send(response);
  } catch (err) {
    logger.error('USSD handler error', { error: err.message });
    res.set('Content-Type', 'text/plain');
    return res.send('END Service temporarily unavailable. Please try again.');
  }
});

module.exports = router;
