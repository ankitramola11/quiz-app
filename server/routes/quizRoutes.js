const express = require('express');
const router = express.Router();
const { getActiveQuiz, getQuizQuestions, startAttempt } = require('../controllers/quizController');
const { protect } = require('../middleware/authMiddleware');

router.get('/active', protect, getActiveQuiz);
router.get('/:quizId/questions', protect, getQuizQuestions);
router.post('/:quizId/start', protect, startAttempt);

module.exports = router;
