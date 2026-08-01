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
    await sql.query(`
      ALTER TABLE dbo.VANPHONGPHAM
      ADD NguonMua NVARCHAR(10) NULL;
    `);
    
    // Đặt mặc định nguồn mua cho các dữ liệu cũ là VN để khỏi lỗi
    await sql.query(`
      UPDATE dbo.VANPHONGPHAM
      SET NguonMua = 'VN'
      WHERE NguonMua IS NULL;
    `);
    
    // Drop view cũ (nếu có) và tạo lại view V_VATTU
    try {
      await sql.query(`
        ALTER VIEW dbo.V_VATTU AS
        SELECT 
          Id, MaCap3, TenVPP, DonViTinh, 'VPP' AS Loai, NguonMua
        FROM dbo.VANPHONGPHAM
        UNION ALL
        SELECT
          Id, MaCap3, TenCm AS TenVPP, DonViTinh, 'CM' AS Loai, 'VN' AS NguonMua
        FROM dbo.CHUYENMAY
      `);
      console.log("Cập nhật view V_VATTU thành công.");
    } catch (e) {
      console.log("Lỗi cập nhật View V_VATTU:", e.message);
    }
    
    console.log("Thêm cột NguonMua thành công.");
  } catch(e) {
    console.log("Cột có thể đã tồn tại:", e.message);
  } finally {
    process.exit();
  }
}
run();
