const sql = require('mssql');
async function run() {
  await sql.connect({
    user: 'sa',
    password: 'Abc@123456!',
    server: 'localhost',
    database: 'QuanLyVanPhongPham',
    options: { encrypt: false, trustServerCertificate: true }
  });
  
  try {
    // 1. Get FK constraint names
    const getFkQuery = `
      SELECT name, OBJECT_NAME(parent_object_id) as tablename
      FROM sys.foreign_keys
      WHERE referenced_object_id = OBJECT_ID('dbo.VANPHONGPHAM')
    `;
    const res = await sql.query(getFkQuery);
    for (const row of res.recordset) {
      console.log(`Dropping FK ${row.name} from ${row.tablename}`);
      await sql.query(`ALTER TABLE dbo.${row.tablename} DROP CONSTRAINT ${row.name}`);
    }

    // 2. Add Loai column to TONKHO_VPP, NHAP_VPP, XUAT_VPP
    const tables = ['TONKHO_VPP', 'NHAP_VPP', 'XUAT_VPP'];
    for (const t of tables) {
      console.log(`Adding Loai to ${t}`);
      await sql.query(`
        IF COL_LENGTH('dbo.${t}', 'Loai') IS NULL
        BEGIN
          ALTER TABLE dbo.${t} ADD Loai VARCHAR(10) DEFAULT 'VPP';
          EXEC('UPDATE dbo.${t} SET Loai = ''VPP'' WHERE Loai IS NULL');
        END
      `);
    }

    console.log("Successfully updated schemas");
  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}
run();
