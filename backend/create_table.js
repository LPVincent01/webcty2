const sql = require('mssql');
async function run() {
  await sql.connect({
    user: 'sa',
    password: 'Abc@123456!',
    server: 'localhost',
    database: 'QuanLyVanPhongPham',
    options: { encrypt: false, trustServerCertificate: true }
  });
  
  await sql.query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DANHMUC_CHUYENMAY')
    BEGIN
      CREATE TABLE dbo.DANHMUC_CHUYENMAY (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        MaCap3 NVARCHAR(50),
        TenVPP NVARCHAR(255),
        ThuongHieu NVARCHAR(255),
        NhaCungCap NVARCHAR(255),
        GhiChu NVARCHAR(MAX),
        SanPhamId INT,
        DonViTinh NVARCHAR(50),
        HinhAnh NVARCHAR(MAX),
        SoLuongTon FLOAT DEFAULT 0
      );
    END
  `);
  console.log("Created table DANHMUC_CHUYENMAY");
  process.exit(0);
}
run();
