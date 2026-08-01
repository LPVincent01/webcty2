const sql = require('mssql');

async function run() {
  try {
    await sql.connect({user: 'sa', password: 'Abc@123456!', server: 'localhost', database: 'QuanLyVanPhongPham', options: { encrypt: false, trustServerCertificate: true }});
    
    // Thêm vào NHAP_VPP
    try {
      await sql.query(`
        ALTER TABLE dbo.NHAP_VPP
        ADD MaDon NVARCHAR(50) NULL,
            PheDuyet BIT DEFAULT 0;
      `);
      console.log("Đã thêm MaDon, PheDuyet vào NHAP_VPP.");
    } catch(e) {
      console.log("Cột có thể đã tồn tại trong NHAP_VPP:", e.message);
    }
    
    // Thêm vào XUAT_VPP
    try {
      await sql.query(`
        ALTER TABLE dbo.XUAT_VPP
        ADD MaDon NVARCHAR(50) NULL,
            PheDuyet BIT DEFAULT 0;
      `);
      console.log("Đã thêm MaDon, PheDuyet vào XUAT_VPP.");
    } catch(e) {
      console.log("Cột có thể đã tồn tại trong XUAT_VPP:", e.message);
    }
    
    // Update existing records to PheDuyet = 1 so old data isn't locked as pending (or leave as 0? Since old data was already processed, maybe set to 1? The user said "Nhập kho thì vẫn cộng vào Tồn kho, nút xác nhận chỉ là ngăn sửa". So if it's 0 it can be edited, if 1 it can't. Let's set existing to 1 so they can't be freely edited without admin).
    await sql.query(`UPDATE dbo.NHAP_VPP SET PheDuyet = 1 WHERE PheDuyet IS NULL`);
    await sql.query(`UPDATE dbo.XUAT_VPP SET PheDuyet = 1 WHERE PheDuyet IS NULL`);
    
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
