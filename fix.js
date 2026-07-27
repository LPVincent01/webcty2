const fs = require('fs');
const file = 'c:/Laptrinhweb/webcty2/migrate_vattu_3cap.js';
let content = fs.readFileSync(file, 'utf8');
content = content.replace(/\\`/g, '`');
content = content.replace(/\\\${/g, '${');
fs.writeFileSync(file, content);
