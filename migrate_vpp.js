const sql = require('mssql');
const bcrypt = require('bcryptjs');

const config = {
  user: process.env.DB_USER || "sa",
  password: process.env.DB_PASSWORD || "Abc@123456!",
  server: process.env.DB_SERVER || "192.168.11.205",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

async function migrate() {
  let pool;
  try {
    pool = await sql.connect(config);
    console.log("Connected to SQL Server.");
    
    // 1. Create Database if not exists
    console.log("Checking if QuanLyVanPhongPham exists...");
    const checkDb = await pool.request().query(`
      IF NOT EXISTS (SELECT name FROM master.sys.databases WHERE name = N'QuanLyVanPhongPham')
      BEGIN
        CREATE DATABASE QuanLyVanPhongPham;
      END
    `);
    console.log("Database QuanLyVanPhongPham is ready.");
    
    // 2. Create tables in QuanLyVanPhongPham
    console.log("Creating tables...");
    await pool.request().query(`
      USE QuanLyVanPhongPham;
      
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='VANPHONGPHAM' and xtype='U')
      BEGIN
        CREATE TABLE VANPHONGPHAM (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          MaVPP NVARCHAR(50),
          TenVPP NVARCHAR(255) NOT NULL,
          DonViTinh NVARCHAR(50),
          SoLuongTon FLOAT DEFAULT 0,
          GhiChu NVARCHAR(MAX),
          HinhAnh VARCHAR(MAX)
        );
      END

      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='NHAP_VPP' and xtype='U')
      BEGIN
        CREATE TABLE NHAP_VPP (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          VppId INT NOT NULL,
          SoLuong FLOAT NOT NULL,
          DonGia FLOAT,
          VAT FLOAT,
          ThanhTien FLOAT,
          NgayNhap DATETIME DEFAULT GETDATE(),
          NguoiNhap NVARCHAR(255),
          GhiChu NVARCHAR(MAX),
          CONSTRAINT FK_NHAP_VPP FOREIGN KEY (VppId) REFERENCES VANPHONGPHAM(Id)
        );
      END

      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='XUAT_VPP' and xtype='U')
      BEGIN
        CREATE TABLE XUAT_VPP (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          VppId INT NOT NULL,
          SoLuong FLOAT NOT NULL,
          NguoiNhan NVARCHAR(255),
          NgayXuat DATETIME DEFAULT GETDATE(),
          GhiChu NVARCHAR(MAX),
          CONSTRAINT FK_XUAT_VPP FOREIGN KEY (VppId) REFERENCES VANPHONGPHAM(Id)
        );
      END
      
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='TAIKHOAN' and xtype='U')
      BEGIN
        CREATE TABLE TAIKHOAN (
          Id INT IDENTITY(1,1) PRIMARY KEY,
          Username NVARCHAR(50) UNIQUE NOT NULL,
          PasswordHash NVARCHAR(255) NOT NULL,
          Role NVARCHAR(50) DEFAULT 'user'
        );
      END
    `);
    
    console.log("Tables created successfully.");

    // 3. Migrate Data
    // Cần SET IDENTITY_INSERT ON để giữ nguyên ID
    console.log("Migrating VANPHONGPHAM...");
    await pool.request().query(`
      USE QuanLyVanPhongPham;
      
      IF EXISTS (SELECT 1 FROM QuanLyThietBi.dbo.VANPHONGPHAM) 
         AND NOT EXISTS (SELECT 1 FROM QuanLyVanPhongPham.dbo.VANPHONGPHAM)
      BEGIN
        SET IDENTITY_INSERT QuanLyVanPhongPham.dbo.VANPHONGPHAM ON;
        INSERT INTO QuanLyVanPhongPham.dbo.VANPHONGPHAM (Id, MaVPP, TenVPP, DonViTinh, SoLuongTon, GhiChu, HinhAnh)
        SELECT Id, MaVPP, TenVPP, DonViTinh, SoLuongTon, GhiChu, HinhAnh
        FROM QuanLyThietBi.dbo.VANPHONGPHAM;
        SET IDENTITY_INSERT QuanLyVanPhongPham.dbo.VANPHONGPHAM OFF;
      END
    `);

    console.log("Migrating NHAP_VPP...");
    await pool.request().query(`
      USE QuanLyVanPhongPham;
      
      IF EXISTS (SELECT 1 FROM QuanLyThietBi.dbo.NHAP_VPP)
         AND NOT EXISTS (SELECT 1 FROM QuanLyVanPhongPham.dbo.NHAP_VPP)
      BEGIN
        SET IDENTITY_INSERT QuanLyVanPhongPham.dbo.NHAP_VPP ON;
        INSERT INTO QuanLyVanPhongPham.dbo.NHAP_VPP (Id, VppId, SoLuong, DonGia, VAT, ThanhTien, NgayNhap, NguoiNhap, GhiChu)
        SELECT Id, VppId, SoLuong, DonGia, VAT, ThanhTien, NgayNhap, NguoiNhap, GhiChu
        FROM QuanLyThietBi.dbo.NHAP_VPP;
        SET IDENTITY_INSERT QuanLyVanPhongPham.dbo.NHAP_VPP OFF;
      END
    `);

    console.log("Migrating XUAT_VPP...");
    await pool.request().query(`
      USE QuanLyVanPhongPham;
      
      IF EXISTS (SELECT 1 FROM QuanLyThietBi.dbo.XUAT_VPP)
         AND NOT EXISTS (SELECT 1 FROM QuanLyVanPhongPham.dbo.XUAT_VPP)
      BEGIN
        SET IDENTITY_INSERT QuanLyVanPhongPham.dbo.XUAT_VPP ON;
        INSERT INTO QuanLyVanPhongPham.dbo.XUAT_VPP (Id, VppId, SoLuong, NguoiNhan, NgayXuat, GhiChu)
        SELECT Id, VppId, SoLuong, NguoiNhan, NgayXuat, GhiChu
        FROM QuanLyThietBi.dbo.XUAT_VPP;
        SET IDENTITY_INSERT QuanLyVanPhongPham.dbo.XUAT_VPP OFF;
      END
    `);
    console.log("Data migration completed.");

    // 4. Create Users
    console.log("Creating default VPP accounts...");
    const adminPass = await bcrypt.hash("admin@123", 10);
    const userPass = await bcrypt.hash("1234@Abc", 10);
    
    await pool.request()
      .input('adminPass', sql.NVarChar, adminPass)
      .input('userPass', sql.NVarChar, userPass)
      .query(`
        USE QuanLyVanPhongPham;
        IF NOT EXISTS (SELECT 1 FROM TAIKHOAN WHERE Username = 'Admin')
          INSERT INTO TAIKHOAN (Username, PasswordHash, Role) VALUES ('Admin', @adminPass, 'admin');
        
        IF NOT EXISTS (SELECT 1 FROM TAIKHOAN WHERE Username = 'User')
          INSERT INTO TAIKHOAN (Username, PasswordHash, Role) VALUES ('User', @userPass, 'user');
      `);
    console.log("Accounts created.");

    // 5. Drop old tables from QuanLyThietBi
    console.log("Dropping old tables from QuanLyThietBi...");
    await pool.request().query(`
      USE QuanLyThietBi;
      
      IF EXISTS (SELECT * FROM sysobjects WHERE name='NHAP_VPP' and xtype='U')
        DROP TABLE NHAP_VPP;
        
      IF EXISTS (SELECT * FROM sysobjects WHERE name='XUAT_VPP' and xtype='U')
        DROP TABLE XUAT_VPP;
        
      IF EXISTS (SELECT * FROM sysobjects WHERE name='VANPHONGPHAM' and xtype='U')
        DROP TABLE VANPHONGPHAM;
    `);
    console.log("Old tables dropped successfully.");

    console.log("MIGRATION COMPLETED SUCCESSFULLY!");
  } catch (err) {
    console.error("Migration Failed: ", err);
  } finally {
    if (pool) await pool.close();
  }
}

migrate();
