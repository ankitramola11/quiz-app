const supabase = require('../config/db');
const { calculateScore } = require('../utils/scoring');
const { PDFParse } = require('pdf-parse');
const { GoogleGenAI } = require('@google/genai');

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

// GET /api/admin/dashboard
const getDashboard = async (req, res) => {
  try {
    const { count: totalParticipants } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', 'student');
    const { count: totalAttempts } = await supabase.from('attempts').select('*', { count: 'exact', head: true });
    const { count: completedAttempts } = await supabase.from('attempts').select('*', { count: 'exact', head: true }).in('status', ['completed', 'timed-out']);
    
    const { data: recentAttempts } = await supabase
      .from('attempts')
      .select('score, percentage, result_status, submitted_at, users(name, email)')
      .eq('status', 'completed')
      .order('submitted_at', { ascending: false })
      .limit(10);

    const { data: scores } = await supabase.from('attempts').select('score, percentage').eq('status', 'completed');

    const avgScore = scores && scores.length ? (scores.reduce((s, a) => s + (Number(a.percentage) || 0), 0) / scores.length).toFixed(2) : 0;
    const highestScore = scores && scores.length ? Math.max(...scores.map(a => Number(a.score) || 0)) : 0;
    const passCount = scores ? scores.filter(a => (Number(a.percentage) || 0) >= 50).length : 0;
    const passPercentage = scores && scores.length ? ((passCount / scores.length) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      stats: {
        totalParticipants: totalParticipants || 0,
        totalAttempts: totalAttempts || 0,
        completedAttempts: completedAttempts || 0,
        avgScore,
        highestScore,
        passPercentage
      },
      recentSubmissions: recentAttempts ? recentAttempts.map(a => ({
        score: a.score,
        percentage: a.percentage,
        resultStatus: a.result_status,
        submittedAt: a.submitted_at,
        userId: { name: a.users?.name, email: a.users?.email }
      })) : []
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
    let query = supabase.from('questions').select('*').order('created_at', { ascending: false });

    if (quizId) query = query.eq('quiz_id', quizId);
    if (category) query = query.eq('category', category);
    if (difficulty) query = query.eq('difficulty', difficulty);
    if (search) query = query.ilike('question_text', `%${search}%`);

    const { data: questions, error } = await query;
    if (error) throw error;

    const mapped = questions.map(q => ({
      _id: q.id,
      quizId: q.quiz_id,
      questionText: q.question_text,
      options: q.options,
      correctOptionIndex: q.correct_option_index,
      marks: q.marks,
      negativeMarks: q.negative_marks,
      category: q.category,
      difficulty: q.difficulty,
      explanation: q.explanation,
      isActive: q.is_active,
      createdAt: q.created_at
    }));

    res.json({ success: true, count: mapped.length, questions: mapped });
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
    const { data: question, error } = await supabase
      .from('questions')
      .insert({
        quiz_id: quizId,
        question_text: questionText,
        options,
        correct_option_index: correctOptionIndex,
        marks,
        negative_marks: negativeMarks,
        category,
        difficulty,
        explanation
      })
      .select()
      .single();
    
    if (error) throw error;
    res.status(201).json({ success: true, message: 'Question created.', question: { _id: question.id, ...question } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to create question.' });
  }
};

const getQuestion = async (req, res) => {
  try {
    const { data: question, error } = await supabase.from('questions').select('*').eq('id', req.params.id).maybeSingle();
    if (error || !question) return res.status(404).json({ success: false, message: 'Question not found.' });
    
    const mapped = {
      _id: question.id,
      quizId: question.quiz_id,
      questionText: question.question_text,
      options: question.options,
      correctOptionIndex: question.correct_option_index,
      marks: question.marks,
      negativeMarks: question.negative_marks,
      category: question.category,
      difficulty: question.difficulty,
      explanation: question.explanation,
      isActive: question.is_active
    };
    res.json({ success: true, question: mapped });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch question.' });
  }
};

const updateQuestion = async (req, res) => {
  try {
    const { quizId, questionText, options, correctOptionIndex, marks, negativeMarks, category, difficulty, explanation, isActive } = req.body;
    
    const updates = {};
    if (quizId !== undefined) updates.quiz_id = quizId;
    if (questionText !== undefined) updates.question_text = questionText;
    if (options !== undefined) updates.options = options;
    if (correctOptionIndex !== undefined) updates.correct_option_index = correctOptionIndex;
    if (marks !== undefined) updates.marks = marks;
    if (negativeMarks !== undefined) updates.negative_marks = negativeMarks;
    if (category !== undefined) updates.category = category;
    if (difficulty !== undefined) updates.difficulty = difficulty;
    if (explanation !== undefined) updates.explanation = explanation;
    if (isActive !== undefined) updates.is_active = isActive;

    const { data: question, error } = await supabase
      .from('questions')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
      
    if (error) return res.status(404).json({ success: false, message: 'Question not found.' });
    res.json({ success: true, message: 'Question updated.', question: { _id: question.id, ...question } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to update question.' });
  }
};

const deleteQuestion = async (req, res) => {
  try {
    const { error } = await supabase.from('questions').delete().eq('id', req.params.id);
    if (error) return res.status(404).json({ success: false, message: 'Question not found.' });
    res.json({ success: true, message: 'Question deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete question.' });
  }
};

// ─── QUIZZES ─────────────────────────────────────────────────────────────────

const getQuizzes = async (req, res) => {
  try {
    const { data: quizzes, error } = await supabase.from('quizzes').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    
    const quizzesWithCount = await Promise.all(quizzes.map(async (q) => {
      const { count } = await supabase.from('questions').select('*', { count: 'exact', head: true }).eq('quiz_id', q.id).eq('is_active', true);
      return {
        _id: q.id,
        title: q.title,
        description: q.description,
        durationMinutes: q.duration_minutes,
        totalMarks: q.total_marks,
        marksPerQuestion: q.marks_per_question,
        negativeMarks: q.negative_marks,
        passingPercentage: q.passing_percentage,
        maxAttempts: q.max_attempts,
        isActive: q.is_active,
        randomizeQuestions: q.randomize_questions,
        randomizeOptions: q.randomize_options,
        showResultAfterSubmit: q.show_result_after_submit,
        startAt: q.start_at,
        endAt: q.end_at,
        questionCount: count || 0
      };
    }));
    res.json({ success: true, quizzes: quizzesWithCount });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch quizzes.' });
  }
};

const createQuiz = async (req, res) => {
  try {
    const { title, description, durationMinutes, totalMarks, marksPerQuestion, negativeMarks, passingPercentage, maxAttempts, isActive, randomizeQuestions, randomizeOptions, showResultAfterSubmit, startAt, endAt } = req.body;
    
    const { data: quiz, error } = await supabase
      .from('quizzes')
      .insert({
        title, description, duration_minutes: durationMinutes, total_marks: totalMarks, marks_per_question: marksPerQuestion, negative_marks: negativeMarks, passing_percentage: passingPercentage, max_attempts: maxAttempts, is_active: isActive, randomize_questions: randomizeQuestions, randomize_options: randomizeOptions, show_result_after_submit: showResultAfterSubmit, start_at: startAt, end_at: endAt
      })
      .select()
      .single();
      
    if (error) throw error;
    res.status(201).json({ success: true, message: 'Quiz created.', quiz: { _id: quiz.id, ...quiz } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to create quiz.' });
  }
};

const updateQuiz = async (req, res) => {
  try {
    const { title, description, durationMinutes, totalMarks, marksPerQuestion, negativeMarks, passingPercentage, maxAttempts, isActive, randomizeQuestions, randomizeOptions, showResultAfterSubmit, startAt, endAt } = req.body;
    
    const updates = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (durationMinutes !== undefined) updates.duration_minutes = durationMinutes;
    if (totalMarks !== undefined) updates.total_marks = totalMarks;
    if (marksPerQuestion !== undefined) updates.marks_per_question = marksPerQuestion;
    if (negativeMarks !== undefined) updates.negative_marks = negativeMarks;
    if (passingPercentage !== undefined) updates.passing_percentage = passingPercentage;
    if (maxAttempts !== undefined) updates.max_attempts = maxAttempts;
    if (isActive !== undefined) updates.is_active = isActive;
    if (randomizeQuestions !== undefined) updates.randomize_questions = randomizeQuestions;
    if (randomizeOptions !== undefined) updates.randomize_options = randomizeOptions;
    if (showResultAfterSubmit !== undefined) updates.show_result_after_submit = showResultAfterSubmit;
    if (startAt !== undefined) updates.start_at = startAt;
    if (endAt !== undefined) updates.end_at = endAt;

    const { data: quiz, error } = await supabase
      .from('quizzes')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
      
    if (error) return res.status(404).json({ success: false, message: 'Quiz not found.' });
    res.json({ success: true, message: 'Quiz updated.', quiz: { _id: quiz.id, ...quiz } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Failed to update quiz.' });
  }
};

const deleteQuiz = async (req, res) => {
  try {
    // Supabase foreign keys should have ON DELETE CASCADE so deleting the quiz will delete questions and attempts.
    const { error } = await supabase.from('quizzes').delete().eq('id', req.params.id);
    if (error) return res.status(404).json({ success: false, message: 'Quiz not found.' });
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

    const parser = new PDFParse({ data: req.file.buffer });
    const pdfData = await parser.getText();
    const pdfText = pdfData.text;
    await parser.destroy();

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

    const { data: quiz, error: quizError } = await supabase
      .from('quizzes')
      .insert({
        title,
        description,
        duration_minutes: durationMinutes,
        total_marks: totalMarks,
        marks_per_question: marksPerQuestion || 1,
        negative_marks: negativeMarks || 0,
        passing_percentage: passingPercentage,
        max_attempts: maxAttempts,
        is_active: true
      })
      .select()
      .single();

    if (quizError) throw quizError;

    const questionsToInsert = questionsJson.map(q => ({
      quiz_id: quiz.id,
      question_text: q.questionText,
      options: q.options,
      correct_option_index: q.correctOptionIndex,
      marks: marksPerQuestion || 1,
      negative_marks: negativeMarks || 0,
      category: category || 'Quantitative Aptitude',
      difficulty: q.difficulty || 'Medium',
      explanation: q.explanation || ''
    }));

    await supabase.from('questions').insert(questionsToInsert);

    res.status(201).json({ success: true, message: 'Quiz generated from PDF successfully.', quiz: { _id: quiz.id, ...quiz } });

  } catch (error) {
    console.error('generateQuizFromPdf error:', error);
    res.status(500).json({ success: false, message: error.message || 'Failed to generate quiz from PDF.' });
  }
};

// ─── PARTICIPANTS ─────────────────────────────────────────────────────────────

const getParticipants = async (req, res) => {
  try {
    const { search } = req.query;
    let query = supabase
      .from('users')
      .select('id, name, email, course, semester, department, gender, ieee_status, role, created_at')
      .eq('role', 'student')
      .order('created_at', { ascending: false });

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    }

    const { data: users, error } = await query;
    if (error) throw error;

    // Batch fetch: ONE query for all completed attempts (not 400 individual queries!)
    const userIds = users.map(u => u.id);
    const { data: allAttempts } = userIds.length > 0
      ? await supabase
          .from('attempts')
          .select('user_id, score, percentage, result_status, submitted_at')
          .in('user_id', userIds)
          .eq('status', 'completed')
          .order('submitted_at', { ascending: false })
      : { data: [] };

    // Build a map of userId → latest attempt
    const attemptMap = {};
    (allAttempts || []).forEach(a => {
      if (!attemptMap[a.user_id]) attemptMap[a.user_id] = a; // first = latest due to ordering
    });

    const participants = users.map(u => ({
      _id: u.id,
      name: u.name,
      email: u.email,
      course: u.course,
      semester: u.semester,
      department: u.department,
      ieeeStatus: u.ieee_status,
      attempt: attemptMap[u.id] ? {
        score: attemptMap[u.id].score,
        percentage: attemptMap[u.id].percentage,
        resultStatus: attemptMap[u.id].result_status,
        submittedAt: attemptMap[u.id].submitted_at
      } : null
    }));

    res.json({ success: true, count: participants.length, participants });
  } catch (error) {
    console.error('getParticipants error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch participants.' });
  }
};

// ─── RESULTS ─────────────────────────────────────────────────────────────────

const getResults = async (req, res) => {
  try {
    const { sortBy = 'score', order = 'desc', status } = req.query;
    let query = supabase
      .from('attempts')
      .select('*, users(name, email, course, semester), quizzes(title, total_marks)')
      .eq('status', 'completed');

    if (status) query = query.eq('result_status', status);

    const sortCol = sortBy === 'time' ? 'submitted_at' : 'score';
    query = query.order(sortCol, { ascending: order === 'asc' });

    const { data: attempts, error } = await query;
    if (error) throw error;

    const ranked = attempts.map((a, i) => ({
      rank: i + 1,
      name: a.users?.name,
      email: a.users?.email,
      course: a.users?.course,
      quizTitle: a.quizzes?.title,
      score: a.score,
      totalMarks: a.quizzes?.total_marks,
      percentage: a.percentage,
      correct: a.correct,
      incorrect: a.incorrect,
      unattempted: a.unattempted,
      resultStatus: a.result_status,
      startedAt: a.started_at,
      submittedAt: a.submitted_at
    }));

    res.json({ success: true, count: ranked.length, results: ranked });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch results.' });
  }
};

const exportResults = async (req, res) => {
  try {
    const { data: attempts, error } = await supabase
      .from('attempts')
      .select('*, users(name, email, course, semester), quizzes(title, total_marks)')
      .eq('status', 'completed')
      .order('score', { ascending: false });

    if (error) throw error;

    const header = 'Rank,Name,Email,Course,Quiz,Score,Total Marks,Percentage,Correct,Incorrect,Unattempted,Started At,Submitted At,Status\n';
    const rows = attempts.map((a, i) =>
      [
        i + 1,
        `"${a.users?.name || ''}"`,
        a.users?.email || '',
        `"${a.users?.course || ''}"`,
        `"${a.quizzes?.title || ''}"`,
        a.score,
        a.quizzes?.total_marks,
        a.percentage,
        a.correct,
        a.incorrect,
        a.unattempted,
        a.started_at ? new Date(a.started_at).toISOString() : '',
        a.submitted_at ? new Date(a.submitted_at).toISOString() : '',
        a.result_status
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
