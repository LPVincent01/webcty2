const sql = require('mssql');
const bcrypt = require('bcryptjs');

const config = {
  user: "sa",
  password: "Abc@123456!",
  server: "192.168.11.205", // Địa chỉ SQL Server của bạn
  database: "QuanLyVanPhongPham", // Tên DB
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function createAccount(username, password, role) {
  try {
    let pool = await sql.connect(config);
    
    // Kiểm tra xem tài khoản đã tồn tại chưa
    const check = await pool.request()
      .input('Username', sql.VarChar, username)
      .query('SELECT * FROM dbo.TAIKHOAN WHERE Username = @Username');
      
    if (check.recordset.length > 0) {
      console.log(`Tài khoản ${username} đã tồn tại!`);
      process.exit(1);
    }
    
    // Mã hóa mật khẩu
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // Lưu vào Database
    await pool.request()
      .input('Username', sql.VarChar, username)
      .input('PasswordHash', sql.VarChar, passwordHash)
      .input('Role', sql.VarChar, role)
      .query('INSERT INTO dbo.TAIKHOAN (Username, PasswordHash, Role) VALUES (@Username, @PasswordHash, @Role)');
      
    console.log(`✅ Tạo tài khoản thành công!`);
    console.log(`- Tên đăng nhập: ${username}`);
    console.log(`- Mật khẩu: ${password}`);
    console.log(`- Quyền hạn: ${role}`);
    
    process.exit(0);
  } catch (err) {
    console.error("❌ Lỗi khi tạo tài khoản:", err);
    process.exit(1);
  }
}

// Nhận tham số từ dòng lệnh (ví dụ: node create_user.js 10825 "1234@Abc." admin)
const args = process.argv.slice(2);
if (args.length < 3) {
  console.log('Cách sử dụng lệnh: node create_user.js <username> <password> <role>');
  console.log('Ví dụ: node create_user.js 10825 "1234@Abc." admin');
  process.exit(1);
}

const [username, password, role] = args;
createAccount(username, password, role);
