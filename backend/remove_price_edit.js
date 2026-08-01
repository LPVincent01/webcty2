const fs = require('fs');
const path = require('path');

const indexHtmlPath = path.join(__dirname, '..', 'frontend', 'vpp', 'index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

// Use regex to remove lines 621 to 634
indexHtml = indexHtml.replace(/<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">[\s\S]*?<label style="font-weight: 600; color: #444; margin-bottom: 5px; display: block;">Đơn Giá sau VAT<\/label>[\s\S]*?<\/div>/i, '');
fs.writeFileSync(indexHtmlPath, indexHtml);

const vppJsPath = path.join(__dirname, '..', 'frontend', 'vpp', 'vpp.js');
let vppJs = fs.readFileSync(vppJsPath, 'utf8');

vppJs = vppJs.replace(/const priceInput = document\.getElementById\('editVppPrice'\);\s*const vatInput = document\.getElementById\('editVppVat'\);\s*priceInput\.value = item\.DonGia \|\| 0;\s*vatInput\.value = item\.VAT \|\| 0;/g, '');

vppJs = vppJs.replace(/\/\/ Logic: Only allow editing price\/VAT if it has been imported \(HasImport == true\)[\s\S]*?\}\s*else\s*\{[\s\S]*?\}/, '');

vppJs = vppJs.replace(/DonGia:\s*parseFloat\(document\.getElementById\('editVppPrice'\)\.value\)\s*\|\|\s*0,/, '');
vppJs = vppJs.replace(/VAT:\s*parseFloat\(document\.getElementById\('editVppVat'\)\.value\)\s*\|\|\s*0,/, '');

fs.writeFileSync(vppJsPath, vppJs);
console.log("Updated HTML and JS");
