const sql = require('mssql');
async function run() {
  await sql.connect({
    user: 'sa',
    password: 'Abc@123456!',
    server: 'localhost',
    database: 'QuanLyVanPhongPham',
    options: { encrypt: false, trustServerCertificate: true }
  });
  
  try {
    await sql.query(`
      CREATE OR ALTER VIEW dbo.V_VATTU AS
      SELECT Id, MaCap3, TenVPP, ThuongHieu, NhaCungCap, GhiChu, SanPhamId, DonViTinh, HinhAnh, 'VPP' AS Loai FROM dbo.VANPHONGPHAM
      UNION ALL
      SELECT Id, MaCap3, TenVPP, ThuongHieu, NhaCungCap, GhiChu, SanPhamId, DonViTinh, HinhAnh, 'CM' AS Loai FROM dbo.DANHMUC_CHUYENMAY
    `);
    console.log("Successfully created VIEW V_VATTU");
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
run();
