require('dotenv').config({path: './backend/.env'});
const sql = require('mssql');
async function run() {
  await sql.connect({
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME_VPP,
    options: { encrypt: false, trustServerCertificate: true }
  });
  const res = await sql.query("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='VANPHONGPHAM'");
  console.table(res.recordset);
  process.exit(0);
}
run();
