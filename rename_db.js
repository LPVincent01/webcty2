const sql = require('mssql');

const dbConfig = {
  user: 'sa',
  password: 'Abc@123456!',
  server: '192.168.11.205',
  database: 'QuanLyThietBi',
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  port: 1433
};

async function renameCols() {
  try {
    await sql.connect(dbConfig);
    const result = await sql.query(`
      SELECT TABLE_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE COLUMN_NAME IN ('MaTaiSan', 'TenTaiSan', 'LoaiTaiSan')
    `);
    
    const columns = result.recordset;
    for (let col of columns) {
      let newColName = '';
      if (col.COLUMN_NAME === 'MaTaiSan') newColName = 'MaTaiSan';
      if (col.COLUMN_NAME === 'TenTaiSan') newColName = 'TenTaiSan';
      if (col.COLUMN_NAME === 'LoaiTaiSan') newColName = 'LoaiTaiSan';
      
      const fullOldName = `${col.TABLE_NAME}.${col.COLUMN_NAME}`;
      console.log(`Renaming ${fullOldName} to ${newColName}...`);
      
      try {
        await sql.query(`EXEC sp_rename '${fullOldName}', '${newColName}', 'COLUMN'`);
        console.log(`Success: ${fullOldName} -> ${newColName}`);
      } catch (e) {
        console.error(`Error renaming ${fullOldName}:`, e.message);
      }
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
renameCols();
