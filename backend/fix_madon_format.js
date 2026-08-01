const fs = require('fs');
const path = require('path');

const vppJsPath = path.join(__dirname, '..', 'frontend', 'vpp', 'vpp.js');
let vppJs = fs.readFileSync(vppJsPath, 'utf8');

// Thêm hàm formatMaDon nếu chưa có
if (!vppJs.includes('function formatMaDon')) {
  const functionStr = `
function formatMaDon(maDon, maCap3) {
  if (!maDon || !maCap3) return maDon || '';
  let parts = maDon.split('-');
  if (parts.length > 1) {
    let suffix = maCap3;
    if (suffix.toUpperCase().startsWith('F')) {
       suffix = suffix.substring(1);
    }
    return parts[0] + '-' + suffix;
  }
  return maDon;
}
`;
  vppJs += functionStr;
}

// Replace <td>${item.MaDon || ''}</td> with <td>${formatMaDon(item.MaDon, item.MaCap3)}</td>
vppJs = vppJs.replace(/<td>\$\{item\.MaDon \|\| ''\}<\/td>/g, '<td>${formatMaDon(item.MaDon, item.MaCap3)}</td>');

fs.writeFileSync(vppJsPath, vppJs);
console.log("Updated MaDon format in vpp.js");
