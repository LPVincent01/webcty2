const fs = require('fs');
const path = require('path');

// 1. Cập nhật index.html
const indexHtmlPath = path.join(__dirname, '..', 'frontend', 'vpp', 'index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

// Tìm thead của Danh sách Nhập
// <th style="width: 40px; text-align: center;"><input type="checkbox" id="cbAllImport" /></th>
// <th>MÃ ĐƠN</th>
if(!indexHtml.includes('<th>STT</th>\n                  <th>MÃ ĐƠN</th>')) {
  indexHtml = indexHtml.replace(
    /<th style="width: 40px; text-align: center;"><input type="checkbox" id="cbAllImport" \/><\/th>\s*<th>MÃ ĐƠN<\/th>/,
    '<th style="width: 40px; text-align: center;"><input type="checkbox" id="cbAllImport" /></th>\n                  <th style="width: 50px;">STT</th>\n                  <th>MÃ ĐƠN</th>'
  );
  indexHtml = indexHtml.replace(
    /<th style="width: 40px; text-align: center;"><input type="checkbox" id="cbAllExport" \/><\/th>\s*<th>MÃ ĐƠN<\/th>/,
    '<th style="width: 40px; text-align: center;"><input type="checkbox" id="cbAllExport" /></th>\n                  <th style="width: 50px;">STT</th>\n                  <th>MÃ ĐƠN</th>'
  );
}
fs.writeFileSync(indexHtmlPath, indexHtml);

// 2. Cập nhật vpp.js
const vppJsPath = path.join(__dirname, '..', 'frontend', 'vpp', 'vpp.js');
let vppJs = fs.readFileSync(vppJsPath, 'utf8');

// Update format date in import
vppJs = vppJs.replace(
  `<td>\${item.NgayNhap ? new Date(item.NgayNhap).toLocaleString('vi-VN') : ''}</td>`,
  `<td>\${formatDateFull(item.NgayNhap)}</td>`
);
// Update format date in export
vppJs = vppJs.replace(
  `<td>\${item.NgayXuat ? new Date(item.NgayXuat).toLocaleString('vi-VN') : ''}</td>`,
  `<td>\${formatDateFull(item.NgayXuat)}</td>`
);

// Update map function for renderImportList to include index
vppJs = vppJs.replace(`tbody.innerHTML = data.map(item => {`, `tbody.innerHTML = data.map((item, index) => {`);
vppJs = vppJs.replace(
  `<td>\${item.MaDon || ''}</td>`,
  `<td>\${index + 1}</td>\n        <td>\${item.MaDon || ''}</td>`
); // Note: this will replace both instances if we use a global regex or just replace the first one.
// Let's be careful. The first one is in renderImportList, the second is in renderExportList.
// We can just use global regex for the `data.map` and the `MaDon` replacement.
// But wait, there are other `MaDon` replacements? No, only in these two tables!
// Let's do it safely:
let parts = vppJs.split('function renderImportList(data) {');
if(parts.length > 1) {
  let subParts = parts[1].split('function renderExportList(data) {');
  let importPart = subParts[0];
  let exportPart = subParts[1];
  
  importPart = importPart.replace(`data.map(item =>`, `data.map((item, index) =>`);
  importPart = importPart.replace(`<td>\${item.MaDon || ''}</td>`, `<td>\${index + 1}</td>\n        <td>\${item.MaDon || ''}</td>`);
  
  exportPart = exportPart.replace(`data.map(item =>`, `data.map((item, index) =>`);
  exportPart = exportPart.replace(`<td>\${item.MaDon || ''}</td>`, `<td>\${index + 1}</td>\n        <td>\${item.MaDon || ''}</td>`);
  
  vppJs = parts[0] + 'function renderImportList(data) {' + importPart + 'function renderExportList(data) {' + exportPart;
}
fs.writeFileSync(vppJsPath, vppJs);

// 3. Cập nhật vppRoutes.js (đổi DESC thành ASC)
const vppRoutesPath = path.join(__dirname, '..', 'backend', 'routes', 'vppRoutes.js');
let vppRoutes = fs.readFileSync(vppRoutesPath, 'utf8');
vppRoutes = vppRoutes.replace(`ORDER BY n.NgayNhap DESC`, `ORDER BY n.NgayNhap ASC`);
vppRoutes = vppRoutes.replace(`ORDER BY n.NgayXuat DESC`, `ORDER BY n.NgayXuat ASC`);
fs.writeFileSync(vppRoutesPath, vppRoutes);

console.log("Updated everything!");
