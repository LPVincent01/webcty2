const fs = require('fs');
const path = require('path');

const vppJsPath = path.join(__dirname, '..', 'frontend', 'vpp', 'vpp.js');
let vppJs = fs.readFileSync(vppJsPath, 'utf8');

// Replace duplicate <td>${index + 1}</td>
vppJs = vppJs.replace(/<td>\$\{index \+ 1\}<\/td>\s*<td>\$\{index \+ 1\}<\/td>/g, '<td>${index + 1}</td>');

fs.writeFileSync(vppJsPath, vppJs);
console.log("Fixed duplicate STT in vpp.js");
