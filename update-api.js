const fs = require('fs');
const glob = require('glob');
const API_BASE = 'https://ieee-quiz-c3u1.onrender.com';

const files = glob.sync('frontend/**/*.{html,js}');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  // Replace '/api/' or "/api/"
  let newContent = content.replace(/['\"]\/api\//g, "'" + API_BASE + '/api/');
  // Replace `/api/` (template literals)
  newContent = newContent.replace(/\`\/api\//g, '`' + API_BASE + '/api/');
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent);
    console.log('Updated ' + file);
  }
});
