const sql = require('mssql');

const config = {
  user: 'sa',
  password: 'Abc@123456!',
  server: 'localhost',
  database: 'QuanLyVanPhongPham',
  options: { encrypt: false, trustServerCertificate: true }
};

async function check() {
  try {
    await sql.connect(config);
    const res = await sql.query("SELECT TOP 1 * FROM dbo.VANPHONGPHAM");
    console.log("Columns:", Object.keys(res.recordset[0] || {}).join(', '));
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
check();
