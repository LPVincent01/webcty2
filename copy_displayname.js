const sql = require('mssql');
sql.connect({
  user: process.env.DB_USER||'sa',
  password: process.env.DB_PASSWORD||'Abc@123456!',
  server: process.env.DB_SERVER||'192.168.11.205',
  options: {encrypt: false, trustServerCertificate: true}
}).then(pool => {
  return pool.request().query(`
    UPDATE vp
    SET vp.DisplayName = tb.DisplayName
    FROM QuanLyVanPhongPham.dbo.TAIKHOAN vp
    INNER JOIN QuanLyThietBi.dbo.TAIKHOAN tb ON vp.Username = tb.Username
    WHERE tb.DisplayName IS NOT NULL
  `);
}).then(() => {
  console.log("Updated DisplayName data from QuanLyThietBi to QuanLyVanPhongPham");
  process.exit(0);
}).catch(err => {
  console.log("Error updating data:", err.message);
  process.exit(0);
});
