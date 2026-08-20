const fs = require('fs');
const glob = require('glob');
const API_BASE = 'https://quiz-app-2l4p.onrender.com';

const files = glob.sync('frontend/**/*.{html,js}');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  let newContent = content.replace(/https:\/\/quiz-app-2l4p\.onrender\.com/g, '');
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent);
    console.log('Updated ' + file);
  }
});
