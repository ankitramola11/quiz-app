const supabase = require('../config/db');
const { shuffle } = require('../utils/scoring');

// GET /api/quizzes/active
const getActiveQuiz = async (req, res) => {
  try {
    const now = new Date().toISOString();
    
    const { data: quizzes, error: quizError } = await supabase
      .from('quizzes')
      .select('*')
      .eq('is_active', true);

    if (quizError || !quizzes || quizzes.length === 0) {
      return res.status(404).json({ success: false, message: 'No active quiz found at this time.' });
    }

    const quiz = quizzes.find(q => {
      const start = q.start_at ? new Date(q.start_at).getTime() : null;
      const end = q.end_at ? new Date(q.end_at).getTime() : null;
      const currentTime = new Date(now).getTime();
      
      const isStarted = !start || start <= currentTime;
      const isEnded = end && end < currentTime;
      
      return isStarted && !isEnded;
    });

    if (!quiz) {
      return res.status(404).json({ success: false, message: 'No active quiz found at this time.' });
    }

    const { data: existingAttempts } = await supabase
      .from('attempts')
      .select('id, status')
      .eq('user_id', req.user.id)
      .eq('quiz_id', quiz.id)
      .in('status', ['completed', 'timed-out']);

    const existingAttempt = existingAttempts && existingAttempts.length > 0 ? existingAttempts[0] : null;

    const { count } = await supabase
      .from('questions')
      .select('*', { count: 'exact', head: true })
      .eq('quiz_id', quiz.id)
      .eq('is_active', true);

    res.json({
      success: true,
      quiz: {
        _id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        durationMinutes: quiz.duration_minutes,
        totalMarks: quiz.total_marks,
        marksPerQuestion: quiz.marks_per_question,
        negativeMarks: quiz.negative_marks,
        passingPercentage: quiz.passing_percentage,
        maxAttempts: quiz.max_attempts,
        questionCount: count || 0,
        alreadyAttempted: !!existingAttempt,
        attemptId: existingAttempt ? existingAttempt.id : null
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

    const { data: attempt } = await supabase
      .from('attempts')
      .select('id, started_at')
      .eq('user_id', req.user.id)
      .eq('quiz_id', quizId)
      .eq('status', 'in-progress')
      .maybeSingle();

    if (!attempt) {
      return res.status(403).json({ success: false, message: 'No active attempt found. Please start the quiz first.' });
    }

    const { data: quiz } = await supabase
      .from('quizzes')
      .select('*')
      .eq('id', quizId)
      .maybeSingle();

    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found.' });

    let { data: questions } = await supabase
      .from('questions')
      .select('id, question_text, options, marks, negative_marks, category, difficulty, is_active')
      .eq('quiz_id', quizId)
      .eq('is_active', true);

    if (!questions) questions = [];

    // format for frontend compatibility
    questions = questions.map(q => ({
      _id: q.id,
      questionText: q.question_text,
      options: q.options,
      marks: q.marks,
      negativeMarks: q.negative_marks,
      category: q.category,
      difficulty: q.difficulty
    }));

    if (quiz.randomize_questions) {
      questions = shuffle(questions);
    }

    const { data: savedAnswersData } = await supabase
      .from('attempt_answers')
      .select('question_id, selected_option_index')
      .eq('attempt_id', attempt.id);

    const savedAnswers = savedAnswersData ? savedAnswersData.map(a => ({
      questionId: a.question_id,
      selectedOptionIndex: a.selected_option_index
    })) : [];

    res.json({
      success: true,
      attemptId: attempt.id,
      startedAt: attempt.started_at,
      durationMinutes: quiz.duration_minutes,
      questions,
      savedAnswers
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
    const userId = req.user.id;

    const { data: quiz } = await supabase
      .from('quizzes')
      .select('*')
      .eq('id', quizId)
      .maybeSingle();

    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found.' });
    if (!quiz.is_active) return res.status(400).json({ success: false, message: 'This quiz is not active.' });

    const now = new Date();
    if (quiz.start_at && now < new Date(quiz.start_at)) {
      return res.status(400).json({ success: false, message: 'Quiz has not started yet.' });
    }
    if (quiz.end_at && now > new Date(quiz.end_at)) {
      return res.status(400).json({ success: false, message: 'Quiz has ended.' });
    }

    const { count: completedAttempts } = await supabase
      .from('attempts')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('quiz_id', quizId)
      .in('status', ['completed', 'timed-out']);

    if (completedAttempts >= quiz.max_attempts) {
      return res.status(403).json({ success: false, message: `You have already used all ${quiz.max_attempts} attempt(s) for this quiz.` });
    }

    let { data: attempt } = await supabase
      .from('attempts')
      .select('*')
      .eq('user_id', userId)
      .eq('quiz_id', quizId)
      .eq('status', 'in-progress')
      .maybeSingle();

    if (attempt) {
      const elapsed = (now - new Date(attempt.started_at)) / 1000 / 60;
      if (elapsed >= quiz.duration_minutes) {
        return res.status(400).json({ success: false, message: 'Your previous attempt has timed out. Please submit it.' });
      }
      return res.json({
        success: true,
        message: 'Resuming existing attempt.',
        attemptId: attempt.id,
        quizId: attempt.quiz_id,
        startedAt: attempt.started_at,
        durationMinutes: quiz.duration_minutes
      });
    }

    const { data: newAttempt, error: createError } = await supabase
      .from('attempts')
      .insert({
        user_id: userId,
        quiz_id: quizId,
        started_at: now.toISOString(),
        status: 'in-progress'
      })
      .select()
      .single();

    if (createError) {
      throw createError;
    }

    res.status(201).json({
      success: true,
      message: 'Quiz started successfully.',
      attemptId: newAttempt.id,
      quizId: newAttempt.quiz_id,
      startedAt: newAttempt.started_at,
      durationMinutes: quiz.duration_minutes
    });
  } catch (error) {
    console.error('startAttempt error:', error);
    res.status(500).json({ success: false, message: 'Failed to start quiz.' });
  }
};

module.exports = { getActiveQuiz, getQuizQuestions, startAttempt };
