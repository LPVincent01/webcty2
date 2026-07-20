// index.js — Express + MSSQL + Static

const express = require("express");
const sql = require("mssql");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");

const app = express();
const PORT = 3000;
const HOST = "0.0.0.0"; // Cho phép truy cập từ tất cả IP trong LAN

/* ========= CẤU HÌNH SQL SERVER ========= */
const config = {
  user: process.env.DB_USER || "sa",
  password: process.env.DB_PASSWORD || "Abc@123456!",
  //server: process.env.DB_SERVER || "127.0.0.1",
  // Thay 127.0.0.1 thành IP của Server để dù chạy ở Laptop vẫn trỏ về Server
  server: process.env.DB_SERVER || "192.168.11.205",
  database: process.env.DB_NAME || "QuanLyThietBi",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

const configVPP = {
  ...config,
  database: "QuanLyVanPhongPham"
};

/* ============== MIDDLEWARE CHUNG ============== */
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// CORS: cho phép origin từ localhost và IP LAN
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://192.168.11.205:3000",
  "http://192.168.11.205:5500",
  "http://192.168.11.207:3000", // Thêm IP Card mạng 1 của Server
  "http://192.168.10.207:3000", // Thêm IP Card mạng 2 của Server
  // IP WAN Viettel
  "http://115.79.138.139:3000",
  "http://115.79.138.139:5500", // nếu front-end chạy port 5500
  "http://172.30.90.29:3000",
  "http://172.30.90.29:5500",
];

app.use(
  cors({
    origin: "*", // Cho phép mọi IP quét mã không bị lỗi CORS
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
    optionsSuccessStatus: 204,
  }),
);

