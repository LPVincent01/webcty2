const sql = require('mssql');
async function run() {
  await sql.connect({user: 'sa', password: 'Abc@123456!', server: 'localhost', database: 'QuanLyVanPhongPham', options: { encrypt: false, trustServerCertificate: true }});
  const res1 = await sql.query(`SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'TONKHO_VPP'`);
  console.log('TONKHO_VPP columns:', res1.recordset);
  const res2 = await sql.query(`SELECT TOP 5 * FROM TONKHO_VPP`);
  console.log('TONKHO_VPP data:', res2.recordset);
  process.exit(0);
}
run();
