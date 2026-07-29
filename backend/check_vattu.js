const sql = require('mssql');
async function run() {
  await sql.connect({user: 'sa', password: 'Abc@123456!', server: 'localhost', database: 'QuanLyVanPhongPham', options: { encrypt: false, trustServerCertificate: true }});
  const res1 = await sql.query(`SELECT * FROM dbo.V_VATTU WHERE TenVPP LIKE N'%Kim bấm%'`);
  console.log('V_VATTU:', res1.recordset);
  process.exit(0);
}
run();
