const sql = require('mssql');

const config = {
  user: process.env.DB_USER || "sa",
  password: process.env.DB_PASSWORD || "Abc@123456!",
  server: process.env.DB_SERVER || "192.168.11.205",
  database: process.env.DB_NAME || "QuanLyThietBi",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function setupDB() {
  try {
    let pool = await sql.connect(config);
    console.log("Connected to DB");

    // Check and create VANPHONGPHAM
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='VANPHONGPHAM' and xtype='U')
      CREATE TABLE VANPHONGPHAM (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        MaVPP NVARCHAR(50),
        TenVPP NVARCHAR(255) NOT NULL,
        DonViTinh NVARCHAR(50),
        SoLuongTon FLOAT DEFAULT 0,
        GhiChu NVARCHAR(MAX)
      )
    `);
    console.log("Table VANPHONGPHAM created/exists.");

    // Check and create NHAP_VPP
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NHAP_VPP' and xtype='U')
      CREATE TABLE NHAP_VPP (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        VppId INT FOREIGN KEY REFERENCES VANPHONGPHAM(Id),
        SoLuong FLOAT NOT NULL,
        DonGia FLOAT NOT NULL,
        VAT FLOAT NOT NULL,
        ThanhTien FLOAT NOT NULL,
        NgayNhap DATETIME DEFAULT GETDATE(),
        NguoiNhap NVARCHAR(100),
        GhiChu NVARCHAR(MAX)
      )
    `);
    console.log("Table NHAP_VPP created/exists.");

    // Check and create XUAT_VPP
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='XUAT_VPP' and xtype='U')
      CREATE TABLE XUAT_VPP (
        Id INT IDENTITY(1,1) PRIMARY KEY,
        VppId INT FOREIGN KEY REFERENCES VANPHONGPHAM(Id),
        SoLuong FLOAT NOT NULL,
        NguoiNhan NVARCHAR(255),
        NgayXuat DATETIME DEFAULT GETDATE(),
        GhiChu NVARCHAR(MAX)
      )
    `);
    console.log("Table XUAT_VPP created/exists.");
    
    process.exit(0);
  } catch (err) {
    console.error("SQL Error: ", err);
    process.exit(1);
  }
}

setupDB();
