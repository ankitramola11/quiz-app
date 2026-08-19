const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/adminMiddleware');
const {
  getDashboard,
  getQuestions, createQuestion, getQuestion, updateQuestion, deleteQuestion,
  getQuizzes, createQuiz, updateQuiz, deleteQuiz, generateQuizFromPdf,
  getParticipants,
  getResults, exportResults
} = require('../controllers/adminController');

const upload = require('../middleware/uploadMiddleware');

// All admin routes require auth + admin role
router.use(protect, adminOnly);

// Dashboard
router.get('/dashboard', getDashboard);

// Questions
router.get('/questions', getQuestions);
router.post('/questions', createQuestion);
router.get('/questions/:id', getQuestion);
router.put('/questions/:id', updateQuestion);
router.delete('/questions/:id', deleteQuestion);

// Quizzes
router.get('/quizzes', getQuizzes);
router.post('/quizzes', createQuiz);
router.post('/quizzes/generate-pdf', upload.single('pdfFile'), generateQuizFromPdf);
router.put('/quizzes/:id', updateQuiz);
router.delete('/quizzes/:id', deleteQuiz);

// Participants
router.get('/participants', getParticipants);

// Results — export must be before :id patterns
router.get('/results/export', exportResults);
router.get('/results', getResults);

module.exports = router;
