const sql = require('mssql');
async function run() {
  await sql.connect({user: 'sa', password: 'Abc@123456!', server: 'localhost', database: 'QuanLyVanPhongPham', options: { encrypt: false, trustServerCertificate: true }});
  const res1 = await sql.query(`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'NHAP_VPP'`);
  const res2 = await sql.query(`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'XUAT_VPP'`);
  console.log('NHAP_VPP:', res1.recordset);
  console.log('XUAT_VPP:', res2.recordset);
  process.exit(0);
}
run();
