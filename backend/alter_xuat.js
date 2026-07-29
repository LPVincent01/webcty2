const sql = require('mssql');
async function run() {
  try {
    await sql.connect({user: 'sa', password: 'Abc@123456!', server: 'localhost', database: 'QuanLyVanPhongPham', options: { encrypt: false, trustServerCertificate: true }});
    await sql.query(`
      ALTER TABLE dbo.XUAT_VPP
      ADD MSNV NVARCHAR(50) NULL,
          BoPhan NVARCHAR(100) NULL;
    `);
    console.log("Thêm cột thành công");
  } catch (err) {
    if(err.message.includes("already has a column")) {
        console.log("Cột đã tồn tại");
    } else {
        console.error(err);
    }
  }
  process.exit(0);
}
run();
