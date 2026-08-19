const User = require('../models/User');
const Quiz = require('../models/Quiz');
const Question = require('../models/Question');
const Attempt = require('../models/Attempt');
const { calculateScore } = require('../utils/scoring');
const { PDFParse } = require('pdf-parse');
const { GoogleGenAI } = require('@google/genai');

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

// GET /api/admin/dashboard
const getDashboard = async (req, res) => {
  try {
    const [totalParticipants, totalAttempts, completedAttempts, attempts] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      Attempt.countDocuments(),
      Attempt.countDocuments({ status: { $in: ['completed', 'timed-out'] } }),
      Attempt.find({ status: 'completed' }).select('score percentage resultStatus submittedAt')
        .populate('userId', 'name email')
        .sort({ submittedAt: -1 }).limit(10)
    ]);

    const scores = await Attempt.find({ status: 'completed' }).select('score percentage');
    const avgScore = scores.length ? (scores.reduce((s, a) => s + (a.percentage || 0), 0) / scores.length).toFixed(2) : 0;
    const highestScore = scores.length ? Math.max(...scores.map(a => a.score || 0)) : 0;
    const passCount = scores.filter(a => (a.percentage || 0) >= 50).length;
    const passPercentage = scores.length ? ((passCount / scores.length) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      stats: {
        totalParticipants,
        totalAttempts,
        completedAttempts,
        avgScore,
        highestScore,
        passPercentage
      },
      recentSubmissions: attempts
    });
  } catch (error) {
    console.error('getDashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard data.' });
  }
};

// ─── QUESTIONS ────────────────────────────────────────────────────────────────

const getQuestions = async (req, res) => {
  try {
    const { quizId, category, difficulty, search } = req.query;
    const filter = {};
    if (quizId) filter.quizId = quizId;
    if (category) filter.category = category;
    if (difficulty) filter.difficulty = difficulty;
    if (search) filter.questionText = { $regex: search, $options: 'i' };

    const questions = await Question.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, count: questions.length, questions });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch questions.' });
  }
};

const createQuestion = async (req, res) => {
  try {
    const { quizId, questionText, options, correctOptionIndex, marks, negativeMarks, category, difficulty, explanation } = req.body;
    if (!quizId || !questionText || !options || correctOptionIndex === undefined || !category) {
      return res.status(400).json({ success: false, message: 'Required fields missing.' });
    }
    const question = await Question.create({ quizId, questionText, options, correctOptionIndex, marks, negativeMarks, category, difficulty, explanation });
    res.status(201).json({ success: true, message: 'Question created.', question });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to create question.' });
  }
};

const getQuestion = async (req, res) => {
  try {
    const question = await Question.findById(req.params.id);
    if (!question) return res.status(404).json({ success: false, message: 'Question not found.' });
    res.json({ success: true, question });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch question.' });
  }
};

const updateQuestion = async (req, res) => {
  try {
    const question = await Question.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!question) return res.status(404).json({ success: false, message: 'Question not found.' });
    res.json({ success: true, message: 'Question updated.', question });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to update question.' });
  }
};

const deleteQuestion = async (req, res) => {
  try {
    const question = await Question.findByIdAndDelete(req.params.id);
    if (!question) return res.status(404).json({ success: false, message: 'Question not found.' });
    res.json({ success: true, message: 'Question deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete question.' });
  }
};

// ─── QUIZZES ─────────────────────────────────────────────────────────────────

const getQuizzes = async (req, res) => {
  try {
    const quizzes = await Quiz.find().sort({ createdAt: -1 });
    const quizzesWithCount = await Promise.all(quizzes.map(async (q) => {
      const count = await Question.countDocuments({ quizId: q._id, isActive: true });
      return { ...q.toObject(), questionCount: count };
    }));
    res.json({ success: true, quizzes: quizzesWithCount });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch quizzes.' });
  }
};

const createQuiz = async (req, res) => {
  try {
    const quiz = await Quiz.create(req.body);
    res.status(201).json({ success: true, message: 'Quiz created.', quiz });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to create quiz.' });
  }
};

const updateQuiz = async (req, res) => {
  try {
    const quiz = await Quiz.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found.' });
    res.json({ success: true, message: 'Quiz updated.', quiz });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to update quiz.' });
  }
};

const deleteQuiz = async (req, res) => {
  try {
    const quiz = await Quiz.findByIdAndDelete(req.params.id);
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found.' });
    await Question.deleteMany({ quizId: quiz._id });
    await Attempt.deleteMany({ quizId: quiz._id });
    res.json({ success: true, message: 'Quiz and related data deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete quiz.' });
  }
};


