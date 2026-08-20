const supabase = require('../config/db');
const { calculateScore } = require('../utils/scoring');

// POST /api/attempts/:attemptId/answer
const saveAnswer = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const { questionId, selectedOptionIndex } = req.body;

    const { data: attempt } = await supabase
      .from('attempts')
      .select('*')
      .eq('id', attemptId)
      .maybeSingle();

    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found.' });
    if (attempt.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (attempt.status !== 'in-progress') {
      return res.status(400).json({ success: false, message: 'This attempt has already been submitted.' });
    }

    const { data: quiz } = await supabase.from('quizzes').select('duration_minutes').eq('id', attempt.quiz_id).single();
    
    const elapsed = (Date.now() - new Date(attempt.started_at).getTime()) / 1000 / 60;
    if (elapsed > quiz.duration_minutes + 0.5) {
      await supabase.from('attempts').update({ status: 'timed-out' }).eq('id', attemptId);
      return res.status(400).json({ success: false, message: 'Quiz time has expired.' });
    }

    const { data: question } = await supabase
      .from('questions')
      .select('id')
      .eq('id', questionId)
      .eq('quiz_id', attempt.quiz_id)
      .maybeSingle();

    if (!question) return res.status(400).json({ success: false, message: 'Invalid question ID.' });

    const { data: existingAnswer } = await supabase
      .from('attempt_answers')
      .select('id')
      .eq('attempt_id', attemptId)
      .eq('question_id', questionId)
      .maybeSingle();

    if (existingAnswer) {
      await supabase
        .from('attempt_answers')
        .update({ selected_option_index: selectedOptionIndex ?? null })
        .eq('id', existingAnswer.id);
    } else {
      await supabase
        .from('attempt_answers')
        .insert({
          attempt_id: attemptId,
          question_id: questionId,
          selected_option_index: selectedOptionIndex ?? null
        });
    }

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

    const { data: attempt } = await supabase
      .from('attempts')
      .select('*')
      .eq('id', attemptId)
      .maybeSingle();

    if (!attempt) return res.status(404).json({ success: false, message: 'Attempt not found.' });
    if (attempt.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    // Idempotent: if already submitted, return the existing result
    if (attempt.status !== 'in-progress') {
      return res.json({ success: true, message: 'Already submitted.', attemptId: attempt.id, result: {
        score: attempt.score, percentage: attempt.percentage,
        correct: attempt.correct, incorrect: attempt.incorrect,
        unattempted: attempt.unattempted, resultStatus: attempt.result_status
      }});
    }

    const { data: quiz } = await supabase.from('quizzes').select('*').eq('id', attempt.quiz_id).single();
    
    // Map snake_case to camelCase for the scoring utility
    const mappedQuiz = {
      ...quiz,
      totalMarks: quiz.total_marks,
      marksPerQuestion: quiz.marks_per_question,
      negativeMarks: quiz.negative_marks,
      passingPercentage: quiz.passing_percentage
    };

    const { data: questions } = await supabase
      .from('questions')
      .select('*')
      .eq('quiz_id', attempt.quiz_id)
      .eq('is_active', true);

    const mappedQuestions = questions.map(q => ({
      _id: q.id,
      correctOptionIndex: q.correct_option_index,
      marks: q.marks,
      negativeMarks: q.negative_marks
    }));

    const answersData = (await supabase
      .from('attempt_answers')
      .select('*')
      .eq('attempt_id', attemptId)).data || [];

    const mappedAnswers = answersData.map(a => ({
      questionId: a.question_id,
      selectedOptionIndex: a.selected_option_index
    }));

    const result = calculateScore(mappedQuestions, mappedAnswers, mappedQuiz);

    await supabase
      .from('attempts')
      .update({
        status: 'completed',
        submitted_at: new Date().toISOString(),
        score: result.score,
        percentage: result.percentage,
        correct: result.correct,
        incorrect: result.incorrect,
        unattempted: result.unattempted,
        result_status: result.resultStatus
      })
      .eq('id', attemptId);

    res.json({
      success: true,
      message: 'Quiz submitted successfully.',
      attemptId: attempt.id,
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

    const { data: attempt } = await supabase
      .from('attempts')
      .select(`
        *,
        users ( id, name, email, course, semester ),
        quizzes ( id, title, total_marks, marks_per_question, negative_marks, passing_percentage, duration_minutes )
      `)
      .eq('id', attemptId)
      .maybeSingle();

    if (!attempt) return res.status(404).json({ success: false, message: 'Result not found.' });
    if (attempt.users.id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    if (attempt.status === 'in-progress') {
      return res.status(400).json({ success: false, message: 'Quiz has not been submitted yet.' });
    }

    res.json({
      success: true,
      result: {
        student: attempt.users,
        quiz: {
          _id: attempt.quizzes.id,
          title: attempt.quizzes.title,
          totalMarks: attempt.quizzes.total_marks,
          marksPerQuestion: attempt.quizzes.marks_per_question,
          negativeMarks: attempt.quizzes.negative_marks,
          passingPercentage: attempt.quizzes.passing_percentage,
          durationMinutes: attempt.quizzes.duration_minutes
        },
        score: attempt.score,
        percentage: attempt.percentage,
        correct: attempt.correct,
        incorrect: attempt.incorrect,
        unattempted: attempt.unattempted,
        totalQuestions: attempt.correct + attempt.incorrect + attempt.unattempted,
        resultStatus: attempt.result_status,
        startedAt: attempt.started_at,
        submittedAt: attempt.submitted_at,
        status: attempt.status
      }
    });
  } catch (error) {
    console.error('getResult error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch result.' });
  }
};

module.exports = { saveAnswer, submitAttempt, getResult };
