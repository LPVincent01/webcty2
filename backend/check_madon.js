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
    const r1 = await sql.query("SELECT Id, MaDon, NgayNhap FROM dbo.NHAP_VPP WHERE MaDon IS NULL OR MaDon = ''");
    console.log('NHAP_VPP missing MaDon:', r1.recordset.length);
    const r2 = await sql.query("SELECT Id, MaDon, NgayXuat FROM dbo.XUAT_VPP WHERE MaDon IS NULL OR MaDon = ''");
    console.log('XUAT_VPP missing MaDon:', r2.recordset.length);
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
