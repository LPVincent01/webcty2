const sql = require('mssql');
const config = {
  user: 'sa',
  password: 'Abc@123456!',
  server: '192.168.11.205',
  port: 1433,
  database: 'QuanLyThietBi',
  options: { encrypt: false, trustServerCertificate: true }
};
(async () => {
  try {
    await sql.connect(config);
    const res = await sql.query("DELETE FROM dbo.Purchase WHERE MaTaiSan='MGTE-210'");
    console.log('Deleted rows:', res.rowsAffected);
  } catch (err) {
    console.error(err);
  }
  process.exit();
})();
