const fs = require('fs');
const path = require('path');

const vppJsPath = path.join(__dirname, '..', 'frontend', 'vpp', 'vpp.js');
let vppJs = fs.readFileSync(vppJsPath, 'utf8');

// Thay đổi "block" thành "flex" cho các modal
vppJs = vppJs.replace(/addModal\.style\.display\s*=\s*"block";/g, 'addModal.style.display = "flex";');
vppJs = vppJs.replace(/document\.getElementById\("addVppModal"\)\.style\.display\s*=\s*"block";/g, 'document.getElementById("addVppModal").style.display = "flex";');
vppJs = vppJs.replace(/document\.getElementById\("editImportModal"\)\.style\.display\s*=\s*"block";/g, 'document.getElementById("editImportModal").style.display = "flex";');
vppJs = vppJs.replace(/document\.getElementById\("editExportModal"\)\.style\.display\s*=\s*"block";/g, 'document.getElementById("editExportModal").style.display = "flex";');

fs.writeFileSync(vppJsPath, vppJs);
console.log("Updated modal display to flex in vpp.js");
