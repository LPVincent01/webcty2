const sql = require('mssql');
const config = { 
  user: 'sa', 
  password: 'Abc@123456!', 
  server: 'localhost', 
  database: 'QuanLyVanPhongPham', 
  options: { encrypt: false, trustServerCertificate: true } 
};
(async () => {
  try {
    const pool = await sql.connect(config);
    // Delete from child tables first to avoid foreign key constraints (if any exist)
    await pool.request().query("DELETE FROM dbo.NHAP_VPP");
    console.log("Deleted NHAP_VPP");
    await pool.request().query("DELETE FROM dbo.XUAT_VPP");
    console.log("Deleted XUAT_VPP");
    await pool.request().query("DELETE FROM dbo.TONKHO_VPP");
    console.log("Deleted TONKHO_VPP");
    await pool.request().query("DELETE FROM dbo.VANPHONGPHAM");
    console.log("Deleted VANPHONGPHAM");

    // Also DBCC CHECKIDENT to reset identity column to 0 if it is an identity
    try { await pool.request().query("DBCC CHECKIDENT ('dbo.NHAP_VPP', RESEED, 0)"); } catch(e){}
    try { await pool.request().query("DBCC CHECKIDENT ('dbo.XUAT_VPP', RESEED, 0)"); } catch(e){}
    try { await pool.request().query("DBCC CHECKIDENT ('dbo.TONKHO_VPP', RESEED, 0)"); } catch(e){}
    try { await pool.request().query("DBCC CHECKIDENT ('dbo.VANPHONGPHAM', RESEED, 0)"); } catch(e){}
    
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
})();
