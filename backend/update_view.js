const sql = require('mssql');

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
    // Add to DANHMUC_CHUYENMAY just in case
    try {
      await sql.query(`
        ALTER TABLE dbo.DANHMUC_CHUYENMAY
        ADD NguonMua NVARCHAR(10) NULL;
      `);
      await sql.query(`UPDATE dbo.DANHMUC_CHUYENMAY SET NguonMua = 'VN' WHERE NguonMua IS NULL;`);
    } catch(e){}
    
    // Update view V_VATTU
    try {
      await sql.query(`
        ALTER VIEW dbo.V_VATTU AS
        SELECT Id, MaCap3, TenVPP, ThuongHieu, NhaCungCap, GhiChu, SanPhamId, DonViTinh, HinhAnh, 'VPP' AS Loai, ISNULL(NguonMua, 'VN') AS NguonMua FROM dbo.VANPHONGPHAM
        UNION ALL
        SELECT Id, MaCap3, TenVPP, ThuongHieu, NhaCungCap, GhiChu, SanPhamId, DonViTinh, HinhAnh, 'CM' AS Loai, ISNULL(NguonMua, 'VN') AS NguonMua FROM dbo.DANHMUC_CHUYENMAY
      `);
      console.log("Cập nhật view V_VATTU thành công.");
    } catch (e) {
      console.log("Lỗi cập nhật View V_VATTU:", e.message);
    }
    
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
