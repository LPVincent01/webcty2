const fs = require('fs');
const path = require('path');
const vppJsPath = path.join(__dirname, '..', 'frontend', 'vpp', 'vpp.js');
let vppJs = fs.readFileSync(vppJsPath, 'utf8');

// Undo the wrapper if exists
const badWrapStart = '\\nfunction setupListEvents() {\\n';
const docReadyStart = '\\n// Add to DOMContentLoaded\\ndocument.addEventListener("DOMContentLoaded", () => {\\n  setupListEvents();\\n});\\n';

if (vppJs.includes('function setupListEvents() {')) {
  // We need to carefully remove the wrapper
  // First, remove the bottom docReady part
  vppJs = vppJs.replace(docReadyStart, '');
  // Remove the '}' that was added right before the docReady
  const lastBraceIndex = vppJs.lastIndexOf('}');
  if (lastBraceIndex !== -1 && lastBraceIndex > vppJs.length - 100) {
    vppJs = vppJs.substring(0, lastBraceIndex) + vppJs.substring(lastBraceIndex + 1);
  }
  // Remove the 'function setupListEvents() {'
  vppJs = vppJs.replace('function setupListEvents() {\n', '');
  
  console.log("Removed bad wrap");
}

// Now do a PROPER wrap: only for the document.getElementById(...).addEventListener parts
const importEventRegex = /document\.getElementById\("btnImportListApprove"\)\.addEventListener\("click", async \(\) => {[\s\S]*?}\);/g;
// Actually, just find the whole section of events and wrap them inside DOMContentLoaded
const eventsToWrap = `
  const btnImpApp = document.getElementById("btnImportListApprove");
  if(btnImpApp) btnImpApp.addEventListener("click", async () => { /*...*/ });
`;
// Wait, it's safer to just wrap ALL those document.getElementById(...).addEventListener at the bottom inside DOMContentLoaded without creating a function that swallows variables.
// The variables `importListData` and `exportListData` are declared around line 1370 and 1580.
// Let's just find them and ensure they are at the top level.

// Let's rewrite the bottom event listeners completely, carefully avoiding variables.
vppJs = vppJs.replace(/document\.getElementById\("btnImportListApprove"\)\.addEventListener/g, 'const btnImpAppr = document.getElementById("btnImportListApprove"); if(btnImpAppr) btnImpAppr.addEventListener');
vppJs = vppJs.replace(/document\.getElementById\("btnImportListUnlock"\)\.addEventListener/g, 'const btnImpUnl = document.getElementById("btnImportListUnlock"); if(btnImpUnl) btnImpUnl.addEventListener');
vppJs = vppJs.replace(/document\.getElementById\("btnImportListEdit"\)\.addEventListener/g, 'const btnImpEdit = document.getElementById("btnImportListEdit"); if(btnImpEdit) btnImpEdit.addEventListener');
vppJs = vppJs.replace(/document\.getElementById\("btnImportListDelete"\)\.addEventListener/g, 'const btnImpDel = document.getElementById("btnImportListDelete"); if(btnImpDel) btnImpDel.addEventListener');
vppJs = vppJs.replace(/document\.getElementById\("btnExportListApprove"\)\.addEventListener/g, 'const btnExpAppr = document.getElementById("btnExportListApprove"); if(btnExpAppr) btnExpAppr.addEventListener');
vppJs = vppJs.replace(/document\.getElementById\("btnExportListUnlock"\)\.addEventListener/g, 'const btnExpUnl = document.getElementById("btnExportListUnlock"); if(btnExpUnl) btnExpUnl.addEventListener');
vppJs = vppJs.replace(/document\.getElementById\("btnExportListEdit"\)\.addEventListener/g, 'const btnExpEdit = document.getElementById("btnExportListEdit"); if(btnExpEdit) btnExpEdit.addEventListener');
vppJs = vppJs.replace(/document\.getElementById\("btnExportListDelete"\)\.addEventListener/g, 'const btnExpDel = document.getElementById("btnExportListDelete"); if(btnExpDel) btnExpDel.addEventListener');

// If we replace them like this, they will run immediately. If the DOM is not ready, they skip (because of `if(btnX) ...`).
// BUT we WANT them to attach! Since `vpp.js` is at the end of `<body>`, the DOM IS ready.
// Why did it crash earlier? Maybe because the buttons were actually NOT in the HTML at the time because the script had failed to inject them?
// YES! Earlier, the HTML update script failed, so `btnImportListApprove` did NOT exist.
// Now that the HTML is updated, `document.getElementById` will NOT return null.
// So we don't even need `DOMContentLoaded`. Just adding `if(el) el.addEventListener` prevents errors.

fs.writeFileSync(vppJsPath, vppJs);
console.log("Fixed vpp.js");
