const sql = require('mssql');
async function run() {
  await sql.connect({user: 'sa', password: 'Abc@123456!', server: 'localhost', database: 'QuanLyVanPhongPham', options: { encrypt: false, trustServerCertificate: true }});
  
  const IdCheck = 119;
  
  const request = new sql.Request();
  request.input('IdCheck', sql.Int, IdCheck);
  const checkStock = await request.query(`
    SELECT t.SoLuongTon, v.TenVPP 
    FROM dbo.TONKHO_VPP t
    JOIN dbo.V_VATTU v ON t.VppId = v.Id AND t.Loai = v.Loai
    WHERE t.VppId = @IdCheck
  `);
  console.log('Result:', checkStock.recordset);
  process.exit(0);
}
run();
