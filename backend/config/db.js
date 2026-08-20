const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL or SUPABASE_KEY is missing in environment variables. DB connection skipped.');
} else {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('✅ Supabase Client Initialized');
}

module.exports = supabase;
