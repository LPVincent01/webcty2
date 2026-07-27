const sql = require('mssql');
sql.connect({
  user: process.env.DB_USER||'sa',
  password: process.env.DB_PASSWORD||'Abc@123456!',
  server: process.env.DB_SERVER||'192.168.11.205',
  database: 'QuanLyVanPhongPham',
  options: {encrypt: false, trustServerCertificate: true}
}).then(pool => {
  return pool.request().query(`UPDATE dbo.TAIKHOAN SET DisplayName = N'Lê Thị Minh Thư' WHERE Username = '10825'`);
}).then(() => {
  console.log("Updated DisplayName for 10825");
  process.exit(0);
}).catch(err => {
  console.log("Error updating data:", err.message);
  process.exit(0);
});
