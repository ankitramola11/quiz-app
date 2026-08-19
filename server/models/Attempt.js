const mongoose = require('mongoose');

const answerSchema = new mongoose.Schema({
  questionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question',
    required: true
  },
  selectedOptionIndex: {
    type: Number,
    default: null // null means skipped/unattempted
  }
}, { _id: false });

const attemptSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  quizId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Quiz',
    required: true
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  submittedAt: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['in-progress', 'completed', 'timed-out'],
    default: 'in-progress'
  },
  answers: [answerSchema],
  // Populated after evaluation
  score: {
    type: Number,
    default: null
  },
  percentage: {
    type: Number,
    default: null
  },
  correct: {
    type: Number,
    default: null
  },
  incorrect: {
    type: Number,
    default: null
  },
  unattempted: {
    type: Number,
    default: null
  },
  status: {
    type: String,
    enum: ['in-progress', 'completed', 'timed-out'],
    default: 'in-progress'
  },
  resultStatus: {
    type: String,
    enum: ['QUALIFIED', 'NOT QUALIFIED', null],
    default: null
  }
}, {
  timestamps: true
});

// Compound index to check existing attempts per user per quiz
attemptSchema.index({ userId: 1, quizId: 1 });

module.exports = mongoose.model('Attempt', attemptSchema);
