const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const indexHtmlPath = path.join(__dirname, '..', 'frontend', 'vpp', 'index.html');
let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

// Thêm cột NGUỒN MUA vào table VPP và CHUYENMAY nếu chưa có
indexHtml = indexHtml.replace(
  /<th style="width: 150px;">NHÀ CUNG CẤP<\/th>/g,
  '<th style="width: 150px;">NHÀ CUNG CẤP</th>\n                  <th style="width: 100px;">NGUỒN MUA</th>'
);

// Fix colspan in empty rows if they exist
indexHtml = indexHtml.replace(/colspan="9"/g, 'colspan="10"'); // If any empty message has colspan

fs.writeFileSync(indexHtmlPath, indexHtml);
console.log("Updated index.html headers");

// Also update backend logic for NEW MaDon generation to use global count instead of daily reset if the user wants continuous
// Wait, the user's example: 27th is 001, 28th is 002. This means global sequence!
const vppRoutesPath = path.join(__dirname, '..', 'backend', 'routes', 'vppRoutes.js');
let vppRoutes = fs.readFileSync(vppRoutesPath, 'utf8');
vppRoutes = vppRoutes.replace(
  `query(\`SELECT COUNT(DISTINCT MaDon) AS Cnt FROM dbo.NHAP_VPP WHERE CAST(NgayNhap AS DATE) = @Today\`);`,
  `query(\`SELECT COUNT(DISTINCT MaDon) AS Cnt FROM dbo.NHAP_VPP\`);`
);
vppRoutes = vppRoutes.replace(
  `query(\`SELECT COUNT(DISTINCT MaDon) AS Cnt FROM dbo.XUAT_VPP WHERE CAST(NgayXuat AS DATE) = @Today\`);`,
  `query(\`SELECT COUNT(DISTINCT MaDon) AS Cnt FROM dbo.XUAT_VPP\`);`
);
fs.writeFileSync(vppRoutesPath, vppRoutes);
console.log("Updated vppRoutes sequence logic");

// Now update the old records correctly
const config = {
  user: 'sa',
  password: 'Abc@123456!',
  server: 'localhost',
  database: 'QuanLyVanPhongPham',
  options: { encrypt: false, trustServerCertificate: true }
};

async function run() {
  try {
    await sql.connect(config);
    // Cập nhật lại MaDon Nhập Kho theo đúng logic FVN[STT]A-YYYYMMDD (sắp xếp tăng dần theo NgayNhap)
    await sql.query(`
      WITH Ordered AS (
        SELECT Id, NgayNhap,
               DENSE_RANK() OVER(ORDER BY NgayNhap ASC) as rn
        FROM dbo.NHAP_VPP
      )
      UPDATE n
      SET n.MaDon = 'FVN' + RIGHT('00' + CAST(o.rn AS VARCHAR(10)), 3) + 'A-' + FORMAT(n.NgayNhap, 'yyyyMMdd')
      FROM dbo.NHAP_VPP n
      JOIN Ordered o ON n.Id = o.Id;
    `);
    
    // Cập nhật lại MaDon Xuất Kho theo đúng logic FVN[STT]B-YYYYMMDD (sắp xếp tăng dần theo NgayXuat)
    await sql.query(`
      WITH Ordered AS (
        SELECT Id, NgayXuat,
               DENSE_RANK() OVER(ORDER BY NgayXuat ASC) as rn
        FROM dbo.XUAT_VPP
      )
      UPDATE n
      SET n.MaDon = 'FVN' + RIGHT('00' + CAST(o.rn AS VARCHAR(10)), 3) + 'B-' + FORMAT(n.NgayXuat, 'yyyyMMdd')
      FROM dbo.XUAT_VPP n
      JOIN Ordered o ON n.Id = o.Id;
    `);
    
    // Update NguonMua = 'VN' inside GhiChu to be clean if it is there
    await sql.query(`UPDATE dbo.VANPHONGPHAM SET GhiChu = REPLACE(GhiChu, 'VN', '') WHERE GhiChu = 'VN'`);
    
    console.log('Fixed DB MaDon formats!');
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