// Log request để debug nhanh
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()}  ${req.method} ${req.originalUrl}`);
  next();
});

/* ======= PHỤC VỤ FRONTEND (STATIC) ======= */
app.use(express.static(__dirname));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/health", (_req, res) => res.json({ ok: true }));

/* ====== AUTH (ĐĂNG NHẬP + PHÂN QUYỀN) ====== */
// const USERS = []; // Đã bỏ user cứng
const TOKENS = new Map(); // token -> { username, role }
const TOKEN_TTL = 24 * 60 * 60 * 1000; // 24 giờ

// Dọn dẹp token hết hạn mỗi giờ
setInterval(
  () => {
    const now = Date.now();
    for (const [token, session] of TOKENS.entries()) {
      if (session.expiresAt < now) {
        TOKENS.delete(token);
      }
    }
    console.log(
      `[CLEANUP] Đã dọn dẹp token. Số lượng hiện tại: ${TOKENS.size}`,
    );
  },
  60 * 60 * 1000,
);

function makeToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// API Đăng nhập (Dùng Database)
app.post("/api/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).send("Thiếu thông tin đăng nhập");

  try {
    const pool = await poolPromise;
    // 1. Tìm user trong DB (Bảng TAIKHOAN)
    const result = await pool
      .request()
      .input("Username", sql.VarChar, username)
      .query("SELECT * FROM dbo.TAIKHOAN WHERE Username = @Username");

    const user = result.recordset[0];

    // 2. Nếu không có user
    if (!user) return res.status(401).send("Sai tài khoản hoặc mật khẩu");

    // 3. So sánh mật khẩu
    let isMatch = false;

    // Kiểm tra xem mật khẩu có phải là hash bcrypt không (bắt đầu bằng $2a, $2b hoặc $2y)
    // Tài khoản cũ lưu plain text sẽ không bắt đầu bằng $2
    if (!user.PasswordHash.startsWith("$2")) {
      // So sánh thường (cho user cũ hoặc admin chưa hash)
      isMatch = password === user.PasswordHash;
    } else {
      // So sánh bằng thư viện bcrypt
      isMatch = await bcrypt.compare(password, user.PasswordHash);
    }

    if (!isMatch) return res.status(401).send("Sai tài khoản hoặc mật khẩu");

    // 4. Tạo token
    const token = makeToken();
    TOKENS.set(token, {
      username: user.Username,
      role: user.Role,
      displayName: user.DisplayName, // Lưu thêm tên hiển thị
      expiresAt: Date.now() + TOKEN_TTL,
    });
    return res.json({
      token,
      role: user.Role,
      username: user.Username,
      displayName: user.DisplayName,
    });
  } catch (err) {
    handleSqlError(res, err);
  }
});

// API Đăng nhập cho VPP (Dùng DB QuanLyVanPhongPham)
app.post("/api/vpp/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).send("Thiếu thông tin đăng nhập");
  
  try {
    const pool = await vppPoolPromise;
    const result = await pool.request()
      .input('Username', sql.VarChar, username)
      .query('SELECT * FROM dbo.TAIKHOAN WHERE Username = @Username');
      
    const user = result.recordset[0];
    if (!user) return res.status(401).send("Sai tài khoản hoặc mật khẩu");
    
    let isMatch = false;
    if (user.PasswordHash.startsWith("$2")) {
      isMatch = await bcrypt.compare(password, user.PasswordHash);
    } else {
      isMatch = password === user.PasswordHash;
    }
    
    if (!isMatch) return res.status(401).send("Sai tài khoản hoặc mật khẩu");
    
    const token = makeToken();
    TOKENS.set(token, {
      username: user.Username,
      role: user.Role,
      displayName: user.Username,
      expiresAt: Date.now() + TOKEN_TTL,
    });
    
    return res.json({
      token,
      role: user.Role,
      username: user.Username,
      displayName: user.Username,
    });
  } catch (err) {
    console.error("VPP Login Error:", err);
    res.status(500).send("Lỗi server khi đăng nhập");
  }
});

// --- API QUẢN LÝ TÀI KHOẢN (Admin Only) ---

// Lấy danh sách
app.get("/api/accounts", authenticate, authorizeAdmin, async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .query(
        "SELECT Username, Role, DisplayName, CreatedAt, MatKhauGoc FROM dbo.TAIKHOAN",
      );
    res.json(result.recordset);
  } catch (err) {
    handleSqlError(res, err);
  }
});

// 2. Tạo tài khoản mới (Có mã hóa mật khẩu + Lưu mật khẩu gốc)
app.post("/api/accounts", authenticate, authorizeAdmin, async (req, res) => {
  const { username, password, role, displayName } = req.body;

  if (!username || !password) {
    return res.status(400).send("Thiếu tên đăng nhập hoặc mật khẩu");
  }

  try {
    const pool = await poolPromise;

    // Kiểm tra trùng username
    const check = await pool
      .request()
      .input("Username", sql.VarChar, username)
      .query("SELECT 1 FROM dbo.TAIKHOAN WHERE Username = @Username");

    if (check.recordset.length > 0) {
      return res.status(409).send("Tên đăng nhập đã tồn tại!");
    }

    // Mã hóa mật khẩu
    let passwordToSave = password;
    try {
      const salt = await bcrypt.genSalt(10);
      passwordToSave = await bcrypt.hash(password, salt);
    } catch (e) {
      console.warn("Lỗi mã hóa bcrypt, lưu mật khẩu dạng thô.", e);
    }

    // LƯU Ý: Thêm @MatKhauGoc vào câu lệnh INSERT
    await pool
      .request()
      .input("Username", sql.VarChar, username)
      .input("PasswordHash", sql.VarChar, passwordToSave) // Mật khẩu đã mã hóa dùng để đăng nhập
      .input("MatKhauGoc", sql.NVarChar, password) // Mật khẩu gốc dùng để xem
      .input("Role", sql.VarChar, role || "user")
      .input("DisplayName", sql.NVarChar, displayName || username).query(`
        INSERT INTO dbo.TAIKHOAN (Username, PasswordHash, Role, DisplayName, MatKhauGoc)
        VALUES (@Username, @PasswordHash, @Role, @DisplayName, @MatKhauGoc)
      `);

    res.status(201).send("Tạo tài khoản thành công");
  } catch (err) {
    handleSqlError(res, err);
  }
});

// Xóa tài khoản
app.delete(
  "/api/accounts/:username",
  authenticate,
  authorizeAdmin,
  async (req, res) => {
    if (req.params.username === "admin")
      return res.status(400).send("Không thể xóa Super Admin");
    try {
      const pool = await poolPromise;
      await pool
        .request()
        .input("Username", sql.VarChar, req.params.username)
        .query("DELETE FROM dbo.TAIKHOAN WHERE Username = @Username");
      res.send("Xóa tài khoản thành công");
    } catch (err) {
      handleSqlError(res, err);
    }
  },
);

// Cập nhật quyền tài khoản (Admin Only)
app.put(
  "/api/accounts/:username/role",
  authenticate,
  authorizeAdmin,
  async (req, res) => {
    const { username } = req.params;
    const { role } = req.body;

    // Kiểm tra quyền hợp lệ
    if (!role || (role !== "admin" && role !== "user")) {
      return res.status(400).send("Quyền không hợp lệ");
    }

    // Không cho phép đổi quyền của tài khoản admin gốc
    if (username === "admin") {
      return res.status(400).send("Không thể thay đổi quyền của Super Admin");
    }

    try {
      const pool = await poolPromise;
      await pool
        .request()
        .input("Username", sql.VarChar, username)
        .input("Role", sql.VarChar, role)
        .query(
          "UPDATE dbo.TAIKHOAN SET Role = @Role WHERE Username = @Username",
        );

      res.send("Cập nhật quyền thành công");
    } catch (err) {
      handleSqlError(res, err);
    }
  },
);

function authenticate(req, res, next) {
  const auth = req.headers["authorization"] || "";

  // 🔍 Log để debug
  console.log(
    "[AUTH]",
    new Date().toISOString(),
    req.method,
    req.originalUrl,
    "auth=",
    auth || "(empty)",
    "TOKENS size=",
    TOKENS.size,
  );

  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) {
    console.warn("[AUTH] Thiếu token");
    return res.status(401).send("Thiếu token");
  }

  const token = m[1];
  const session = TOKENS.get(token);
  if (!session) {
    console.warn("[AUTH] Token không hợp lệ:", token);
    return res.status(401).send("Token không hợp lệ");
  }

  if (session.expiresAt < Date.now()) {
    TOKENS.delete(token);
    console.warn("[AUTH] Token đã hết hạn");
    return res.status(401).send("Phiên đăng nhập hết hạn");
  }

  req.user = session;
  next();
}

function authorizeAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).send("Không có quyền");
  next();
}

/* ====== KẾT NỐI SQL POOL + START ====== */
const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then((pool) => {
    console.log("✅ Kết nối SQL Server thành công (QuanLyThietBi)");
    return pool;
  })
  .catch((err) => {
    console.error("❌ Kết nối CSDL thất bại (QuanLyThietBi): ", err);
    process.exit(1);
  });

const vppPoolPromise = new sql.ConnectionPool(configVPP)
  .connect()
  .then((pool) => {
    console.log("✅ Kết nối SQL Server thành công (QuanLyVanPhongPham)");
    return pool;
  })
  .catch((err) => {
    console.error("❌ Kết nối CSDL thất bại (QuanLyVanPhongPham): ", err);
  });

  poolPromise.then(async (pool) => {
    console.log("✅ Kết nối SQL Server thành công");

    // (Re)create CHECK constraints để có 'Hư Hỏng'
    await pool
      .request()
      .query(
        `
      -- THIETBI.Trangthai
      IF EXISTS (SELECT 1 FROM sys.check_constraints 
                 WHERE name = 'CK_THIETBI_Trangthai' AND parent_object_id = OBJECT_ID('dbo.THIETBI'))
        ALTER TABLE dbo.THIETBI DROP CONSTRAINT CK_THIETBI_Trangthai;
      ALTER TABLE dbo.THIETBI WITH NOCHECK ADD CONSTRAINT CK_THIETBI_Trangthai
        CHECK (Trangthai IN (N'Đang sử dụng', N'Bảo Hành', N'Sẵn sàng', N'Hư Hỏng'));
      ALTER TABLE dbo.THIETBI CHECK CONSTRAINT CK_THIETBI_Trangthai;

      -- NHANVIEN.Trangthai
      IF EXISTS (SELECT 1 FROM sys.check_constraints 
                 WHERE name = 'CK_NHANVIEN_Trangthai' AND parent_object_id = OBJECT_ID('dbo.NHANVIEN'))
        ALTER TABLE dbo.NHANVIEN DROP CONSTRAINT CK_NHANVIEN_Trangthai;
      ALTER TABLE dbo.NHANVIEN WITH NOCHECK ADD CONSTRAINT CK_NHANVIEN_Trangthai
        CHECK (Trangthai IN (N'Đang sử dụng', N'Bảo Hành', N'Chưa cấp', N'Hư Hỏng'));
      ALTER TABLE dbo.NHANVIEN CHECK CONSTRAINT CK_NHANVIEN_Trangthai;
    `,
      )
      .then(() =>
        console.log(
          "✅ CHECK constraints Trangthai đã sẵn sàng (có 'Hư Hỏng').",
        ),
      )
      .catch((e) =>
        console.warn(
          "⚠️ Không thể thiết lập CHECK constraints:",
          e?.message || e,
        ),
      );

    // Unique index mỗi thiết bị chỉ gán cho 1 nhân viên (bỏ qua NULL)
    await pool
      .request()
      .query(
        `
        IF NOT EXISTS (
          SELECT name FROM sys.indexes
          WHERE name = 'UX_NHANVIEN_Thietbisudung'
            AND object_id = OBJECT_ID('dbo.NHANVIEN')
        )
        CREATE UNIQUE INDEX UX_NHANVIEN_Thietbisudung
        ON dbo.NHANVIEN(Thietbisudung)
        WHERE Thietbisudung IS NOT NULL;
      `,
      )
      .then(() =>
        console.log("✅ Unique index NHANVIEN(Thietbisudung) sẵn sàng"),
      )
      .catch((e) =>
        console.warn("⚠️ Không thể tạo unique index:", e?.message || e),
      );

    // Đảm bảo Serial(S/N) là duy nhất (bỏ qua NULL/chuỗi rỗng)
    await pool
      .request()
      .query(
        `
        IF NOT EXISTS (
          SELECT name FROM sys.indexes
          WHERE name = 'UX_THIETBI_SerialSN'
            AND object_id = OBJECT_ID('dbo.THIETBI')
        )
        CREATE UNIQUE INDEX UX_THIETBI_SerialSN
        ON dbo.THIETBI(SerialSN)
        WHERE SerialSN IS NOT NULL AND LEN(SerialSN) > 0;
      `,
      )
      .then(() => console.log("✅ Unique index THIETBI(SerialSN) sẵn sàng"))
      .catch((e) =>
        console.warn("⚠️ Không thể tạo unique index SerialSN:",
          e?.message || e,
        ),
      );

    // Ensure các cột phục vụ đồng bộ/khôi phục
    await pool
      .request()
      .query(
        `
        IF COL_LENGTH('dbo.THIETBI','LastUserName') IS NULL
          ALTER TABLE dbo.THIETBI ADD LastUserName NVARCHAR(255) NULL;
        IF COL_LENGTH('dbo.THIETBI','LastUserId') IS NULL
          ALTER TABLE dbo.THIETBI ADD LastUserId VARCHAR(50) NULL;
        IF COL_LENGTH('dbo.THIETBI','LastAssignedDate') IS NULL
          ALTER TABLE dbo.THIETBI ADD LastAssignedDate DATE NULL;
        IF COL_LENGTH('dbo.THIETBI','HinhAnhThucTe') IS NULL
          ALTER TABLE dbo.THIETBI ADD HinhAnhThucTe NVARCHAR(255) NULL;
      `,
      )
      .then(() => console.log("✅ THIETBI.Last* columns ready"))
      .catch((e) =>
        console.warn("⚠️ Ensure Last* columns lỗi:", e?.message || e),
      );

    // ====== Migration: Đổi tên TenDot thành Thoigiankiemke ======
    try {
      await pool.request().query(`
        IF COL_LENGTH('dbo.DOTKIEMKE', 'TenDot') IS NOT NULL
        BEGIN
          EXEC sp_rename 'dbo.DOTKIEMKE.TenDot', 'Thoigiankiemke', 'COLUMN';
        END

        -- Migration: Bỏ cột HinhAnhThucTe của Kiemketaisan
        IF COL_LENGTH('dbo.Kiemketaisan', 'HinhAnhThucTe') IS NOT NULL
        BEGIN
          ALTER TABLE dbo.Kiemketaisan DROP COLUMN HinhAnhThucTe;
        END

        -- Data Migration: Cập nhật ảnh từ KIEMKECHITIET sang THIETBI
        UPDATE T
        SET T.HinhAnhThucTe = K.HinhAnhThucTe
        FROM dbo.THIETBI T
        INNER JOIN (
            SELECT MaTaiSan, HinhAnhThucTe,
                   ROW_NUMBER() OVER(PARTITION BY MaTaiSan ORDER BY ThoiGianQuet DESC) as rn
            FROM dbo.KIEMKECHITIET
            WHERE HinhAnhThucTe IS NOT NULL
        ) K ON T.MaTaiSan = K.MaTaiSan AND K.rn = 1
        WHERE T.HinhAnhThucTe IS NULL;
      `);
    } catch(e) {
      console.warn("⚠️ Không thể đổi tên cột TenDot:", e?.message);
    }

    // ====== Tạo bảng đợt kiểm kê + chi tiết kiểm kê (nếu chưa có) ======
    await pool
      .request()
      .query(
        `
        -- Bảng đợt kiểm kê
        IF NOT EXISTS (
          SELECT 1 FROM sys.tables 
          WHERE name = 'DOTKIEMKE' AND schema_id = SCHEMA_ID('dbo')
        )
        BEGIN
          CREATE TABLE dbo.DOTKIEMKE (
            DotID INT IDENTITY(1,1) PRIMARY KEY,
            Thoigiankiemke NVARCHAR(100) NOT NULL,
            NgayBatDau DATE NULL,
            NgayKetThuc DATE NULL,
            GhiChu NVARCHAR(255) NULL
          );
        END;

        -- Tạo 1 đợt kiểm kê mặc định nếu bảng rỗng
        IF NOT EXISTS (SELECT 1 FROM dbo.DOTKIEMKE)
        BEGIN
          INSERT INTO dbo.DOTKIEMKE (Thoigiankiemke, NgayBatDau, GhiChu)
          VALUES (CONVERT(varchar(7), GETDATE(), 120), CONVERT(date, GETDATE()), N'Tạo tự động bởi backend');
        END;

        -- Bảng chi tiết kiểm kê
        IF NOT EXISTS (
          SELECT 1 FROM sys.tables 
          WHERE name = 'KIEMKECHITIET' AND schema_id = SCHEMA_ID('dbo')
        )
        BEGIN
          CREATE TABLE dbo.KIEMKECHITIET (
            ID INT IDENTITY(1,1) PRIMARY KEY,
            DotID INT NOT NULL,
            MaTaiSan VARCHAR(50) NOT NULL,
            TrangThaiThucTe NVARCHAR(50) NULL,
            ViTriThucTe NVARCHAR(100) NULL,
            NhanVienKiemKe NVARCHAR(100) NULL,
            ThoiGianQuet DATETIME NOT NULL DEFAULT(GETDATE()),
            GhiChu NVARCHAR(255) NULL
          );

          ALTER TABLE dbo.KIEMKECHITIET
            ADD CONSTRAINT FK_KIEMKE_DOT FOREIGN KEY (DotID)
              REFERENCES dbo.DOTKIEMKE(DotID);

          ALTER TABLE dbo.KIEMKECHITIET
            ADD CONSTRAINT FK_KIEMKE_THIETBI FOREIGN KEY (MaTaiSan)
              REFERENCES dbo.THIETBI(MaTaiSan);

          -- Mỗi thiết bị chỉ có 1 dòng / 1 đợt
          CREATE UNIQUE INDEX UX_KIEMKE_Dot_ThietBi
            ON dbo.KIEMKECHITIET(DotID, MaTaiSan);
            
          -- Index tối ưu truy vấn lấy ảnh mới nhất
          CREATE INDEX IX_KIEMKE_HinhAnh 
            ON dbo.KIEMKECHITIET(MaTaiSan, DotID DESC, ThoiGianQuet DESC) 
            INCLUDE (HinhAnhThucTe);
        END;

        -- Bảng Kiemketaisan (mới thêm theo yêu cầu)
        IF NOT EXISTS (
          SELECT * FROM sys.tables 
          WHERE name = 'Kiemketaisan' AND schema_id = SCHEMA_ID('dbo')
        )
        BEGIN
          CREATE TABLE dbo.Kiemketaisan (
            ID INT IDENTITY(1,1) PRIMARY KEY,
            Dotkiemke INT NOT NULL,
            MaTaiSan VARCHAR(50) NOT NULL,
            NhanVienKiemKe NVARCHAR(100) NULL,
            ThoiGianQuet DATETIME DEFAULT GETDATE(),
            TrangThaiThucTe NVARCHAR(50) NULL,
            ViTriThucTe NVARCHAR(100) NULL,
            Ghichu NVARCHAR(255) NULL
          );
        END;

        -- Thêm cột hình ảnh nếu chưa có
        IF COL_LENGTH('dbo.KIEMKECHITIET','HinhAnhThucTe') IS NULL
        BEGIN
          ALTER TABLE dbo.KIEMKECHITIET ADD HinhAnhThucTe NVARCHAR(255) NULL;
          PRINT 'Added column HinhAnhThucTe to KIEMKECHITIET';
        END;
        `,
      )
      .then(() =>
        console.log("✅ Bảng kiểm kê (DOTKIEMKE, KIEMKECHITIET) sẵn sàng"),
      )
      .catch((e) =>
        console.warn("⚠️ Không thể tạo bảng kiểm kê:", e?.message || e),
      );

    // --- Tích hợp các route VPP ---
    app.use('/api/vpp', require('./vppRoutes')(vppPoolPromise, authenticate));

    app.listen(PORT, HOST, () =>
      console.log(`🚀 Server chạy tại http://${HOST}:${PORT}`),
    );

    return pool;
  })
  .catch((err) => {
    console.error("❌ Lỗi kết nối SQL:", err);
    process.exit(1);
  });

