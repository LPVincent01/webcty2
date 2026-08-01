const fs = require('fs');
const path = require('path');

const indexHtmlPath = path.join(__dirname, '..', 'frontend', 'vpp', 'index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

indexHtml = indexHtml.replace(
  /<th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllImport" \/><\/th>\s*<th>Mã Đơn<\/th>/,
  '<th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllImport" /></th>\n                  <th style="width: 50px;">STT</th>\n                  <th>Mã Đơn</th>'
);

indexHtml = indexHtml.replace(
  /<th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllExport" \/><\/th>\s*<th>Mã Đơn<\/th>/,
  '<th style="width: 40px; text-align: center;"><input type="checkbox" id="selectAllExport" /></th>\n                  <th style="width: 50px;">STT</th>\n                  <th>Mã Đơn</th>'
);

fs.writeFileSync(indexHtmlPath, indexHtml);
console.log("Updated index.html STT headers");
