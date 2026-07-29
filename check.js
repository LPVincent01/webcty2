const fs = require('fs');
const html = fs.readFileSync('frontend/vpp/index.html', 'utf8');
const js = fs.readFileSync('frontend/vpp/vpp.js', 'utf8');
const matches = js.matchAll(/document\.getElementById\(['"]([^'"]+)['"]\)/g);
const ids = Array.from(matches).map(m => m[1]);
const uniqueIds = [...new Set(ids)];
const missing = uniqueIds.filter(id => !html.includes('id="' + id + '"'));
console.log(missing);
