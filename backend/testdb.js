const sql = require('mssql');
const config = { 
  user: 'sa', 
  password: 'Abc@123456!', 
  server: 'localhost', 
  database: 'QuanLyVanPhongPham', 
  options: { encrypt: false, trustServerCertificate: true } 
};
(async () => {
  try {
    const pool = await sql.connect(config);
    
    // 1. Add to VANPHONGPHAM
    try {
      await pool.request().query('ALTER TABLE dbo.VANPHONGPHAM ADD DinhMuc INT DEFAULT 0');
      console.log('Added DinhMuc to VANPHONGPHAM');
    } catch(e) { console.log('VANPHONGPHAM:', e.message); }
    
    // 2. Add to DANHMUC_CHUYENMAY
    try {
      await pool.request().query('ALTER TABLE dbo.DANHMUC_CHUYENMAY ADD DinhMuc INT DEFAULT 0');
      console.log('Added DinhMuc to DANHMUC_CHUYENMAY');
    } catch(e) { console.log('DANHMUC_CHUYENMAY:', e.message); }

    // 3. Update V_VATTU
    try {
      await pool.request().query(`
        ALTER VIEW dbo.V_VATTU AS
        SELECT Id, MaCap3, TenVPP, ThuongHieu, NhaCungCap, GhiChu, SanPhamId, DonViTinh, HinhAnh, 'VPP' AS Loai, ISNULL(NguonMua, 'VN') AS NguonMua, ISNULL(DinhMuc, 0) AS DinhMuc FROM dbo.VANPHONGPHAM
        UNION ALL
        SELECT Id, MaCap3, TenVPP, ThuongHieu, NhaCungCap, GhiChu, SanPhamId, DonViTinh, HinhAnh, 'CM' AS Loai, ISNULL(NguonMua, 'VN') AS NguonMua, ISNULL(DinhMuc, 0) AS DinhMuc FROM dbo.DANHMUC_CHUYENMAY
      `);
      console.log('Updated V_VATTU successfully');
    } catch(e) { console.log('V_VATTU Error:', e.message); }
    
    process.exit(0);
  } catch(e) { console.error(e); process.exit(1); }
})();
