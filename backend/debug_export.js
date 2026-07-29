const sql = require('mssql');
async function run() {
  await sql.connect({user: 'sa', password: 'Abc@123456!', server: 'localhost', database: 'QuanLyVanPhongPham', options: { encrypt: false, trustServerCertificate: true }});
  
  // Try to find the items with 'Kim bấm'
  const res1 = await sql.query(`SELECT * FROM dbo.V_VATTU WHERE TenVPP LIKE N'%Kim bấm%'`);
  console.log('V_VATTU:', res1.recordset);
  
  const res2 = await sql.query(`SELECT * FROM dbo.TONKHO_VPP`);
  console.log('TONKHO_VPP:', res2.recordset);
  
  // Test the exact query
  const res3 = await sql.query(`
    SELECT t.SoLuongTon, v.TenVPP, t.VppId, t.Loai
    FROM dbo.TONKHO_VPP t
    JOIN dbo.V_VATTU v ON t.VppId = v.Id AND t.Loai = v.Loai
  `);
  console.log('JOIN result:', res3.recordset);
  
  process.exit(0);
}
run();
