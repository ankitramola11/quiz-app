const express = require('express');
const router = express.Router();
const { saveAnswer, submitAttempt, getResult } = require('../controllers/attemptController');
const { protect } = require('../middleware/authMiddleware');

router.post('/:attemptId/answer', protect, saveAnswer);
router.post('/:attemptId/submit', protect, submitAttempt);
router.get('/:attemptId/result', protect, getResult);

module.exports = router;
