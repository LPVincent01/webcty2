const fs = require('fs');
const path = require('path');

const dir = 'c:\\Laptrinhweb\\webcty2';
const ignoreDirs = ['node_modules', '.git', 'scratch'];
const extMap = ['.js', '.html', '.css'];

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;
  
  // Replace variables and column names
  content = content.replace(/MaTaiSan/g, 'MaTaiSan');
  content = content.replace(/TenTaiSan/g, 'TenTaiSan');
  content = content.replace(/LoaiTaiSan/g, 'LoaiTaiSan');
  
  content = content.replace(/maTaiSan/g, 'maTaiSan'); // lowercase m for query params
  content = content.replace(/tenTaiSan/g, 'tenTaiSan');
  content = content.replace(/loaiTaiSan/g, 'loaiTaiSan');

  // Replace UI headers
  content = content.replace(/MÃ TÀI SẢN/g, 'MÃ TÀI SẢN');
  content = content.replace(/LOẠI TÀI SẢN/g, 'LOẠI TÀI SẢN');
  content = content.replace(/Mã tài sản/g, 'Mã tài sản');
  content = content.replace(/Tên tài sản/g, 'Tên tài sản');
  content = content.replace(/Loại tài sản/g, 'Loại tài sản');

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Updated:', filePath);
  }
}

function traverse(currentDir) {
  const files = fs.readdirSync(currentDir);
  for (let file of files) {
    if (ignoreDirs.includes(file)) continue;
    const fullPath = path.join(currentDir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      traverse(fullPath);
    } else if (stat.isFile()) {
      const ext = path.extname(fullPath).toLowerCase();
      if (extMap.includes(ext)) {
        replaceInFile(fullPath);
      }
    }
  }
}

traverse(dir);
console.log('Code replacement complete.');
