const fs = require('fs');
const path = require('path');

const indexHtmlPath = path.join(__dirname, '..', 'frontend', 'vpp', 'index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

// Thêm cột Nguồn Mua vào bảng VPP (Danh mục)
if(!indexHtml.includes('<th>NGUỒN MUA</th>')) {
  indexHtml = indexHtml.replace(
    `<th>NHÀ CUNG CẤP</th>`,
    `<th>NHÀ CUNG CẤP</th>\n                    <th>NGUỒN MUA</th>`
  );
}

// Thêm Nguồn mua vào Modal thêm VPP
if(!indexHtml.includes('id="vppNguonMua"')) {
  const formGroupNguonMua = `
              <div class="form-group">
                <label>Nguồn Mua</label>
                <select id="vppNguonMua" class="form-control" onchange="if(this.value && this.value !== this.value.toUpperCase()){ alert('Thông tin nhập vào phải là chữ In Hoa'); this.value = this.value.toUpperCase(); }">
                  <option value="VN">VN</option>
                  <option value="CN">CN</option>
                </select>
              </div>
  `;
  indexHtml = indexHtml.replace(
    `<div class="form-group">\n                <label>Ghi Chú Khác</label>`,
    `${formGroupNguonMua}\n              <div class="form-group">\n                <label>Ghi Chú Khác</label>`
  );
}

fs.writeFileSync(indexHtmlPath, indexHtml);


// Update vpp.js
const vppJsPath = path.join(__dirname, '..', 'frontend', 'vpp', 'vpp.js');
let vppJs = fs.readFileSync(vppJsPath, 'utf8');

// 1. Sửa hàm renderVppItems để hiển thị Nguồn Mua
vppJs = vppJs.replace(
  `<td>\${item.NhaCungCap || ''}</td>`,
  `<td>\${item.NhaCungCap || ''}</td>\n      <td>\${item.NguonMua || 'VN'}</td>`
);

// 2. Định dạng lại ngày giờ
const formatDateLogic = `
function formatDateFull(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return dateString;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return \`\${year}-\${month}-\${day} \${h}:\${m}:\${s}\`;
}
`;
if (!vppJs.includes('formatDateFull(')) {
  vppJs = vppJs + '\n' + formatDateLogic;
}

// Update loadImportList date format
vppJs = vppJs.replace(
  `<td>\${new Date(item.NgayNhap).toLocaleString('vi-VN')}</td>`,
  `<td>\${formatDateFull(item.NgayNhap)}</td>`
);
vppJs = vppJs.replace(
  `<td>\${new Date(item.NgayXuat).toLocaleString('vi-VN')}</td>`,
  `<td>\${formatDateFull(item.NgayXuat)}</td>`
);


// 3. Update Thêm mới VPP logic
vppJs = vppJs.replace(
  `NhaCungCap: document.getElementById("vppNhaCungCap").value.trim()`,
  `NhaCungCap: document.getElementById("vppNhaCungCap").value.trim(),\n      NguonMua: document.getElementById("vppNguonMua").value.trim().toUpperCase()`
);

// 4. Bọc các sự kiện Import/Export List trong hàm setupListEvents() và gọi trong DOMContentLoaded
const importActionIndex = vppJs.indexOf('// Hành động Nhập Kho');
if (importActionIndex !== -1 && !vppJs.includes('function setupListEvents() {')) {
  let restOfFile = vppJs.substring(importActionIndex);
  vppJs = vppJs.substring(0, importActionIndex) + '\nfunction setupListEvents() {\n' + restOfFile + '\n}\n\n// Add to DOMContentLoaded\ndocument.addEventListener("DOMContentLoaded", () => {\n  setupListEvents();\n});\n';
}

fs.writeFileSync(vppJsPath, vppJs);
console.log("Updated frontend successfully!");
