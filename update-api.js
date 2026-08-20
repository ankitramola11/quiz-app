const fs = require('fs');
const glob = require('glob');
const API_BASE = 'https://quiz-app-2l4p.onrender.com';

const files = glob.sync('frontend/**/*.{html,js}');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content.replace(/https:\/\/ieee-quiz-c3u1\.onrender\.com/g, API_BASE);
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent);
    console.log('Updated ' + file);
  }
});
