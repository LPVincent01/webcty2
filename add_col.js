const sql = require('mssql');
sql.connect({
  user: process.env.DB_USER||'sa',
  password: process.env.DB_PASSWORD||'Abc@123456!',
  server: process.env.DB_SERVER||'192.168.11.205',
  database: process.env.DB_NAME||'QuanLyThietBi',
  options: {encrypt: false, trustServerCertificate: true}
}).then(pool => {
  return pool.request().query('ALTER TABLE dbo.VANPHONGPHAM ADD HinhAnh VARCHAR(MAX)');
}).then(() => {
  console.log("Added HinhAnh column");
  process.exit(0);
}).catch(err => {
  console.log(err.message);
  process.exit(0); // If already exists
});
