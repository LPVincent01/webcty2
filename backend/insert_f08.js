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
    // Check if F08 exists
    const check = await pool.request().query("SELECT * FROM dbo.LOAI_VATTU WHERE MaCap1 = 'F08'");
    if(check.recordset.length === 0) {
      await pool.request().query("INSERT INTO dbo.LOAI_VATTU (MaCap1, TenCap1) VALUES ('F08', N'Linh kiện chuyền may 车间零件')");
      console.log('Inserted F08');
    } else {
      console.log('F08 already exists');
    }
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
})();
