/**
 * Scoring utility for IEEE SRHU Student Branch Quiz App
 * All score calculation happens SERVER-SIDE only.
 */

/**
 * Calculate quiz result from submitted answers
 * @param {Array} questions - Full question documents (with correctOptionIndex)
 * @param {Array} answers - Submitted answers [{questionId, selectedOptionIndex}]
 * @param {Object} quiz - Quiz document (marksPerQuestion, negativeMarks, passingPercentage, totalMarks)
 * @returns {Object} result stats
 */
const calculateScore = (questions, answers, quiz) => {
  let correct = 0;
  let incorrect = 0;
  let unattempted = 0;

  const answerMap = {};
  answers.forEach(a => {
    answerMap[a.questionId.toString()] = a.selectedOptionIndex;
  });

  questions.forEach(q => {
    const selected = answerMap[q._id.toString()];
    if (selected === null || selected === undefined) {
      unattempted++;
    } else if (selected === q.correctOptionIndex) {
      correct++;
    } else {
      incorrect++;
    }
  });

  const marksPerQuestion = quiz.marksPerQuestion || 1;
  const negativeMarks = quiz.negativeMarks || 0;
  const totalMarks = quiz.totalMarks || questions.length;

  const rawScore = (correct * marksPerQuestion) - (incorrect * negativeMarks);
  const finalScore = Math.max(0, parseFloat(rawScore.toFixed(2)));
  const percentage = parseFloat(((finalScore / totalMarks) * 100).toFixed(2));
  const resultStatus = percentage >= quiz.passingPercentage ? 'QUALIFIED' : 'NOT QUALIFIED';

  return {
    correct,
    incorrect,
    unattempted,
    score: finalScore,
    percentage,
    resultStatus,
    totalMarks,
    totalQuestions: questions.length
  };
};

/**
 * Shuffle array using Fisher-Yates
 */
const shuffle = (array) => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

module.exports = { calculateScore, shuffle };