const generateQuizFromPdf = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No PDF file uploaded.' });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ success: false, message: 'GEMINI_API_KEY is not configured on the server.' });
    }

    const { title, description, durationMinutes, totalMarks, marksPerQuestion, negativeMarks, passingPercentage, maxAttempts, category } = req.body;

    // Parse the PDF
    const parser = new PDFParse({ data: req.file.buffer });
    const pdfData = await parser.getText();
    const pdfText = pdfData.text;
    await parser.destroy();

    // Call Gemini
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const prompt = `
    You are an expert quiz generator. Extract questions from the following text and format them as a JSON array of objects.
    Each object MUST have the following structure:
    {
      "questionText": "The question itself",
      "options": ["Option A", "Option B", "Option C", "Option D"], // MUST be exactly 4 options
      "correctOptionIndex": 0, // Integer 0-3 indicating the correct option
      "difficulty": "Medium", // 'Easy', 'Medium', or 'Hard'
      "explanation": "Explanation for the correct answer, if any."
    }
    
    Text:
    ${pdfText}
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const questionsJson = JSON.parse(response.text);

    // Create the Quiz
    const quiz = await Quiz.create({
      title,
      description,
      durationMinutes,
      totalMarks,
      marksPerQuestion: marksPerQuestion || 1,
      negativeMarks: negativeMarks || 0,
      passingPercentage,
      maxAttempts,
      isActive: true
    });

    // Create Questions
    const questionsToInsert = questionsJson.map(q => ({
      quizId: quiz._id,
      questionText: q.questionText,
      options: q.options,
      correctOptionIndex: q.correctOptionIndex,
      marks: marksPerQuestion || 1,
      negativeMarks: negativeMarks || 0,
      category: category || 'Quantitative Aptitude',
      difficulty: q.difficulty || 'Medium',
      explanation: q.explanation || ''
    }));

    await Question.insertMany(questionsToInsert);

    res.status(201).json({ success: true, message: 'Quiz generated from PDF successfully.', quiz });

  } catch (error) {
    console.error('generateQuizFromPdf error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to generate quiz from PDF.' });
  }
};

// ─── PARTICIPANTS ─────────────────────────────────────────────────────────────

const getParticipants = async (req, res) => {
  try {
    const { search } = req.query;
    const filter = { role: 'student' };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },

      ];
    }
    const users = await User.find(filter).select('-passwordHash').sort({ createdAt: -1 });
    const usersWithAttempts = await Promise.all(users.map(async (u) => {
      const attempt = await Attempt.findOne({ userId: u._id, status: 'completed' }).select('score percentage resultStatus submittedAt');
      return { ...u.toObject(), attempt };
    }));
    res.json({ success: true, count: users.length, participants: usersWithAttempts });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch participants.' });
  }
};

// ─── RESULTS ─────────────────────────────────────────────────────────────────

const getResults = async (req, res) => {
  try {
    const { sortBy = 'score', order = 'desc', status } = req.query;
    const filter = { status: 'completed' };
    if (status) filter.resultStatus = status;

    const sortObj = {};
    sortObj[sortBy === 'time' ? 'submittedAt' : 'score'] = order === 'asc' ? 1 : -1;

    const attempts = await Attempt.find(filter)
      .populate('userId', 'name email course semester')
      .populate('quizId', 'title totalMarks')
      .sort(sortObj);

    const ranked = attempts.map((a, i) => ({
      rank: i + 1,
      name: a.userId?.name,
      email: a.userId?.email,

      course: a.userId?.course,
      quizTitle: a.quizId?.title,
      score: a.score,
      totalMarks: a.quizId?.totalMarks,
      percentage: a.percentage,
      correct: a.correct,
      incorrect: a.incorrect,
      unattempted: a.unattempted,
      resultStatus: a.resultStatus,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt
    }));

    res.json({ success: true, count: ranked.length, results: ranked });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch results.' });
  }
};

// GET /api/admin/results/export — CSV
const exportResults = async (req, res) => {
  try {
    const attempts = await Attempt.find({ status: 'completed' })
      .populate('userId', 'name email course semester')
      .populate('quizId', 'title totalMarks')
      .sort({ score: -1 });

    const header = 'Rank,Name,Email,Enrollment No,Course,Quiz,Score,Total Marks,Percentage,Correct,Incorrect,Unattempted,Started At,Submitted At,Status\n';
    const rows = attempts.map((a, i) =>
      [
        i + 1,
        `"${a.userId?.name || ''}"`,
        a.userId?.email || '',

        `"${a.userId?.course || ''}"`,
        `"${a.quizId?.title || ''}"`,
        a.score,
        a.quizId?.totalMarks,
        a.percentage,
        a.correct,
        a.incorrect,
        a.unattempted,
        a.startedAt ? new Date(a.startedAt).toISOString() : '',
        a.submittedAt ? new Date(a.submittedAt).toISOString() : '',
        a.resultStatus
      ].join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ieee-quiz-results.csv"');
    res.send(header + rows);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Export failed.' });
  }
};

module.exports = {
  getDashboard,
  getQuestions, createQuestion, getQuestion, updateQuestion, deleteQuestion,
  getQuizzes, createQuiz, updateQuiz, deleteQuiz, generateQuizFromPdf,
  getParticipants,
  getResults, exportResults
};
