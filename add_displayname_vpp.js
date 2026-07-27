const sql = require('mssql');
sql.connect({
  user: process.env.DB_USER||'sa',
  password: process.env.DB_PASSWORD||'Abc@123456!',
  server: process.env.DB_SERVER||'192.168.11.205',
  database: 'QuanLyVanPhongPham',
  options: {encrypt: false, trustServerCertificate: true}
}).then(pool => {
  return pool.request().query('ALTER TABLE dbo.TAIKHOAN ADD DisplayName NVARCHAR(255)');
}).then(() => {
  console.log("Added DisplayName column to TAIKHOAN in QuanLyVanPhongPham");
  process.exit(0);
}).catch(err => {
  console.log("Error or already exists:", err.message);
  process.exit(0); // If already exists
});
