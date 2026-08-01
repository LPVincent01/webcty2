const sql = require('mssql');
const config = {
  user: 'sa',
  password: 'Abc@123456!',
  server: 'localhost',
  database: 'QuanLyVanPhongPham',
  options: { encrypt: false, trustServerCertificate: true }
};
async function run() {
  try {
    await sql.connect(config);
    // Nhập kho
    await sql.query(`
      WITH Ordered AS (
        SELECT Id, NgayNhap,
               ROW_NUMBER() OVER(ORDER BY NgayNhap ASC) as rn
        FROM dbo.NHAP_VPP
        WHERE MaDon IS NULL OR MaDon = ''
      )
      UPDATE n
      SET n.MaDon = 'FVN' + RIGHT('00' + CAST(o.rn AS VARCHAR(10)), 3) + 'A-OLD'
      FROM dbo.NHAP_VPP n
      JOIN Ordered o ON n.Id = o.Id;
    `);
    
    // Xuất kho
    await sql.query(`
      WITH Ordered AS (
        SELECT Id, NgayXuat,
               ROW_NUMBER() OVER(ORDER BY NgayXuat ASC) as rn
        FROM dbo.XUAT_VPP
        WHERE MaDon IS NULL OR MaDon = ''
      )
      UPDATE n
      SET n.MaDon = 'FVN' + RIGHT('00' + CAST(o.rn AS VARCHAR(10)), 3) + 'B-OLD'
      FROM dbo.XUAT_VPP n
      JOIN Ordered o ON n.Id = o.Id;
    `);
    console.log('Fixed missing MaDon in DB');
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
