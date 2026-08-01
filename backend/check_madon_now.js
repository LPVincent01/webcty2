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
    const r1 = await sql.query("SELECT Id, MaDon, NgayNhap FROM dbo.NHAP_VPP ORDER BY NgayNhap ASC");
    console.table(r1.recordset);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