/* ====== TIỆN ÍCH LỖI SQL ====== */
function handleSqlError(res, err) {
  // Lỗi trùng lặp
  if (err && (err.number === 2627 || err.number === 2601)) {
    const msg = String(err.message || "");
    if (msg.includes("UX_THIETBI_SerialSN"))
      return res.status(409).send("Serial(S/N) đã tồn tại.");
    if (msg.includes("UX_NHANVIEN_Thietbisudung"))
      return res.status(409).send("Thiết bị đã được gán.");
    if (/MaNV/.test(msg))
      return res.status(409).send("Mã nhân viên đã tồn tại.");
    return res.status(409).send("Dữ liệu trùng lặp.");
  }

  // Timeout (bắt cả 'Timeout' & 'ETIMEOUT')
  const msg = String(err?.message || "");
  const code = String(err?.code || "");
  if (/timeout/i.test(msg) || /ETIMEOUT/i.test(code)) {
    return res.status(504).send("Lỗi timeout khi truy vấn database.");
  }

  console.error("SQL error:", err);
  return res
    .status(500)
    .send("Lỗi máy chủ: " + (err?.message || "Không xác định"));
}
/* ===== BẮT ĐẦU FIX: CHUẨN HOÁ SerialSN (luôn là string hoặc null) ===== */
function normalizeSerialSN(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s || s === "0") return null; // "0" coi như chưa có serial
  return s;
}
/* ===== KẾT THÚC FIX ===== */

/* ====== TIỆN ÍCH CHUNG CHO TRANSACTION ====== */
async function runTx(work) {
  const pool = await poolPromise;
  const tx = new sql.Transaction(pool);
  try {
    await tx.begin();
    const out = await work(tx);
    await tx.commit();
    return out;
  } catch (e) {
    try {
      await tx.rollback();
    } catch (_) { }
    throw e;
  }
}

/* ====== TIỆN ÍCH TRA CỨU NGƯỜI DÙNG ====== */
async function findUserByIdOrName(tx, key) {
  if (!key || typeof key !== "string") return null;
  const k = key.trim();
  if (!k) return null;

  // Ưu tiên MaNV
  let req = new sql.Request(tx);
  req.input("KeyNV", sql.VarChar, k);
  let res = await req.query(
    "SELECT TOP 1 * FROM dbo.NHANVIEN WHERE MaNV=@KeyNV",
  );
  if (res.recordset.length) return res.recordset[0];

  // Fallback theo HoVaTen khi duy nhất
  req = new sql.Request(tx);
  req.input("KeyName", sql.NVarChar, k);
  res = await req.query("SELECT * FROM dbo.NHANVIEN WHERE HoVaTen=@KeyName");
  if (res.recordset.length === 1) return res.recordset[0];
  return null;
}

/* ========== API /api/devices ========== */

