const sql = require('mssql');

const config = {
  user: 'sa',
  password: 'Abc@123456!',
  server: 'localhost',
  database: 'QuanLyVanPhongPham',
  options: { encrypt: false, trustServerCertificate: true }
};

async function check() {
  try {
    await sql.connect(config);
    const res = await sql.query("EXEC sp_helptext 'dbo.V_VATTU'");
    console.log(res.recordset.map(x=>x.Text).join(''));
  } catch(e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
check();
