const sql = require('mssql');
async function run() {
  try {
    const pool = await sql.connect({user: 'sa', password: 'Abc@123456!', server: '192.168.11.205', database: 'QuanLyVanPhongPham', options: {encrypt: false, trustServerCertificate: true}});
    
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'VANPHONGPHAM' AND COLUMN_NAME = 'ThuongHieu')
      BEGIN
          ALTER TABLE dbo.VANPHONGPHAM ADD ThuongHieu NVARCHAR(255) NULL;
      END

      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'VANPHONGPHAM' AND COLUMN_NAME = 'NhaCungCap')
      BEGIN
          ALTER TABLE dbo.VANPHONGPHAM ADD NhaCungCap NVARCHAR(255) NULL;
      END
    `);
    console.log("Success");
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
run();
