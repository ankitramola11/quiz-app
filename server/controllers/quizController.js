const Quiz = require('../models/Quiz');
const Question = require('../models/Question');
const Attempt = require('../models/Attempt');
const { shuffle } = require('../utils/scoring');

// GET /api/quizzes/active
const getActiveQuiz = async (req, res) => {
  try {
    const now = new Date();
    const quiz = await Quiz.findOne({
      isActive: true,
      $or: [
        { startAt: null },
        { startAt: { $lte: now } }
      ],
      $or: [
        { endAt: null },
        { endAt: { $gte: now } }
      ]
    }).select('-__v');

    if (!quiz) {
      return res.status(404).json({ success: false, message: 'No active quiz found at this time.' });
    }

    // Check if user already has a completed attempt
    const existingAttempt = await Attempt.findOne({
      userId: req.user._id,
      quizId: quiz._id,
      status: { $in: ['completed', 'timed-out'] }
    });

    const questionCount = await Question.countDocuments({ quizId: quiz._id, isActive: true });

    res.json({
      success: true,
      quiz: {
        _id: quiz._id,
        title: quiz.title,
        description: quiz.description,
        durationMinutes: quiz.durationMinutes,
        totalMarks: quiz.totalMarks,
        marksPerQuestion: quiz.marksPerQuestion,
        negativeMarks: quiz.negativeMarks,
        passingPercentage: quiz.passingPercentage,
        maxAttempts: quiz.maxAttempts,
        questionCount,
        alreadyAttempted: !!existingAttempt,
        attemptId: existingAttempt ? existingAttempt._id : null
      }
    });
  } catch (error) {
    console.error('getActiveQuiz error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch quiz.' });
  }
};

// GET /api/quizzes/:quizId/questions — NO correctOptionIndex sent
const getQuizQuestions = async (req, res) => {
  try {
    const { quizId } = req.params;

    // Verify active attempt exists
    const attempt = await Attempt.findOne({
      userId: req.user._id,
      quizId,
      status: 'in-progress'
    });

    if (!attempt) {
      return res.status(403).json({ success: false, message: 'No active attempt found. Please start the quiz first.' });
    }

    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found.' });

    let questions = await Question.findById
      ? await Question.find({ quizId, isActive: true }).select('-correctOptionIndex -__v')
      : [];

    // Actually query correctly:
    questions = await Question.find({ quizId, isActive: true }).select('-correctOptionIndex -explanation -__v');

    if (quiz.randomizeQuestions) {
      questions = shuffle(questions);
    }

    res.json({
      success: true,
      attemptId: attempt._id,
      startedAt: attempt.startedAt,
      durationMinutes: quiz.durationMinutes,
      questions,
      savedAnswers: attempt.answers
    });
  } catch (error) {
    console.error('getQuizQuestions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch questions.' });
  }
};

// POST /api/quizzes/:quizId/start
const startAttempt = async (req, res) => {
  try {
    const { quizId } = req.params;
    const userId = req.user._id;

    const quiz = await Quiz.findById(quizId);
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found.' });
    if (!quiz.isActive) return res.status(400).json({ success: false, message: 'This quiz is not active.' });

    const now = new Date();
    if (quiz.startAt && now < quiz.startAt) {
      return res.status(400).json({ success: false, message: 'Quiz has not started yet.' });
    }
    if (quiz.endAt && now > quiz.endAt) {
      return res.status(400).json({ success: false, message: 'Quiz has ended.' });
    }

    // Check existing attempts
    const completedAttempts = await Attempt.countDocuments({
      userId,
      quizId,
      status: { $in: ['completed', 'timed-out'] }
    });

    if (completedAttempts >= quiz.maxAttempts) {
      return res.status(403).json({ success: false, message: `You have already used all ${quiz.maxAttempts} attempt(s) for this quiz.` });
    }

    // Check for in-progress attempt (resume)
    let attempt = await Attempt.findOne({ userId, quizId, status: 'in-progress' });
    if (attempt) {
      // Check if time expired for this in-progress attempt
      const elapsed = (now - attempt.startedAt) / 1000 / 60;
      if (elapsed >= quiz.durationMinutes) {
        // Auto-submit expired attempt
        return res.status(400).json({ success: false, message: 'Your previous attempt has timed out. Please submit it.' });
      }
      return res.json({
        success: true,
        message: 'Resuming existing attempt.',
        attemptId: attempt._id,
        quizId: attempt.quizId,
        startedAt: attempt.startedAt,
        durationMinutes: quiz.durationMinutes
      });
    }

    // Create new attempt
    attempt = await Attempt.create({
      userId,
      quizId,
      startedAt: now,
      status: 'in-progress',
      answers: []
    });

    res.status(201).json({
      success: true,
      message: 'Quiz started successfully.',
      attemptId: attempt._id,
      quizId: attempt.quizId,
      startedAt: attempt.startedAt,
      durationMinutes: quiz.durationMinutes
    });
  } catch (error) {
    console.error('startAttempt error:', error);
    res.status(500).json({ success: false, message: 'Failed to start quiz.' });
  }
};

module.exports = { getActiveQuiz, getQuizQuestions, startAttempt };
