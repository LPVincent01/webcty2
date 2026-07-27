const sql = require("mssql");
const bcrypt = require("bcryptjs");

const config = {
  user: "sa",
  password: "Abc@123456!",
  server: "localhost",
  database: "QuanLyThietBi",
  port: 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function main() {
  try {
    const pool = await sql.connect(config);
    const hash = await bcrypt.hash("qwerty6.", 10);

    const check = await pool.request().query(`SELECT * FROM dbo.TAIKHOAN WHERE Username = N'叶鑫'`);
    if (check.recordset.length > 0) {
      console.log("Account already exists");
      process.exit(0);
    }

    const result = await pool.request().query(`
      INSERT INTO dbo.TAIKHOAN (Username, PasswordHash, Role, DisplayName, CreatedAt, MatKhauGoc, CanAdd, CanEdit, CanDelete, CanConfirm)
      VALUES (N'叶鑫', '${hash}', 'manager', N'叶鑫', GETDATE(), N'qwerty6.', 1, 1, 1, 1)
    `);

    console.log("Account created successfully", result);
  } catch (e) {
    console.error(e);
  } finally {
    process.exit(0);
  }
}
main();
