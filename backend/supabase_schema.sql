-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Drop tables first (order matters due to FK constraints) ──────────────────
DROP TABLE IF EXISTS attempt_answers CASCADE;
DROP TABLE IF EXISTS attempts CASCADE;
DROP TABLE IF EXISTS questions CASCADE;
DROP TABLE IF EXISTS quizzes CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ── Drop custom types ────────────────────────────────────────────────────────
DROP TYPE IF EXISTS attempt_result_status CASCADE;
DROP TYPE IF EXISTS attempt_status CASCADE;
DROP TYPE IF EXISTS question_difficulty CASCADE;
DROP TYPE IF EXISTS question_category CASCADE;
DROP TYPE IF EXISTS user_ieee_status CASCADE;
DROP TYPE IF EXISTS user_gender CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

-- ── Users Table ──────────────────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('student', 'admin');
CREATE TYPE user_gender AS ENUM ('Male', 'Female', 'Other', 'Prefer not to say');
CREATE TYPE user_ieee_status AS ENUM ('Member', 'Non-Member');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(15) NOT NULL,
    course VARCHAR(100) NOT NULL,
    semester INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 12),
    department VARCHAR(100),
    gender user_gender,
    ieee_status user_ieee_status DEFAULT 'Non-Member',
    password_hash VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'student',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Quizzes Table ────────────────────────────────────────────────────────────
CREATE TABLE quizzes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes >= 1),
    total_marks INTEGER NOT NULL CHECK (total_marks >= 0),
    marks_per_question INTEGER DEFAULT 1 CHECK (marks_per_question >= 0),
    negative_marks INTEGER DEFAULT 0 CHECK (negative_marks >= 0),
    passing_percentage INTEGER DEFAULT 50 CHECK (passing_percentage BETWEEN 0 AND 100),
    max_attempts INTEGER DEFAULT 1 CHECK (max_attempts >= 1),
    is_active BOOLEAN DEFAULT FALSE,
    randomize_questions BOOLEAN DEFAULT TRUE,
    randomize_options BOOLEAN DEFAULT FALSE,
    show_result_after_submit BOOLEAN DEFAULT TRUE,
    start_at TIMESTAMP WITH TIME ZONE,
    end_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Questions Table ──────────────────────────────────────────────────────────
CREATE TYPE question_category AS ENUM (
    'Quantitative Aptitude',
    'Logical Reasoning',
    'Verbal Ability',
    'Technical / General Awareness'
);
CREATE TYPE question_difficulty AS ENUM ('Easy', 'Medium', 'Hard');

CREATE TABLE questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    options JSONB NOT NULL, -- Array of 4 strings
    correct_option_index INTEGER NOT NULL CHECK (correct_option_index BETWEEN 0 AND 3),
    marks INTEGER DEFAULT 1 CHECK (marks >= 0),
    negative_marks INTEGER DEFAULT 0 CHECK (negative_marks >= 0),
    category question_category NOT NULL,
    difficulty question_difficulty DEFAULT 'Medium',
    explanation TEXT DEFAULT '',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Attempts Table ───────────────────────────────────────────────────────────
CREATE TYPE attempt_status AS ENUM ('in-progress', 'completed', 'timed-out');
CREATE TYPE attempt_result_status AS ENUM ('QUALIFIED', 'NOT QUALIFIED');

CREATE TABLE attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    quiz_id UUID REFERENCES quizzes(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_at TIMESTAMP WITH TIME ZONE,
    status attempt_status DEFAULT 'in-progress',
    score NUMERIC,
    percentage NUMERIC,
    correct INTEGER,
    incorrect INTEGER,
    unattempted INTEGER,
    result_status attempt_result_status,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Attempt Answers Table ────────────────────────────────────────────────────
CREATE TABLE attempt_answers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attempt_id UUID REFERENCES attempts(id) ON DELETE CASCADE,
    question_id UUID REFERENCES questions(id) ON DELETE CASCADE,
    selected_option_index INTEGER,
    UNIQUE(attempt_id, question_id)
);

-- ── Performance Indexes ───────────────────────────────────────────────────────
-- Critical for 400-student load: prevents full table scans on hot paths

CREATE INDEX IF NOT EXISTS idx_attempts_user_id        ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_quiz_id        ON attempts(quiz_id);
CREATE INDEX IF NOT EXISTS idx_attempts_status         ON attempts(status);
CREATE INDEX IF NOT EXISTS idx_attempts_user_quiz      ON attempts(user_id, quiz_id);
CREATE INDEX IF NOT EXISTS idx_attempt_answers_attempt ON attempt_answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_questions_quiz_id       ON questions(quiz_id);
CREATE INDEX IF NOT EXISTS idx_users_email             ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role              ON users(role);

-- ── Race Condition Guard ─────────────────────────────────────────────────────
-- Prevents two simultaneous quiz starts from creating duplicate in-progress attempts
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_attempt_per_user_quiz
  ON attempts(user_id, quiz_id)
  WHERE status = 'in-progress';
