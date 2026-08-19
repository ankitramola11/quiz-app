const Attempt = require('../models/Attempt');
const Quiz = require('../models/Quiz');
const Question = require('../models/Question');
const { calculateScore } = require('../utils/scoring');

// POST /api/attempts/:attemptId/answer
const saveAnswer = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { questionId, selectedOptionIndex } = req.body;

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found.' });
    if (attempt.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (attempt.status !== 'in-progress') {
      return res.status(400).json({ success: false, message: 'This attempt has already been submitted.' });
    }

    // Server-side timer check
    const quiz = await Quiz.findById(attempt.quizId);
    const elapsed = (Date.now() - attempt.startedAt) / 1000 / 60;
    if (elapsed > quiz.durationMinutes + 0.5) { // 30s grace period
      attempt.status = 'timed-out';
      await attempt.save();
      return res.status(400).json({ success: false, message: 'Quiz time has expired.' });
    }

    // Validate questionId belongs to this quiz
    const question = await Question.findOne({ _id: questionId, quizId: attempt.quizId });
    if (!question) return res.status(400).json({ success: false, message: 'Invalid question ID.' });

    // Upsert answer
    const existingIdx = attempt.answers.findIndex(a => a.questionId.toString() === questionId);
    if (existingIdx >= 0) {
      attempt.answers[existingIdx].selectedOptionIndex = selectedOptionIndex ?? null;
    } else {
      attempt.answers.push({ questionId, selectedOptionIndex: selectedOptionIndex ?? null });
    }

    await attempt.save();
    res.json({ success: true, message: 'Answer saved.' });
  } catch (error) {
    console.error('saveAnswer error:', error);
    res.status(500).json({ success: false, message: 'Failed to save answer.' });
  }
};

// POST /api/attempts/:attemptId/submit
const submitAttempt = async (req, res) => {
  try {
    const { attemptId } = req.params;

    const attempt = await Attempt.findById(attemptId);
    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found.' });
    if (attempt.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (attempt.status !== 'in-progress') {
      return res.status(400).json({ success: false, message: 'This attempt has already been submitted.' });
    }

    const quiz = await Quiz.findById(attempt.quizId);
    const questions = await Question.find({ quizId: attempt.quizId, isActive: true });

    const result = calculateScore(questions, attempt.answers, quiz);

    attempt.status = 'completed';
    attempt.submittedAt = new Date();
    attempt.score = result.score;
    attempt.percentage = result.percentage;
    attempt.correct = result.correct;
    attempt.incorrect = result.incorrect;
    attempt.unattempted = result.unattempted;
    attempt.resultStatus = result.resultStatus;

    await attempt.save();

    res.json({
      success: true,
      message: 'Quiz submitted successfully.',
      attemptId: attempt._id,
      result
    });
  } catch (error) {
    console.error('submitAttempt error:', error);
    res.status(500).json({ success: false, message: 'Submission failed. Please try again.' });
  }
};

// GET /api/attempts/:attemptId/result
const getResult = async (req, res) => {
  try {
    const { attemptId } = req.params;

    const attempt = await Attempt.findById(attemptId)
      .populate('userId', 'name email course semester')
      .populate('quizId', 'title totalMarks marksPerQuestion negativeMarks passingPercentage durationMinutes');

    if (!attempt) return res.status(404).json({ success: false, message: 'Result not found.' });
    if (attempt.userId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (attempt.status === 'in-progress') {
      return res.status(400).json({ success: false, message: 'Quiz has not been submitted yet.' });
    }

    res.json({
      success: true,
      result: {
        student: attempt.userId,
        quiz: attempt.quizId,
        score: attempt.score,
        percentage: attempt.percentage,
        correct: attempt.correct,
        incorrect: attempt.incorrect,
        unattempted: attempt.unattempted,
        totalQuestions: attempt.correct + attempt.incorrect + attempt.unattempted,
        resultStatus: attempt.resultStatus,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        status: attempt.status
      }
    });
  } catch (error) {
    console.error('getResult error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch result.' });
  }
};

module.exports = { saveAnswer, submitAttempt, getResult };
