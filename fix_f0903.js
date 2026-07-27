const sql = require('mssql');
async function run() {
  const pool = await sql.connect({
    user: 'sa', password: 'Abc@123456!', server: '192.168.11.205', database: 'QuanLyVanPhongPham',
    options: {encrypt: false, trustServerCertificate: true}
  });
  await pool.request().query(`UPDATE SANPHAM SET TenCap2 = N'Viết笔' WHERE MaCap2 = 'F0903'`);
  await pool.request().query(`UPDATE VANPHONGPHAM SET SanPhamId = (SELECT Id FROM SANPHAM WHERE MaCap2 = 'F0902') WHERE MaCap3 = 'F0902010'`);
  console.log('Fixed DB data anomaly.');
  process.exit(0);
}
run();