// Lấy danh sách thiết bị
app.get("/api/devices", authenticate, async (_req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT
        t.*,
        COALESCE(t.HinhAnhThucTe, kk.HinhAnhThucTe) as HinhAnhHienThi
      FROM dbo.THIETBI t
      LEFT JOIN (
        SELECT
          MaTaiSan, HinhAnhThucTe,
          ROW_NUMBER() OVER(PARTITION BY MaTaiSan ORDER BY DotID DESC, ThoiGianQuet DESC) as rn
        FROM dbo.KIEMKECHITIET
        WHERE HinhAnhThucTe IS NOT NULL
      ) kk ON t.MaTaiSan = kk.MaTaiSan AND kk.rn = 1
      ORDER BY t.MaTaiSan
    `);
    res.json(result.recordset);
  } catch (err) {
    handleSqlError(res, err);
  }
});
// Nhập danh sách thiết bị từ Excel
app.post(
  "/api/devices/import",
  authenticate,
  authorizeAdmin,
  async (req, res) => {
    const items = req.body || [];
    require('fs').writeFileSync('C:/Laptrinhweb/webcty2/scratch/payload.json', JSON.stringify(items, null, 2));
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).send("Không có dữ liệu");

    try {
      const pool = await poolPromise;
      const insertPromises = items.map((d) => {
        const req = pool.request();

        // Bỏ việc gán cứng giá trị mặc định cho TenTaiSan/LoaiTaiSan nếu người dùng không nhập trong Excel (để giữ nguyên giá trị cũ)
        req.input("MaTaiSan", sql.VarChar(50), d.MaTaiSan);
        req.input("TenTaiSan", sql.NVarChar(255), d.TenTaiSan || null);
        req.input("LoaiTaiSan", sql.NVarChar(100), d.LoaiTaiSan || null);
        req.input("SerialSN", sql.VarChar(100), normalizeSerialSN(d.SerialSN));

        let parsedDate = null;
        if (d.NgayNhap) {
          const tempDate = new Date(d.NgayNhap);
          if (!isNaN(tempDate) && tempDate >= new Date("1753-01-01")) {
            parsedDate = tempDate;
          }
        }
        req.input("NgayNhap", sql.Date, parsedDate);

        req.input("Trangthai", sql.NVarChar(50), d.Trangthai || null);
        req.input("Nguoisudung", sql.NVarChar(100), d.Nguoisudung || null);
        req.input("Vitri", sql.NVarChar(100), d.Vitri || null);
        req.input("CauHinh", sql.NVarChar(sql.MAX), d.CauHinh || null);
        req.input("DonViTinh", sql.NVarChar(50), d.DonViTinh || null);
        req.input("ThoiGianBaoHanh", sql.NVarChar(50), d.ThoiGianBaoHanh || null);
        req.input("DonGia", sql.NVarChar(50), d.DonGia || null);
        req.input("NamSanXuat", sql.Int, d.NamSanXuat || null);
        return req.query(`
  IF EXISTS (SELECT 1 FROM dbo.THIETBI WHERE MaTaiSan = @MaTaiSan)
  BEGIN
    -- Nếu đã tồn tại -> CẬP NHẬT THÔNG TIN MỚI TỪ EXCEL (Bỏ qua ô trống)
    UPDATE dbo.THIETBI
    SET TenTaiSan  = CASE WHEN @TenTaiSan IS NOT NULL AND @TenTaiSan != '' THEN @TenTaiSan ELSE TenTaiSan END,
        LoaiTaiSan = CASE WHEN @LoaiTaiSan IS NOT NULL AND @LoaiTaiSan != '' THEN @LoaiTaiSan ELSE LoaiTaiSan END,
        SerialSN    = CASE WHEN @SerialSN IS NOT NULL AND @SerialSN != '' THEN @SerialSN ELSE SerialSN END,
        NgayNhap    = CASE WHEN @NgayNhap IS NOT NULL THEN @NgayNhap ELSE NgayNhap END,
        Trangthai   = CASE WHEN @Trangthai IS NOT NULL AND @Trangthai != '' THEN @Trangthai ELSE Trangthai END,
        Nguoisudung = CASE WHEN @Nguoisudung IS NOT NULL AND @Nguoisudung != '' THEN @Nguoisudung ELSE Nguoisudung END,
        Vitri       = CASE WHEN @Vitri IS NOT NULL AND @Vitri != '' THEN @Vitri ELSE Vitri END,
        CauHinh     = CASE WHEN @CauHinh IS NOT NULL AND CAST(@CauHinh AS NVARCHAR(MAX)) != '' THEN @CauHinh ELSE CauHinh END,
        DonViTinh   = CASE WHEN @DonViTinh IS NOT NULL AND @DonViTinh != '' THEN @DonViTinh ELSE DonViTinh END,
        ThoiGianBaoHanh = CASE WHEN @ThoiGianBaoHanh IS NOT NULL AND @ThoiGianBaoHanh != '' THEN @ThoiGianBaoHanh ELSE ThoiGianBaoHanh END,
        DonGia      = CASE WHEN @DonGia IS NOT NULL AND @DonGia != '' THEN @DonGia ELSE DonGia END,
        NamSanXuat  = CASE WHEN @NamSanXuat IS NOT NULL THEN @NamSanXuat ELSE NamSanXuat END
    WHERE MaTaiSan = @MaTaiSan
  END
  ELSE
  BEGIN
    -- Nếu chưa tồn tại -> THÊM MỚI HOÀN TOÀN
    INSERT INTO dbo.THIETBI
      (MaTaiSan, TenTaiSan, LoaiTaiSan, SerialSN, NgayNhap, Trangthai, Nguoisudung, Vitri, CauHinh, DonViTinh, ThoiGianBaoHanh, DonGia, NamSanXuat)
    VALUES
      (@MaTaiSan, ISNULL(@TenTaiSan, @MaTaiSan), ISNULL(@LoaiTaiSan, N'Khác'), @SerialSN, ISNULL(@NgayNhap, GETDATE()), ISNULL(@Trangthai, N'Sẵn sàng'), @Nguoisudung, @Vitri, @CauHinh, @DonViTinh, @ThoiGianBaoHanh, @DonGia, @NamSanXuat)
  END
`);
      });

      await Promise.all(insertPromises);
      res.status(201).send("Đã nhập xong dữ liệu");
    } catch (err) {
      handleSqlError(res, err);
    }
  },
);

/* ========== API /api/purchases ========== */

// Lấy toàn bộ lịch sử mua hàng
app.get("/api/purchases", authenticate, async (_req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT
        PurchaseId,
        MaTaiSan,
        TenTaiSan,
        LoaiTaiSan,
        NgayNhap,
        ThanhTien,
        NguonMua,
        CreatedAt,
        UpdatedAt,
        LastUserName,
        LastUserId,
        LastAssignedDate
      FROM dbo.Purchase
      ORDER BY MaTaiSan, NgayNhap DESC, PurchaseId DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    handleSqlError(res, err);
  }
});
// Thêm 1 bản ghi mua hàng
app.post("/api/purchases", authenticate, async (req, res) => {
  const {
    MaTaiSan,
    NgayNhap,
    ThanhTien,
    NguonMua,
    LastUserName,
    LastUserId,
    LastAssignedDate,
  } = req.body || {};

  if (!MaTaiSan || !NgayNhap) {
    return res.status(400).send("MaTaiSan và NgayNhap là bắt buộc");
  }

  try {
    const pool = await poolPromise;

    // Lấy thông tin thiết bị để tự điền TenTaiSan, LoaiTaiSan
    const devResult = await pool
      .request()
      .input("MaTaiSan", sql.VarChar(50), MaTaiSan)
      .query(
        "SELECT TenTaiSan, LoaiTaiSan FROM dbo.THIETBI WHERE MaTaiSan=@MaTaiSan",
      );

    if (!devResult.recordset.length) {
      return res.status(400).send("Mã tài sản không tồn tại trong THIETBI");
    }

    const { TenTaiSan, LoaiTaiSan } = devResult.recordset[0];

    const insertReq = pool
      .request()
      .input("MaTaiSan", sql.VarChar(50), MaTaiSan)
      .input("TenTaiSan", sql.NVarChar(255), TenTaiSan || null)
      .input("LoaiTaiSan", sql.NVarChar(100), LoaiTaiSan || null)
      .input("NgayNhap", sql.Date, NgayNhap)
      .input("ThanhTien", sql.Decimal(18, 2), ThanhTien ?? null)
      .input("NguonMua", sql.NVarChar(50), NguonMua || null)
      .input("LastUserName", sql.NVarChar(100), LastUserName || null)
      .input("LastUserId", sql.Int, LastUserId ?? null)
      .input("LastAssignedDate", sql.DateTime, LastAssignedDate || null);

    const result = await insertReq.query(`
      INSERT INTO dbo.Purchase
        (MaTaiSan, TenTaiSan, LoaiTaiSan, NgayNhap, ThanhTien, NguonMua,
         LastUserName, LastUserId, LastAssignedDate, CreatedAt, UpdatedAt)
      VALUES
        (@MaTaiSan, @TenTaiSan, @LoaiTaiSan, @NgayNhap, @ThanhTien, @NguonMua,
         @LastUserName, @LastUserId, @LastAssignedDate, GETDATE(), GETDATE());
      SELECT TOP 1 *
      FROM dbo.Purchase
      WHERE PurchaseId = SCOPE_IDENTITY();
    `);

    res.status(201).json(result.recordset[0]);
  } catch (err) {
    handleSqlError(res, err);
  }
});

// Sửa 1 bản ghi mua hàng
app.put(
  "/api/purchases/:id",
  authenticate,
  authorizeAdmin, // Chỉ admin được sửa
  async (req, res) => {
    const purchaseId = parseInt(req.params.id, 10);
    if (!purchaseId || purchaseId < 1) {
      return res.status(400).send("PurchaseId không hợp lệ");
    }

    const {
      MaTaiSan,
      NgayNhap,
      ThanhTien,
      NguonMua,
      LastUserName,
      LastUserId,
      LastAssignedDate,
    } = req.body || {};

    if (!MaTaiSan || !NgayNhap) {
      return res.status(400).send("MaTaiSan và NgayNhap là bắt buộc");
    }

    try {
      const pool = await poolPromise;

      // Lấy thông tin thiết bị
      const devResult = await pool
        .request()
        .input("MaTaiSan", sql.VarChar(50), MaTaiSan)
        .query(
          "SELECT TenTaiSan, LoaiTaiSan FROM dbo.THIETBI WHERE MaTaiSan=@MaTaiSan",
        );

      if (!devResult.recordset.length) {
        return res.status(400).send("Mã tài sản không tồn tại trong THIETBI");
      }

      const { TenTaiSan, LoaiTaiSan } = devResult.recordset[0];

      const updateReq = pool
        .request()
        .input("PurchaseId", sql.Int, purchaseId)
        .input("MaTaiSan", sql.VarChar(50), MaTaiSan)
        .input("TenTaiSan", sql.NVarChar(255), TenTaiSan || null)
        .input("LoaiTaiSan", sql.NVarChar(100), LoaiTaiSan || null)
        .input("NgayNhap", sql.Date, NgayNhap)
        .input("ThanhTien", sql.Decimal(18, 2), ThanhTien ?? null)
        .input("NguonMua", sql.NVarChar(50), NguonMua || null)
        .input("LastUserName", sql.NVarChar(100), LastUserName || null)
        .input("LastUserId", sql.Int, LastUserId ?? null)
        .input("LastAssignedDate", sql.DateTime, LastAssignedDate || null);

      const result = await updateReq.query(`
      UPDATE dbo.Purchase
      SET
        MaTaiSan      = @MaTaiSan,
        TenTaiSan     = @TenTaiSan,
        LoaiTaiSan    = @LoaiTaiSan,
        NgayNhap       = @NgayNhap,
        ThanhTien      = @ThanhTien,
        NguonMua       = @NguonMua,
        LastUserName   = @LastUserName,
        LastUserId     = @LastUserId,
        LastAssignedDate = @LastAssignedDate,
        UpdatedAt      = GETDATE()
      WHERE PurchaseId   = @PurchaseId;

      SELECT *
      FROM dbo.Purchase
      WHERE PurchaseId = @PurchaseId;
    `);

      if (!result.recordset.length) {
        return res.status(404).send("Không tìm thấy bản ghi Purchase");
      }

      res.json(result.recordset[0]);
    } catch (err) {
      handleSqlError(res, err);
    }
  },
);

// Xoá 1 bản ghi mua hàng
app.delete(
  "/api/purchases/:id",
  authenticate,
  authorizeAdmin, // Chỉ admin được xóa
  async (req, res) => {
    const purchaseId = parseInt(req.params.id, 10);
    if (!purchaseId || purchaseId < 1) {
      return res.status(400).send("PurchaseId không hợp lệ");
    }

    try {
      const pool = await poolPromise;
      const result = await pool
        .request()
        .input("PurchaseId", sql.Int, purchaseId).query(`
          DELETE FROM dbo.Purchase
          WHERE PurchaseId = @PurchaseId;
        `);

      if (!result.rowsAffected[0]) {
        return res.status(404).send("Không tìm thấy bản ghi Purchase");
      }

      res.status(204).send(); // No Content
    } catch (err) {
      handleSqlError(res, err);
    }
  },
);

/* ========== PUBLIC API CHO UPLOAD HÌNH ẢNH ========== */

// 1. Đảm bảo thư mục 'public/uploads' tồn tại
const uploadDir = path.join(__dirname, "public", "upload");
if (!require("fs").existsSync(uploadDir)) {
  require("fs").mkdirSync(uploadDir, { recursive: true });
}

// 2. Cấu hình Multer để lưu trữ file
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // Lưu file vào thư mục 'public/upload hình ảnh'
  },
  filename: function (req, file, cb) {
    // Tạo tên file duy nhất: MaTaiSan-DotID-Timestamp.jpg
    const maTaiSan = req.body.maTaiSan || "unknown";
    const dotId = req.body.dotId || "1";
    const uniqueSuffix = Date.now();
    const newFilename = `${maTaiSan}-dot${dotId}-${uniqueSuffix}${path.extname(
      file.originalname,
    )}`;
    cb(null, newFilename);
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // Giới hạn 10MB
  fileFilter: function (req, file, cb) {
    // Chỉ chấp nhận file ảnh JPEG
    if (file.mimetype === "image/jpeg") {
      cb(null, true);
    } else {
      cb(new Error("Chỉ cho phép tải lên tệp hình ảnh JPG/JPEG!"), false);
    }
  },
}).single("image"); // 'image' là tên của field trong FormData từ client

// 3. Endpoint để xử lý upload
app.post("/public/upload-image", (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      // Lỗi từ Multer (sai loại file, quá dung lượng, ...)
      return res.status(400).json({ message: err.message });
    }
    if (!req.file) {
      return res
        .status(400)
        .json({ message: "Không có tệp nào được tải lên." });
    }

    const { maTaiSan, dotId, nhanVien } = req.body;
    if (!maTaiSan || !dotId) {
      return res
        .status(400)
        .json({ message: "Thiếu thông tin Mã Thiết Bị hoặc Đợt Kiểm Kê." });
    }

    // Đường dẫn tương đối để lưu vào DB và truy cập từ web
    const imagePath = `/public/upload/${req.file.filename}`.replace(/\\/g, "/");

    try {
      const pool = await poolPromise;
      await pool
        .request()
        .input("MaTaiSan", sql.VarChar, maTaiSan)
        .input("DotID", sql.Int, dotId)
        .input("HinhAnh", sql.NVarChar, imagePath)
        .input("NhanVien", sql.NVarChar, nhanVien || "N/A") // Input mới
        .query(
          `
          -- Cập nhật đường dẫn ảnh trực tiếp vào bảng THIETBI
          UPDATE THIETBI
          SET HinhAnhThucTe = @HinhAnh
          WHERE MaTaiSan = @MaTaiSan;
        `,
        );

      res.status(200).json({
        message: "Tải ảnh lên thành công!",
        path: imagePath,
      });
    } catch (dbError) {
      console.error("Upload-image DB error:", dbError);

      // Trả JSON để client không bị lỗi parse JSON
      const msg =
        dbError && dbError.message ? dbError.message : "Không xác định";

      return res.status(500).json({
        message: "Lỗi máy chủ: " + msg,
      });
    }
  });
});

// Thêm thiết bị
app.post("/api/devices", authenticate, async (req, res) => {
  const {
    MaTaiSan,
    TenTaiSan,
    LoaiTaiSan,
    SerialSN,
    NgayNhap,
    Trangthai,
    Nguoisudung,
    Ngaycap,
    Vitri,
    CauHinh,
    DonViTinh,
    ThoiGianBaoHanh,
    DonGia,
    NamSanXuat,
  } = req.body || {};

  if (!MaTaiSan || !TenTaiSan) {
    return res.status(400).send("Thiếu mã hoặc tên thiết bị");
  }

  try {
    await runTx(async (tx) => {
      const state = Trangthai || "Sẵn sàng";
      const candidateUser =
        state === "Bảo Hành" || state === "Hư Hỏng"
          ? null
          : typeof Nguoisudung === "string"
            ? Nguoisudung.trim()
            : null;

      let assignedUser = null;
      if (candidateUser) {
        assignedUser = await findUserByIdOrName(tx, candidateUser);
        if (!assignedUser) {
          throw Object.assign(
            new Error("Không tìm thấy người dùng tương ứng"),
            {
              http: 400,
            },
          );
        }
      }

      await new sql.Request(tx)
        .input("MaTaiSan", sql.VarChar, MaTaiSan)
        .input("TenTaiSan", sql.NVarChar, TenTaiSan)
        .input("LoaiTaiSan", sql.NVarChar, LoaiTaiSan || "")
        .input("SerialSN", sql.VarChar(100), normalizeSerialSN(SerialSN) || "")
        .input("NgayNhap", sql.Date, NgayNhap || null)
        .input("Trangthai", sql.NVarChar, state)
        .input(
          "Nguoisudung",
          sql.NVarChar,
          assignedUser ? assignedUser.HoVaTen : null,
        )
        .input("Vitri", sql.NVarChar, Vitri || null)
        .input("CauHinh", sql.NVarChar(sql.MAX), CauHinh || null)
        .input("DonViTinh", sql.NVarChar(50), DonViTinh || null)
        .input("ThoiGianBaoHanh", sql.NVarChar(50), ThoiGianBaoHanh || null)
        .input("DonGia", sql.NVarChar(50), DonGia || null)
        .input("NamSanXuat", sql.Int, NamSanXuat || null)
        .query(
          `INSERT INTO dbo.THIETBI
           (MaTaiSan, TenTaiSan, LoaiTaiSan, SerialSN, NgayNhap, Trangthai, Nguoisudung, Vitri, CauHinh, DonViTinh, ThoiGianBaoHanh, DonGia, NamSanXuat)
           VALUES (@MaTaiSan, @TenTaiSan, @LoaiTaiSan, @SerialSN, @NgayNhap, @Trangthai, @Nguoisudung, @Vitri, @CauHinh, @DonViTinh, @ThoiGianBaoHanh, @DonGia, @NamSanXuat)`,
        );

      if (assignedUser) {
        // Giải phóng thiết bị cũ nếu có
        if (
          assignedUser.Thietbisudung &&
          assignedUser.Thietbisudung !== MaTaiSan
        ) {
          await new sql.Request(tx)
            .input("PrevDev", sql.VarChar, assignedUser.Thietbisudung)
            .query(
              "UPDATE dbo.THIETBI SET Trangthai=N'Sẵn sàng', Nguoisudung=NULL WHERE MaTaiSan=@PrevDev",
            );
        }
        await new sql.Request(tx)
          .input("MaNV", sql.VarChar, assignedUser.MaNV)
          .input("MaTaiSan", sql.VarChar, MaTaiSan)
          .input("Ngaycap", sql.Date, Ngaycap || null)
          .query(
            "UPDATE dbo.NHANVIEN SET Thietbisudung=@MaTaiSan, Ngaycap = CASE WHEN Ngaycap IS NOT NULL THEN Ngaycap ELSE COALESCE(@Ngaycap, GETDATE()) END, Trangthai=N'Đang sử dụng' WHERE MaNV=@MaNV",
          );
      }
    });

    res.send("Thêm thiết bị thành công");
  } catch (err) {
    if (err?.http) return res.status(err.http).send(err.message);
    handleSqlError(res, err);
  }
});

/* ==============================================
   API SỬA THIẾT BỊ (Đã chỉnh sửa logic)
   ============================================== */
app.put("/api/devices/:id", authenticate, upload, async (req, res) => {
  const { id } = req.params;
  let {
    TenTaiSan,
    LoaiTaiSan,
    SerialSN,
    NgayNhap,
    Trangthai,
    Nguoisudung, // Biến này lấy từ form
    Vitri,
    CauHinh,
    DonViTinh,
    ThoiGianBaoHanh,
    DonGia,
    NamSanXuat,
  } = req.body;

  // Xử lý ảnh
  let HinhAnhThucTe = req.body.HinhAnhThucTe;
  if (req.file) {
    // Sửa thành /public/upload/ để giống với API upload ảnh
    HinhAnhThucTe = `/public/upload/${req.file.filename}`;
  }

  // [LOGIC MỚI - SỬA ĐỔI] -----------------------------------------------------
  // Logic xử lý trạng thái và người dùng sẽ được dời xuống sau khi lấy dữ liệu cũ
  // [LOGIC MỚI]
  // 1. Nếu trạng thái là Sẵn sàng/Bảo hành/Hư hỏng -> Xóa người dùng (về NULL)
  if (["Sẵn sàng", "Bảo Hành", "Hư Hỏng"].includes(Trangthai)) {
    Nguoisudung = null;
  }
  // 2. Nếu không gửi Nguoisudung lên (undefined) -> Gán mặc định là null để tránh lỗi SQL
  else if (Nguoisudung === undefined) {
    Nguoisudung = null;
  }

  const pool = await poolPromise;
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    // 1. Lấy dữ liệu CŨ của thiết bị (để backup hoặc restore)
    const oldDevRes = await transaction
      .request()
      .input("MaTaiSan", sql.VarChar, id)
      .query("SELECT * FROM THIETBI WHERE MaTaiSan = @MaTaiSan");

    const oldDev = oldDevRes.recordset[0] || {};
    let restoreDate = null; // Biến lưu ngày cấp cũ để khôi phục

    // 2. BACKUP: Nếu đang dùng -> chuyển sang trạng thái khác (Bảo hành/Hư hỏng...)
    // Thì lưu lại thông tin người dùng hiện tại và NGÀY CẤP hiện tại vào lịch sử
    if (oldDev.Trangthai === "Đang sử dụng" && Trangthai !== "Đang sử dụng") {
      // Lấy ngày cấp thực tế từ bảng NHANVIEN
      const empRes = await transaction
        .request()
        .input("MaTaiSan", sql.VarChar, id)
        .query(
          "SELECT TOP 1 MaNV, HoVaTen, Ngaycap FROM NHANVIEN WHERE Thietbisudung = @MaTaiSan",
        );

      if (empRes.recordset.length > 0) {
        const emp = empRes.recordset[0];
        // Cập nhật cột Last* trong THIETBI để nhớ
        await transaction
          .request()
          .input("MaTaiSan", sql.VarChar, id)
          .input("LastUserId", sql.VarChar, emp.MaNV)
          .input("LastUserName", sql.NVarChar, emp.HoVaTen)
          .input("LastAssignedDate", sql.Date, emp.Ngaycap) // Lưu ngày cấp cũ
          .query(
            `UPDATE THIETBI SET LastUserId=@LastUserId, LastUserName=@LastUserName, LastAssignedDate=@LastAssignedDate WHERE MaTaiSan=@MaTaiSan`,
          );
      }
    }

    // 3. RESTORE: Logic khôi phục ngày cấp cũ (Quan trọng cho quy trình Bảo hành -> Đang sử dụng)
    if (Trangthai === "Đang sử dụng") {
      // Trường hợp A: Người dùng để trống -> Tự động lấy lại người cũ từ lịch sử
      if (!Nguoisudung) {
        if (oldDev.LastUserName) {
          Nguoisudung = oldDev.LastUserName;
          restoreDate = oldDev.LastAssignedDate;
          console.log(`♻️ Auto-restore: ${Nguoisudung} - Date: ${restoreDate}`);
        } else {
          throw new Error(
            "Không tìm thấy lịch sử người dùng cũ. Vui lòng chọn người sử dụng.",
          );
        }
      }
      // Trường hợp B: Có chọn người (từ Frontend gửi lên) -> Kiểm tra xem có phải người cũ không
      // Nếu đúng là người cũ (so sánh Tên hoặc Mã) -> Lấy lại ngày cấp cũ
      else if (
        oldDev.LastUserName &&
        (Nguoisudung === oldDev.LastUserName ||
          Nguoisudung === oldDev.LastUserId)
      ) {
        restoreDate = oldDev.LastAssignedDate;
        console.log(
          `♻️ Matched old user: ${Nguoisudung} - Restoring date: ${restoreDate}`,
        );
      }
    }

    // Cập nhật bảng THIETBI
    await transaction
      .request()
      .input("MaTaiSan", sql.VarChar, id)
      .input("TenTaiSan", sql.NVarChar, TenTaiSan)
      .input("LoaiTaiSan", sql.NVarChar, LoaiTaiSan)
      .input("SerialSN", sql.VarChar, SerialSN)
      .input("NgayNhap", sql.Date, NgayNhap)
      .input("Trangthai", sql.NVarChar, Trangthai)
      .input("Nguoisudung", sql.NVarChar, Nguoisudung)
      .input("Vitri", sql.NVarChar, Vitri)
      .input("CauHinh", sql.NVarChar(sql.MAX), CauHinh || null)
      .input("DonViTinh", sql.NVarChar(50), DonViTinh || null)
      .input("ThoiGianBaoHanh", sql.NVarChar(50), ThoiGianBaoHanh || null)
      .input("DonGia", sql.NVarChar(50), DonGia || null)
      .input("NamSanXuat", sql.Int, NamSanXuat || null)
      .input("HinhAnhThucTe", sql.NVarChar, HinhAnhThucTe).query(`
          UPDATE THIETBI
          SET TenTaiSan = @TenTaiSan,
              LoaiTaiSan = @LoaiTaiSan,
              SerialSN = @SerialSN,
              NgayNhap = @NgayNhap,
              Trangthai = @Trangthai,
              Nguoisudung = @Nguoisudung,
              Vitri = @Vitri,
              CauHinh = @CauHinh,
              DonViTinh = @DonViTinh,
              ThoiGianBaoHanh = @ThoiGianBaoHanh,
              DonGia = @DonGia,
              NamSanXuat = @NamSanXuat,
              HinhAnhThucTe = @HinhAnhThucTe
          WHERE MaTaiSan = @MaTaiSan
        `);

    // [BẮT ĐẦU ĐOẠN CODE CẦN THÊM/SỬA] ========================================

    // LOGIC ĐỒNG BỘ SANG BẢNG NHÂN VIÊN (Quan trọng)

    // Bước 1: Luôn gỡ thiết bị này khỏi người cũ (để tránh 1 thiết bị 2 chủ)
    // [FIX] Trừ người dùng MỚI ra (nếu đang gán cho họ), để không bị xoá mất ngày cấp cũ của họ
    await transaction
      .request()
      .input("MaTaiSan", sql.VarChar, id)
      .input("NewUser", sql.NVarChar, Nguoisudung || "").query(`
        UPDATE NHANVIEN 
        SET Thietbisudung = NULL, Ngaycap = NULL, Trangthai = N'Chưa cấp'
        WHERE Thietbisudung = @MaTaiSan
          AND (@NewUser = '' OR (HoVaTen <> @NewUser AND MaNV <> @NewUser))
      `);

    // Bước 2: Nếu trạng thái mới là "Đang sử dụng" -> Gán cho người mới & CẬP NHẬT NGÀY CẤP MỚI
    if (Trangthai === "Đang sử dụng" && Nguoisudung) {
      await transaction
        .request()
        .input("TenNV", sql.NVarChar, Nguoisudung) // Nguoisudung lấy từ form (Frontend gửi lên)
        .input("MaTaiSan", sql.VarChar, id)
        .input("RestoreDate", sql.Date, restoreDate) // Truyền ngày khôi phục (nếu có)
        .query(`
          UPDATE NHANVIEN 
          SET Thietbisudung = @MaTaiSan, 
              Ngaycap = CASE WHEN Ngaycap IS NOT NULL THEN Ngaycap ELSE COALESCE(@RestoreDate, GETDATE()) END, -- Chỉ điền ngày nếu DB đang trống
              Trangthai = N'Đang sử dụng'
          WHERE HoVaTen = @TenNV OR MaNV = @TenNV -- Tìm đúng nhân viên để gán
        `);
    }
    // [KẾT THÚC ĐOẠN CODE CẦN THÊM/SỬA] =======================================
    await transaction.commit();
    res.json({ message: "Cập nhật thành công", success: true });
  } catch (err) {
    if (transaction._aborted === false) {
      await transaction.rollback();
    }
    console.error("Lỗi khi cập nhật:", err);
    handleSqlError(res, err);
  }
});
/* ==============================================
   KẾT THÚC ĐOẠN CODE MỚI
   ============================================== */

// Xóa thiết bị
app.delete(
  "/api/devices/:id",
  authenticate,
  authorizeAdmin,
  async (req, res) => {
    try {
      await runTx(async (tx) => {
        // 1. Gỡ thiết bị khỏi nhân viên đang sử dụng
        await new sql.Request(tx)
          .input("DevId", sql.VarChar, req.params.id)
          .query(
            "UPDATE dbo.NHANVIEN SET Thietbisudung=NULL, Ngaycap=NULL, Trangthai=N'Chưa cấp' WHERE Thietbisudung=@DevId",
          );

        // 2. Xóa dữ liệu KIỂM KÊ CHUẨN BỊ TRƯỚC (Dọn dẹp khóa ngoại)
        await new sql.Request(tx)
          .input("MaTaiSan", sql.VarChar, req.params.id)
          .query("DELETE FROM dbo.KIEMKECHITIET WHERE MaTaiSan=@MaTaiSan");

        // 3. Xóa dữ liệu MUA HÀNG LIÊN QUAN (Dọn dẹp khóa ngoại)
        await new sql.Request(tx)
          .input("MaTaiSan", sql.VarChar, req.params.id)
          .query("DELETE FROM dbo.Purchase WHERE MaTaiSan=@MaTaiSan");

        // 4. Cuối cùng mới xóa thiết bị trong bảng gốc THIETBI
        await new sql.Request(tx)
          .input("MaTaiSan", sql.VarChar, req.params.id)
          .query("DELETE FROM dbo.THIETBI WHERE MaTaiSan=@MaTaiSan");
      });

      res.send("Xóa thiết bị thành công");
    } catch (err) {
      handleSqlError(res, err);
    }
  },
);

/* ========== API /api/users ========== */

// Lấy danh sách nhân viên
app.get("/api/users", authenticate, async (_req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM dbo.NHANVIEN");
    res.json(result.recordset);
  } catch (err) {
    handleSqlError(res, err);
  }
});

// Gán / bỏ gán thiết bị cho người dùng
app.post("/api/assign", authenticate, async (req, res) => {
  const { MaNV, MaTaiSan, Ngaycap } = req.body || {};
  if (!MaNV) return res.status(400).send("Thiếu MaNV");

  try {
    await runTx(async (tx) => {
      const uRes = await new sql.Request(tx)
        .input("MaNV", sql.VarChar, MaNV)
        .query("SELECT TOP 1 * FROM dbo.NHANVIEN WHERE MaNV=@MaNV");
      if (!uRes.recordset.length) {
        throw Object.assign(new Error("Không tìm thấy nhân viên"), {
          http: 404,
        });
      }
      const user = uRes.recordset[0];

      if (!MaTaiSan) {
        if (user.Thietbisudung) {
          await new sql.Request(tx)
            .input("DevId", sql.VarChar, user.Thietbisudung)
            .query(
              "UPDATE dbo.THIETBI SET Trangthai=N'Sẵn sàng', Nguoisudung=NULL WHERE MaTaiSan=@DevId",
            );
        }
        await new sql.Request(tx)
          .input("MaNV", sql.VarChar, MaNV)
          .query(
            "UPDATE dbo.NHANVIEN SET Thietbisudung=NULL, Ngaycap=NULL, Trangthai=N'Chưa cấp' WHERE MaNV=@MaNV",
          );
        return;
      }

      const dRes = await new sql.Request(tx)
        .input("MaTaiSan", sql.VarChar, MaTaiSan)
        .query("SELECT TOP 1 * FROM dbo.THIETBI WHERE MaTaiSan=@MaTaiSan");
      if (!dRes.recordset.length) {
        throw Object.assign(new Error("Không tìm thấy thiết bị"), {
          http: 404,
        });
      }
      const dev = dRes.recordset[0];

      if (dev.Trangthai === "Bảo Hành" || dev.Trangthai === "Hư Hỏng") {
        throw Object.assign(
          new Error("Thiết bị không sẵn sàng (Bảo Hành/Hư Hỏng)"),
          { http: 409 },
        );
      }
      if (
        dev.Trangthai === "Đang sử dụng" &&
        dev.Nguoisudung &&
        dev.Nguoisudung !== user.HoVaTen
      ) {
        throw Object.assign(new Error("Thiết bị đang được sử dụng"), {
          http: 409,
        });
      }

      if (user.Thietbisudung && user.Thietbisudung !== MaTaiSan) {
        await new sql.Request(tx)
          .input("PrevDev", sql.VarChar, user.Thietbisudung)
          .query(
            "UPDATE dbo.THIETBI SET Trangthai=N'Sẵn sàng', Nguoisudung=NULL WHERE MaTaiSan=@PrevDev",
          );
      }

      await new sql.Request(tx)
        .input("MaNV", sql.VarChar, MaNV)
        .input("MaTaiSan", sql.VarChar, MaTaiSan)
        .input("Ngaycap", sql.Date, Ngaycap || null)
        .query(
          "UPDATE dbo.NHANVIEN SET Thietbisudung=@MaTaiSan, Ngaycap = CASE WHEN Ngaycap IS NOT NULL THEN Ngaycap ELSE COALESCE(@Ngaycap, GETDATE()) END, Trangthai=N'Đang sử dụng' WHERE MaNV=@MaNV",
        );

      await new sql.Request(tx)
        .input("MaTaiSan", sql.VarChar, MaTaiSan)
        .input("Nguoisudung", sql.NVarChar, user.HoVaTen)
        .input("MaNV", sql.VarChar, MaNV)
        .query(
          "UPDATE dbo.THIETBI SET Trangthai=N'Đang sử dụng', Nguoisudung=@Nguoisudung, LastUserName=@Nguoisudung, LastUserId=@MaNV WHERE MaTaiSan=@MaTaiSan",
        );
    });

    res.send("Gán thiết bị thành công");
  } catch (err) {
    if (err?.http) return res.status(err.http).send(err.message);
    handleSqlError(res, err);
  }
});

// Thêm nhân viên
app.post("/api/users", authenticate, async (req, res) => {
  const { MaNV, HoVaTen, Phongban, Thietbisudung, Ngaycap, Trangthai } =
    req.body || {};

  if (!MaNV || !HoVaTen) {
    return res.status(400).send("Thiếu mã hoặc họ tên nhân viên");
  }

  try {
    await runTx(async (tx) => {
      // Kiểm tra trùng mã NV
      const exists = await new sql.Request(tx)
        .input("MaNV", sql.VarChar, MaNV)
        .query("SELECT 1 FROM dbo.NHANVIEN WHERE MaNV=@MaNV");
      if (exists.recordset.length) {
        throw Object.assign(new Error("Mã nhân viên đã tồn tại."), {
          http: 409,
        });
      }

      await new sql.Request(tx)
        .input("MaNV", sql.VarChar, MaNV)
        .input("HoVaTen", sql.NVarChar, HoVaTen)
        .input("Phongban", sql.NVarChar, Phongban || "")
        .input("Thietbisudung", sql.VarChar, Thietbisudung || null)
        .input("Ngaycap", sql.Date, Ngaycap || null)
        .input(
          "Trangthai",
          sql.NVarChar,
          Trangthai || (Thietbisudung ? "Đang sử dụng" : "Chưa cấp"),
        )
        .query(
          `INSERT INTO dbo.NHANVIEN
          (MaNV, HoVaTen, Phongban, Thietbisudung, Ngaycap, Trangthai)
          VALUES (@MaNV, @HoVaTen, @Phongban, @Thietbisudung, @Ngaycap, @Trangthai)`,
        );

      if (Thietbisudung) {
        const dRes = await new sql.Request(tx)
          .input("MaTaiSan", sql.VarChar, Thietbisudung)
          .query("SELECT TOP 1 * FROM dbo.THIETBI WHERE MaTaiSan=@MaTaiSan");
        if (!dRes.recordset.length) {
          throw Object.assign(new Error("Không tìm thấy thiết bị"), {
            http: 404,
          });
        }
        const dev = dRes.recordset[0];
        if (dev.Trangthai === "Bảo Hành" || dev.Trangthai === "Hư Hỏng") {
          throw Object.assign(
            new Error("Thiết bị không sẵn sàng (Bảo Hành/Hư Hỏng)"),
            { http: 409 },
          );
        }
        if (
          dev.Trangthai === "Đang sử dụng" &&
          dev.Nguoisudung &&
          dev.Nguoisudung !== HoVaTen
        ) {
          throw Object.assign(new Error("Thiết bị đang được sử dụng"), {
            http: 409,
          });
        }
        await new sql.Request(tx)
          .input("MaTaiSan", sql.VarChar, Thietbisudung)
          .input("Nguoisudung", sql.NVarChar, HoVaTen)
          .input("MaNV", sql.VarChar, MaNV)
          .query(
            "UPDATE dbo.THIETBI SET Trangthai=N'Đang sử dụng', Nguoisudung=@Nguoisudung, LastUserName=@Nguoisudung, LastUserId=@MaNV WHERE MaTaiSan=@MaTaiSan",
          );
      }
    });

    res.send("Thêm nhân viên thành công");
  } catch (err) {
    if (err?.http) return res.status(err.http).send(err.message);
    handleSqlError(res, err);
  }
});

// Sửa nhân viên
app.put("/api/users/:id", authenticate, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const {
    HoVaTen,
    Phongban,
    Thietbisudung,
    Ngaycap,
    MaNV: NewMaNV,
  } = req.body || {};

  try {
    await runTx(async (tx) => {
      // 1. Kiểm tra nhân viên tồn tại
      const uRes = await new sql.Request(tx)
        .input("MaNV", sql.VarChar, id)
        .query("SELECT TOP 1 * FROM dbo.NHANVIEN WHERE MaNV=@MaNV");
      if (!uRes.recordset.length) {
        throw Object.assign(new Error("Không tìm thấy nhân viên"), {
          http: 404,
        });
      }
      const curr = uRes.recordset[0];

      // 2. Xử lý đổi mã nhân viên (nếu có)
      let targetId = id;
      if (NewMaNV && NewMaNV !== id) {
        const existsNew = await new sql.Request(tx)
          .input("NewMaNV", sql.VarChar, NewMaNV)
          .query("SELECT 1 FROM dbo.NHANVIEN WHERE MaNV=@NewMaNV");
        if (existsNew.recordset.length) {
          throw Object.assign(new Error("Mã nhân viên đã tồn tại."), {
            http: 409,
          });
        }
        await new sql.Request(tx)
          .input("OldMaNV", sql.VarChar, id)
          .input("NewMaNV", sql.VarChar, NewMaNV)
          .query("UPDATE dbo.NHANVIEN SET MaNV=@NewMaNV WHERE MaNV=@OldMaNV");
        targetId = NewMaNV;
      }

      // 3. Cập nhật thông tin cơ bản
      await new sql.Request(tx)
        .input("MaNV", sql.VarChar, targetId)
        .input("HoVaTen", sql.NVarChar, HoVaTen ?? curr.HoVaTen ?? "")
        .input("Phongban", sql.NVarChar, Phongban ?? curr.Phongban ?? "")
        .query(
          `UPDATE dbo.NHANVIEN SET HoVaTen=@HoVaTen, Phongban=@Phongban WHERE MaNV=@MaNV`,
        );

      const newName = HoVaTen ?? curr.HoVaTen;

      // 4. Xử lý thiết bị và ngày cấp
      if (typeof Thietbisudung !== "undefined") {
        const newDevId = Thietbisudung || null;
        const prevDevId = curr.Thietbisudung || null;

        if (!newDevId) {
          // --- TRƯỜNG HỢP: GỠ THIẾT BỊ ---
          if (prevDevId) {
            await new sql.Request(tx)
              .input("PrevDev", sql.VarChar, prevDevId)
              .query(
                "UPDATE dbo.THIETBI SET Trangthai=N'Sẵn sàng', Nguoisudung=NULL WHERE MaTaiSan=@PrevDev",
              );
          }
          // Cập nhật nhân viên với thiết bị mới
          await new sql.Request(tx).input("MaNV", sql.VarChar, targetId).query(
            `UPDATE dbo.NHANVIEN 
               SET Thietbisudung = NULL, 
                   Ngaycap = NULL, 
                   Trangthai = N'Chưa cấp' 
               WHERE MaNV = @MaNV`,
          );
        } else {
          // --- TRƯỜNG HỢP: GÁN THIẾT BỊ MỚI (Trọng tâm câu hỏi của bạn) ---

          // Kiểm tra thiết bị mới
          const dRes = await new sql.Request(tx)
            .input("MaTaiSan", sql.VarChar, newDevId)
            .query(
              "SELECT TOP 1 * FROM dbo.THIETBI WHERE MaTaiSan=@MaTaiSan",
            );
          if (!dRes.recordset.length) {
            throw Object.assign(new Error("Không tìm thấy thiết bị"), {
              http: 404,
            });
          }
          const dev = dRes.recordset[0];

          if (dev.Trangthai === "Bảo Hành" || dev.Trangthai === "Hư Hỏng") {
            throw Object.assign(
              new Error("Thiết bị không sẵn sàng (Bảo Hành/Hư Hỏng)"),
              { http: 409 },
            );
          }

          // Giải phóng thiết bị cũ (nếu có và khác thiết bị mới)
          if (prevDevId && prevDevId !== newDevId) {
            await new sql.Request(tx)
              .input("PrevDev", sql.VarChar, prevDevId)
              .query(
                "UPDATE dbo.THIETBI SET Trangthai=N'Sẵn sàng', Nguoisudung=NULL WHERE MaTaiSan=@PrevDev",
              );
          }

          // Cập nhật nhân viên với thiết bị mới
          await new sql.Request(tx)
            .input("MaNV", sql.VarChar, targetId)
            .input("MaTaiSan", sql.VarChar, newDevId)
            .input("Ngaycap", sql.Date, Ngaycap || null)
            .query(
              `UPDATE dbo.NHANVIEN 
               SET Thietbisudung=@MaTaiSan, 
                   -- [FIX] Nếu đã có ngày cấp (từ Excel) thì giữ nguyên, chưa có mới lấy ngày mới
                   Ngaycap = CASE WHEN Ngaycap IS NOT NULL THEN Ngaycap ELSE COALESCE(@Ngaycap, GETDATE()) END, 
                   Trangthai=N'Đang sử dụng' 
               WHERE MaNV=@MaNV`,
            );

          // Cập nhật trạng thái thiết bị
          await new sql.Request(tx)
            .input("MaTaiSan", sql.VarChar, newDevId)
            .input("Nguoisudung", sql.NVarChar, newName)
            .input("MaNV", sql.VarChar, targetId)
            .query(
              "UPDATE dbo.THIETBI SET Trangthai=N'Đang sử dụng', Nguoisudung=@Nguoisudung, LastUserName=@Nguoisudung, LastUserId=@MaNV WHERE MaTaiSan=@MaTaiSan",
            );
        }
      } else {
        // Chỉ cập nhật thông tin khác, không đổi thiết bị
        if (typeof Ngaycap !== "undefined") {
          await new sql.Request(tx)
            .input("MaNV", sql.VarChar, targetId)
            .input("Ngaycap", sql.Date, Ngaycap || null)
            .query("UPDATE dbo.NHANVIEN SET Ngaycap=@Ngaycap WHERE MaNV=@MaNV");
        }
        // Cập nhật tên người dùng trên thiết bị nếu đổi tên nhân viên
        if (curr.Thietbisudung && newName && newName !== curr.HoVaTen) {
          await new sql.Request(tx)
            .input("MaTaiSan", sql.VarChar, curr.Thietbisudung)
            .input("Nguoisudung", sql.NVarChar, newName)
            .query(
              "UPDATE dbo.THIETBI SET Nguoisudung=@Nguoisudung WHERE MaTaiSan=@MaTaiSan",
            );
        }
      }
    });

    res.send("Cập nhật nhân viên thành công");
  } catch (err) {
    if (err?.http) return res.status(err.http).send(err.message);
    handleSqlError(res, err);
  }
});

// Xóa nhân viên
app.delete("/api/users/:id", authenticate, authorizeAdmin, async (req, res) => {
  try {
    await runTx(async (tx) => {
      const uRes = await new sql.Request(tx)
        .input("MaNV", sql.VarChar, req.params.id)
        .query("SELECT TOP 1 * FROM dbo.NHANVIEN WHERE MaNV=@MaNV");
      if (uRes.recordset.length) {
        const u = uRes.recordset[0];
        if (u.Thietbisudung) {
          await new sql.Request(tx)
            .input("DevId", sql.VarChar, u.Thietbisudung)
            .query(
              "UPDATE dbo.THIETBI SET Trangthai=N'Sẵn sàng', Nguoisudung=NULL WHERE MaTaiSan=@DevId",
            );
        }
      }

      await new sql.Request(tx)
        .input("MaNV", sql.VarChar, req.params.id)
        .query("DELETE FROM dbo.NHANVIEN WHERE MaNV=@MaNV");
    });

    res.send("Xóa nhân viên thành công");
  } catch (err) {
    handleSqlError(res, err);
  }
});
app.post(
  "/api/users/import",
  authenticate,
  authorizeAdmin,
  async (req, res) => {
    const items = req.body || [];
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).send("Không có dữ liệu");

    const skipErrors = req.query.skipErrors === "true";

    try {
      const pool = await poolPromise;
      const errors = [];
      const validItems = [];
      
      const usedDevices = new Set();
      const usedUsers = new Set();

      for (const [index, u] of items.entries()) {
        const rowNum = index + 1; // Dòng dữ liệu trong mảng (tương đối)
        try {
            if (!u.MaNV || !u.HoVaTen) throw new Error("Thiếu mã hoặc họ tên nhân viên.");
            
            // 1. Kiểm tra trùng mã NV trong nội bộ file Excel
            if (usedUsers.has(u.MaNV)) {
                throw new Error(`Mã nhân viên '${u.MaNV}' bị trùng lặp bên trong file Excel.`);
            }
            usedUsers.add(u.MaNV);

            // 2. Kiểm tra mã NV trên database
            const exists = await pool.request()
              .input("MaNV", sql.VarChar, u.MaNV)
              .query("SELECT 1 FROM dbo.NHANVIEN WHERE MaNV=@MaNV");
            if (exists.recordset.length) {
              throw new Error(`Mã nhân viên '${u.MaNV}' đã tồn tại trên hệ thống.`);
            }

            // 3. Kiểm tra Mã tài sản (Thietbisudung)
            if (u.Thietbisudung) {
                if (usedDevices.has(u.Thietbisudung)) {
                    throw new Error(`Mã tài sản '${u.Thietbisudung}' bị phân công cho nhiều người trong cùng file Excel.`);
                }
                usedDevices.add(u.Thietbisudung);

                const dRes = await pool.request()
                  .input("MaTaiSan", sql.VarChar, u.Thietbisudung)
                  .query("SELECT TOP 1 * FROM dbo.THIETBI WHERE MaTaiSan=@MaTaiSan");
                if (!dRes.recordset.length) {
                  throw new Error(`Mã tài sản '${u.Thietbisudung}' không tồn tại trên hệ thống.`);
                }
                const dev = dRes.recordset[0];
                if (dev.Trangthai === "Bảo Hành" || dev.Trangthai === "Hư Hỏng") {
                  throw new Error(`Mã tài sản '${u.Thietbisudung}' đang bảo hành/hư hỏng.`);
                }
                if (dev.Trangthai === "Đang sử dụng" && dev.Nguoisudung && dev.Nguoisudung !== u.HoVaTen) {
                  throw new Error(`Mã tài sản '${u.Thietbisudung}' đã được cấp cho người khác.`);
                }
            }

            validItems.push(u);
        } catch (err) {
            errors.push(`Dòng ${rowNum}: ${err.message}`);
        }
      }

      if (!skipErrors && errors.length > 0) {
          // Trả về danh sách lỗi để hiển thị lên frontend
          return res.status(200).json({ requiresConfirmation: true, errors });
      }

      if (validItems.length === 0) {
          return res.status(400).send("Không có dòng dữ liệu nào hợp lệ để nhập.");
      }

      // THỰC HIỆN INSERT CHO CÁC DÒNG HỢP LỆ TRONG 1 TRANSACTION
      await runTx(async (tx) => {
          for (const u of validItems) {
            let parsedDate = null;
            if (u.Ngaycap) {
              const d = new Date(u.Ngaycap);
              if (!isNaN(d) && d >= new Date("1753-01-01")) parsedDate = d;
            }
            
            const trangthai = u.Trangthai || (u.Thietbisudung ? "Đang sử dụng" : "Chưa cấp");

            await new sql.Request(tx)
              .input("MaNV", sql.VarChar(50), u.MaNV)
              .input("HoVaTen", sql.NVarChar(100), u.HoVaTen)
              .input("Phongban", sql.NVarChar(100), u.Phongban || "")
              .input("Thietbisudung", sql.VarChar, u.Thietbisudung || null)
              .input("Ngaycap", sql.Date, parsedDate)
              .input("Trangthai", sql.NVarChar(50), trangthai)
              .query(`
                INSERT INTO dbo.NHANVIEN (MaNV, HoVaTen, Phongban, Thietbisudung, Trangthai, Ngaycap)
                VALUES (@MaNV, @HoVaTen, @Phongban, @Thietbisudung, @Trangthai, @Ngaycap)
              `);

            if (u.Thietbisudung) {
                await new sql.Request(tx)
                  .input("MaTaiSan", sql.VarChar, u.Thietbisudung)
                  .input("Nguoisudung", sql.NVarChar, u.HoVaTen)
                  .input("MaNV", sql.VarChar, u.MaNV)
                  .query(`
                    UPDATE dbo.THIETBI 
                    SET Trangthai=N'Đang sử dụng', Nguoisudung=@Nguoisudung, LastUserName=@Nguoisudung, LastUserId=@MaNV 
                    WHERE MaTaiSan=@MaTaiSan
                  `);
            }
          }
      });

      res.status(201).json({ success: true, message: `Đã nhập thành công ${validItems.length} người sử dụng.` });
    } catch (err) {
      handleSqlError(res, err);
    }
  },
);

/* ========== PUBLIC API CHO QR ========== */

// Lấy thông tin thiết bị (cho display.html)
app.get("/public/devices/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const r = await pool
      .request()
      .input("MaTaiSan", sql.VarChar, req.params.id).query(`
        SELECT TOP 1
          t.*,
          COALESCE(t.HinhAnhThucTe, kk.HinhAnhThucTe) as HinhAnhHienThi
        FROM dbo.THIETBI t
        LEFT JOIN (
          SELECT
            MaTaiSan, HinhAnhThucTe,
            ROW_NUMBER() OVER(PARTITION BY MaTaiSan ORDER BY DotID DESC, ThoiGianQuet DESC) as rn
          FROM dbo.KIEMKECHITIET WHERE HinhAnhThucTe IS NOT NULL
        ) kk ON t.MaTaiSan = kk.MaTaiSan AND kk.rn = 1
        WHERE t.MaTaiSan = @MaTaiSan
      `);
    if (!r.recordset.length) return res.status(404).send("Không tìm thấy");
    res.json(r.recordset[0]);
  } catch (err) {
    handleSqlError(res, err);
  }
});

// PUBLIC API cho QR – ghi nhận kiểm kê
app.post("/public/kiemke", async (req, res) => {
  console.log("📥 /public/kiemke body:", req.body);

  const {
    DotID,
    MaTaiSan,
    TrangThaiThucTe,
    ViTriThucTe,
    NhanVienKiemKe,
    GhiChu,
  } = req.body || {};

  if (!MaTaiSan) {
    return res.status(400).send("Thiếu MaTaiSan");
  }

  try {
    await runTx(async (tx) => {
      // 0. Chuẩn hóa DotID client gửi lên (lưu vào Dotkiemke)
      let dotParam = parseInt(DotID, 10);
      if (!dotParam || dotParam < 1) dotParam = 1;

      // 1. Kiểm tra thiết bị có tồn tại không
      const devRes = await new sql.Request(tx)
        .input("MaTaiSan", sql.VarChar, MaTaiSan)
        .query(
          "SELECT TOP 1 MaTaiSan FROM dbo.THIETBI WHERE MaTaiSan=@MaTaiSan",
        );
      if (!devRes.recordset.length) {
        throw Object.assign(new Error("Không tìm thấy thiết bị"), {
          http: 404,
        });
      }

      // 2. Upsert thẳng vào Kiemketaisan (mỗi Dotkiemke + MaTaiSan chỉ 1 dòng)
      const checkRes = await new sql.Request(tx)
        .input("Dotkiemke", sql.Int, dotParam)
        .input("MaTaiSan", sql.VarChar, MaTaiSan)
        .input("NhanVienKiemKe", sql.NVarChar, NhanVienKiemKe || null)
        .query(
          "SELECT ID FROM dbo.Kiemketaisan WHERE Dotkiemke=@Dotkiemke AND MaTaiSan=@MaTaiSan AND ISNULL(NhanVienKiemKe,'')=ISNULL(@NhanVienKiemKe,'')",
        );

      if (checkRes.recordset.length) {
        // UPDATE
        await new sql.Request(tx)
          .input("ID", sql.Int, checkRes.recordset[0].ID)
          .input("TrangThaiThucTe", sql.NVarChar, TrangThaiThucTe || null)
          .input("ViTriThucTe", sql.NVarChar, ViTriThucTe || null)
          .input("NhanVienKiemKe", sql.NVarChar, NhanVienKiemKe || null)
          .input("GhiChu", sql.NVarChar, GhiChu || null)
          .query(
            `UPDATE dbo.Kiemketaisan
             SET TrangThaiThucTe = @TrangThaiThucTe,
                 ViTriThucTe     = @ViTriThucTe,
                 NhanVienKiemKe  = @NhanVienKiemKe,
                 ThoiGianQuet    = GETDATE(),
                 Ghichu          = @GhiChu
             WHERE ID=@ID`,
          );
      } else {
        // INSERT
        await new sql.Request(tx)
          .input("Dotkiemke", sql.Int, dotParam)
          .input("MaTaiSan", sql.VarChar, MaTaiSan)
          .input("TrangThaiThucTe", sql.NVarChar, TrangThaiThucTe || null)
          .input("ViTriThucTe", sql.NVarChar, ViTriThucTe || null)
          .input("NhanVienKiemKe", sql.NVarChar, NhanVienKiemKe || null)
          .input("GhiChu", sql.NVarChar, GhiChu || null)
          .query(
            `INSERT INTO dbo.Kiemketaisan
             (Dotkiemke, MaTaiSan, TrangThaiThucTe, ViTriThucTe, NhanVienKiemKe, Ghichu)
             VALUES (@Dotkiemke, @MaTaiSan, @TrangThaiThucTe, @ViTriThucTe, @NhanVienKiemKe, @GhiChu)`,
          );
      }
    });

    res.send("Đã ghi nhận kiểm kê");
  } catch (err) {
    console.error("❌ Lỗi máy chủ:", err);
    if (err.originalError?.info?.message) {
      console.error("🔍 Chi tiết SQL:", err.originalError.info.message);
    }
    handleSqlError(res, err);
  }
});

// PUBLIC API cho QR – ghi nhận kiểm kê nhiều thiết bị (bulk)
app.post("/public/kiemke-bulk", async (req, res) => {
  console.log("📥 /public/kiemke-bulk body:", req.body);

  const { DotID, items } = req.body || {};
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).send("Thiếu danh sách items");
  }

  try {
    await runTx(async (tx) => {
      // Chuẩn hoá DotID chung cho cả batch
      let dotParam = parseInt(DotID, 10);
      if (!dotParam || dotParam < 1) dotParam = 1;

      // TẠO CÁC BIẾN ĐẾM TRẠNG THÁI
      let processedCount = 0;
      let skippedCount = 0;
      let skippedDetails = [];

      // Duyệt từng item trong mảng
      for (const it of items) {
        const {
          MaTaiSan,
          TrangThaiThucTe,
          ViTriThucTe,
          NhanVienKiemKe,
          GhiChu,
        } = it || {};
        if (!MaTaiSan) continue; // bỏ qua nếu thiếu mã

        // Kiểm tra thiết bị tồn tại
        const devRes = await new sql.Request(tx)
          .input("MaTaiSan", sql.VarChar, MaTaiSan)
          .query(
            "SELECT TOP 1 MaTaiSan FROM dbo.THIETBI WHERE MaTaiSan=@MaTaiSan",
          );
        if (!devRes.recordset.length) {
          console.warn("⚠️ Thiết bị không tồn tại, bỏ qua:", MaTaiSan);
          // NẾU KHÔNG TỒN TẠI, CỘNG VÀO BIẾN BỎ QUA VÀ GHI LOG
          skippedCount++;
          skippedDetails.push({
            MaTaiSan,
            reason: "Thiết bị chưa được tạo trong CSDL",
          });
          continue;
        }

        // Upsert vào Kiemketaisan
        const checkRes = await new sql.Request(tx)
          .input("Dotkiemke", sql.Int, dotParam)
          .input("MaTaiSan", sql.VarChar, MaTaiSan)
          .input("NhanVienKiemKe", sql.NVarChar, NhanVienKiemKe || null)
          .query(
            "SELECT ID FROM dbo.Kiemketaisan WHERE Dotkiemke=@Dotkiemke AND MaTaiSan=@MaTaiSan AND ISNULL(NhanVienKiemKe,'')=ISNULL(@NhanVienKiemKe,'')",
          );

        if (checkRes.recordset.length) {
          await new sql.Request(tx)
            .input("ID", sql.Int, checkRes.recordset[0].ID)
            .input("TrangThaiThucTe", sql.NVarChar, TrangThaiThucTe || null)
            .input("ViTriThucTe", sql.NVarChar, ViTriThucTe || null)
            .input("NhanVienKiemKe", sql.NVarChar, NhanVienKiemKe || null)
            .input("GhiChu", sql.NVarChar, GhiChu || null).query(`
              UPDATE dbo.Kiemketaisan
              SET TrangThaiThucTe = @TrangThaiThucTe,
                  ViTriThucTe     = @ViTriThucTe,
                  NhanVienKiemKe  = @NhanVienKiemKe,
                  ThoiGianQuet    = GETDATE(),
                  Ghichu          = @GhiChu
              WHERE ID=@ID
            `);
        } else {
          await new sql.Request(tx)
            .input("Dotkiemke", sql.Int, dotParam)
            .input("MaTaiSan", sql.VarChar, MaTaiSan)
            .input("TrangThaiThucTe", sql.NVarChar, TrangThaiThucTe || null)
            .input("ViTriThucTe", sql.NVarChar, ViTriThucTe || null)
            .input("NhanVienKiemKe", sql.NVarChar, NhanVienKiemKe || null)
            .input("GhiChu", sql.NVarChar, GhiChu || null).query(`
              INSERT INTO dbo.Kiemketaisan
              (Dotkiemke, MaTaiSan, TrangThaiThucTe, ViTriThucTe, NhanVienKiemKe, Ghichu)
              VALUES (@Dotkiemke, @MaTaiSan, @TrangThaiThucTe, @ViTriThucTe, @NhanVienKiemKe, @GhiChu)
            `);
        }

        // CỘNG VÀO BIẾN LƯU THÀNH CÔNG
        processedCount++;
      }

      // ÉP TRẢ VỀ JSON THAY VÌ TEXT
      res.json({
        success: true,
        message: "Đã xử lý danh sách kiểm kê",
        processed: processedCount,
        skipped: skippedCount,
        skippedDetails: skippedDetails,
      });

      // Xóa hoặc comment lại dòng lệnh cũ:
      // res.send("Đã ghi nhận kiểm kê (bulk)");
    });
  } catch (err) {
    console.error("❌ Lỗi máy chủ (bulk):", err);
    handleSqlError(res, err);
  }
});

// PUBLIC API: Lấy danh sách nhân viên (MaNV, HoVaTen) cho dropdown kiểm kê
app.get("/public/kiemke-users", async (_req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool
      .request()
      .query("SELECT MaNV, HoVaTen FROM dbo.NHANVIEN ORDER BY HoVaTen");
    res.json(result.recordset);
  } catch (err) {
    handleSqlError(res, err);
  }
});
