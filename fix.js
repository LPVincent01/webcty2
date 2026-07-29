const sql = require('mssql');
const fs = require('fs');

async function fix() {
  try {
    const code = fs.readFileSync('c:/PC/Laptrinhweb/webcty2/backend/server.js', 'utf8');
    const match = code.match(/const configVPP = ({[\s\S]*?});/);
    let configStr = match[1];
    const config = eval('(' + configStr + ')');
    
    await sql.connect(config);
    console.log("Connected to DB");
    
    await sql.query(`
      UPDATE t
      SET t.DonGiaTon = 
        (SELECT SUM(n.ThanhTien) / SUM(n.SoLuong)
         FROM dbo.NHAP_VPP n
         WHERE n.VppId = t.VppId)
      FROM dbo.TONKHO_VPP t
    `);
    console.log("Fixed DonGiaTon");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
fix();
