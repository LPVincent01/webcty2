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
  server: process.env.DB_SERVER || "LAPTOP-M8N7CHUK",
  database: process.env.DB_NAME || "QuanLyThietBi",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

/* ============== MIDDLEWARE CHUNG ============== */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS: cho phép origin từ localhost và IP LAN
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://192.168.11.205:3000",
  "http://192.168.11.205:5500",
  // IP WAN Viettel
  "http://115.79.138.139:3000",
  "http://115.79.138.139:5500", // nếu front-end chạy port 5500
  "http://172.30.90.29:3000",
  "http://172.30.90.29:5500",
];

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS: " + origin));
    },
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

// [BẮT ĐẦU ĐOẠN SỬA]
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
      const bcrypt = require("bcryptjs");
      const salt = await bcrypt.genSalt(10);
      passwordToSave = await bcrypt.hash(password, salt);
    } catch (e) {
      console.warn("Chưa cài bcryptjs, lưu mật khẩu dạng thô.");
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
// [KẾT THÚC ĐOẠN SỬA]

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

/* --- BẮT ĐẦU ĐOẠN CODE API QUẢN LÝ TÀI KHOẢN (THÊM VÀO ĐÂY) --- */

// 1. Lấy danh sách tài khoản
app.get("/api/accounts", authenticate, authorizeAdmin, async (req, res) => {
  try {
    const pool = await poolPromise;
    // Lấy tất cả trừ password hash
    const result = await pool
      .request()
      .query(
        "SELECT Username, Role, DisplayName, CreatedAt FROM dbo.TAIKHOAN ORDER BY CreatedAt DESC",
      );
    res.json(result.recordset);
  } catch (err) {
    handleSqlError(res, err);
  }
});

// 2. Tạo tài khoản mới (Có mã hóa mật khẩu)
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

    // Mã hóa mật khẩu (nếu đã cài bcryptjs, nếu chưa thì lưu thô tạm thời)
    let passwordToSave = password;
    try {
      const bcrypt = require("bcryptjs"); // Đảm bảo bạn đã chạy: npm install bcryptjs
      const salt = await bcrypt.genSalt(10);
      passwordToSave = await bcrypt.hash(password, salt);
    } catch (e) {
      console.warn("Chưa cài bcryptjs, lưu mật khẩu dạng thô.");
    }

    await pool
      .request()
      .input("Username", sql.VarChar, username)
      .input("PasswordHash", sql.VarChar, passwordToSave)
      .input("Role", sql.VarChar, role || "user") // Lưu quyền hạn (admin/user)
      .input("DisplayName", sql.NVarChar, displayName || username).query(`
        INSERT INTO dbo.TAIKHOAN (Username, PasswordHash, Role, DisplayName)
        VALUES (@Username, @PasswordHash, @Role, @DisplayName)
      `);

    res.status(201).send("Tạo tài khoản thành công");
  } catch (err) {
    handleSqlError(res, err);
  }
});

// 3. Xóa tài khoản
app.delete(
  "/api/accounts/:username",
  authenticate,
  authorizeAdmin,
  async (req, res) => {
    const targetUser = req.params.username;

    // Bảo vệ tài khoản admin gốc
    if (targetUser === "admin") {
      return res.status(400).send("Không thể xóa tài khoản Super Admin này!");
    }

    try {
      const pool = await poolPromise;
      await pool
        .request()
        .input("Username", sql.VarChar, targetUser)
        .query("DELETE FROM dbo.TAIKHOAN WHERE Username = @Username");
      res.send("Xóa tài khoản thành công");
    } catch (err) {
      handleSqlError(res, err);
    }
  },
);

/* --- KẾT THÚC ĐOẠN CODE API QUẢN LÝ TÀI KHOẢN --- */

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
  .then(async (pool) => {
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
        console.warn(
          "⚠️ Không thể tạo unique index SerialSN:",
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
      `,
      )
      .then(() => console.log("✅ THIETBI.Last* columns ready"))
      .catch((e) =>
        console.warn("⚠️ Ensure Last* columns lỗi:", e?.message || e),
      );

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
            TenDot NVARCHAR(100) NOT NULL,
            NgayBatDau DATE NULL,
            NgayKetThuc DATE NULL,
            GhiChu NVARCHAR(255) NULL
          );
        END;

        -- Tạo 1 đợt kiểm kê mặc định nếu bảng rỗng
        IF NOT EXISTS (SELECT 1 FROM dbo.DOTKIEMKE)
        BEGIN
          INSERT INTO dbo.DOTKIEMKE (TenDot, NgayBatDau, GhiChu)
          VALUES (N'Kiểm kê mặc định', CONVERT(date, GETDATE()), N'Tạo tự động bởi backend');
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
            MaThietBi VARCHAR(50) NOT NULL,
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
            ADD CONSTRAINT FK_KIEMKE_THIETBI FOREIGN KEY (MaThietBi)
              REFERENCES dbo.THIETBI(MaThietBi);

          -- Mỗi thiết bị chỉ có 1 dòng / 1 đợt
          CREATE UNIQUE INDEX UX_KIEMKE_Dot_ThietBi
            ON dbo.KIEMKECHITIET(DotID, MaThietBi);
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
    } catch (_) {}
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
        kk.HinhAnhThucTe
      FROM dbo.THIETBI t
      LEFT JOIN (
        SELECT
          MaThietBi, HinhAnhThucTe,
          ROW_NUMBER() OVER(PARTITION BY MaThietBi ORDER BY DotID DESC, ThoiGianQuet DESC) as rn
        FROM dbo.KIEMKECHITIET
        WHERE HinhAnhThucTe IS NOT NULL
      ) kk ON t.MaThietBi = kk.MaThietBi AND kk.rn = 1
      ORDER BY t.MaThietBi
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
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).send("Không có dữ liệu");

    try {
      const pool = await poolPromise;
      const insertPromises = items.map((d) => {
        const req = pool.request();
        req.input("MaThietBi", sql.VarChar(50), d.MaThietBi);
        req.input("TenThietBi", sql.NVarChar(255), d.TenThietBi || null);
        req.input("LoaiThietBi", sql.NVarChar(100), d.LoaiThietBi || null);
        req.input("SerialSN", sql.VarChar(100), normalizeSerialSN(d.SerialSN));
        let parsedDate = null;
        if (d.NgayNhap) {
          const tempDate = new Date(d.NgayNhap);
          if (!isNaN(tempDate) && tempDate >= new Date("1753-01-01")) {
            parsedDate = tempDate;
          }
        }
        req.input("NgayNhap", sql.Date, parsedDate);

        req.input("Trangthai", sql.NVarChar(50), d.Trangthai || "Sẵn sàng");
        req.input("Nguoisudung", sql.NVarChar(100), d.Nguoisudung || null);
        req.input("Vitri", sql.NVarChar(100), d.Vitri || null);

        return req.query(`
  INSERT INTO dbo.THIETBI
    (MaThietBi, TenThietBi, LoaiThietBi, SerialSN, NgayNhap, Trangthai, Nguoisudung, Vitri)
  VALUES
    (@MaThietBi, @TenThietBi, @LoaiThietBi, @SerialSN, @NgayNhap, @Trangthai, @Nguoisudung, @Vitri);
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
        MaThietBi,
        TenThietBi,
        LoaiThietBi,
        NgayNhap,
        ThanhTien,
        NguonMua,
        CreatedAt,
        UpdatedAt,
        LastUserName,
        LastUserId,
        LastAssignedDate
      FROM dbo.Purchase
      ORDER BY MaThietBi, NgayNhap DESC, PurchaseId DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    handleSqlError(res, err);
  }
});
// Thêm 1 bản ghi mua hàng
app.post("/api/purchases", authenticate, async (req, res) => {
  const {
    MaThietBi,
    NgayNhap,
    ThanhTien,
    NguonMua,
    LastUserName,
    LastUserId,
    LastAssignedDate,
  } = req.body || {};

  if (!MaThietBi || !NgayNhap) {
    return res.status(400).send("MaThietBi và NgayNhap là bắt buộc");
  }

  try {
    const pool = await poolPromise;

    // Lấy thông tin thiết bị để tự điền TenThietBi, LoaiThietBi
    const devResult = await pool
      .request()
      .input("MaThietBi", sql.VarChar(50), MaThietBi)
      .query(
        "SELECT TenThietBi, LoaiThietBi FROM dbo.THIETBI WHERE MaThietBi=@MaThietBi",
      );

    if (!devResult.recordset.length) {
      return res.status(400).send("Mã thiết bị không tồn tại trong THIETBI");
    }

    const { TenThietBi, LoaiThietBi } = devResult.recordset[0];

    const insertReq = pool
      .request()
      .input("MaThietBi", sql.VarChar(50), MaThietBi)
      .input("TenThietBi", sql.NVarChar(255), TenThietBi || null)
      .input("LoaiThietBi", sql.NVarChar(100), LoaiThietBi || null)
      .input("NgayNhap", sql.Date, NgayNhap)
      .input("ThanhTien", sql.Decimal(18, 2), ThanhTien ?? null)
      .input("NguonMua", sql.NVarChar(50), NguonMua || null)
      .input("LastUserName", sql.NVarChar(100), LastUserName || null)
      .input("LastUserId", sql.Int, LastUserId ?? null)
      .input("LastAssignedDate", sql.DateTime, LastAssignedDate || null);

    const result = await insertReq.query(`
      INSERT INTO dbo.Purchase
        (MaThietBi, TenThietBi, LoaiThietBi, NgayNhap, ThanhTien, NguonMua,
         LastUserName, LastUserId, LastAssignedDate, CreatedAt, UpdatedAt)
      VALUES
        (@MaThietBi, @TenThietBi, @LoaiThietBi, @NgayNhap, @ThanhTien, @NguonMua,
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
      MaThietBi,
      NgayNhap,
      ThanhTien,
      NguonMua,
      LastUserName,
      LastUserId,
      LastAssignedDate,
    } = req.body || {};

    if (!MaThietBi || !NgayNhap) {
      return res.status(400).send("MaThietBi và NgayNhap là bắt buộc");
    }

    try {
      const pool = await poolPromise;

      // Lấy thông tin thiết bị
      const devResult = await pool
        .request()
        .input("MaThietBi", sql.VarChar(50), MaThietBi)
        .query(
          "SELECT TenThietBi, LoaiThietBi FROM dbo.THIETBI WHERE MaThietBi=@MaThietBi",
        );

      if (!devResult.recordset.length) {
        return res.status(400).send("Mã thiết bị không tồn tại trong THIETBI");
      }

      const { TenThietBi, LoaiThietBi } = devResult.recordset[0];

      const updateReq = pool
        .request()
        .input("PurchaseId", sql.Int, purchaseId)
        .input("MaThietBi", sql.VarChar(50), MaThietBi)
        .input("TenThietBi", sql.NVarChar(255), TenThietBi || null)
        .input("LoaiThietBi", sql.NVarChar(100), LoaiThietBi || null)
        .input("NgayNhap", sql.Date, NgayNhap)
        .input("ThanhTien", sql.Decimal(18, 2), ThanhTien ?? null)
        .input("NguonMua", sql.NVarChar(50), NguonMua || null)
        .input("LastUserName", sql.NVarChar(100), LastUserName || null)
        .input("LastUserId", sql.Int, LastUserId ?? null)
        .input("LastAssignedDate", sql.DateTime, LastAssignedDate || null);

      const result = await updateReq.query(`
      UPDATE dbo.Purchase
      SET
        MaThietBi      = @MaThietBi,
        TenThietBi     = @TenThietBi,
        LoaiThietBi    = @LoaiThietBi,
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
    // Tạo tên file duy nhất: MaThietBi-DotID-Timestamp.jpg
    const maThietBi = req.body.maThietBi || "unknown";
    const dotId = req.body.dotId || "1";
    const uniqueSuffix = Date.now();
    const newFilename = `${maThietBi}-dot${dotId}-${uniqueSuffix}${path.extname(
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

    const { maThietBi, dotId } = req.body;
    if (!maThietBi || !dotId) {
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
        .input("MaThietBi", sql.VarChar, maThietBi)
        .input("DotID", sql.Int, dotId)
        .input("HinhAnh", sql.NVarChar, imagePath)
        .input("NhanVien", sql.NVarChar, nhanVien || "N/A") // Input mới
        .query(
          `
          -- Cập nhật đường dẫn ảnh vào bản ghi kiểm kê đã có
          UPDATE KIEMKECHITIET
          SET HinhAnhThucTe = @HinhAnh
          WHERE MaThietBi = @MaThietBi AND DotID = @DotID;

          -- Nếu chưa có bản ghi kiểm kê, tạo mới với thông tin ảnh
          IF @@ROWCOUNT = 0
          BEGIN
            INSERT INTO KIEMKECHITIET (DotID, MaThietBi, HinhAnhThucTe, NhanVienKiemKe)
            VALUES (@DotID, @MaThietBi, @HinhAnh, 'N/A');
          END
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
    MaThietBi,
    TenThietBi,
    LoaiThietBi,
    SerialSN,
    NgayNhap,
    Trangthai,
    Nguoisudung,
    Ngaycap,
    Vitri,
  } = req.body || {};

  if (!MaThietBi || !TenThietBi) {
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
        .input("MaThietBi", sql.VarChar, MaThietBi)
        .input("TenThietBi", sql.NVarChar, TenThietBi)
        .input("LoaiThietBi", sql.NVarChar, LoaiThietBi || "")
        .input("SerialSN", sql.VarChar(100), normalizeSerialSN(SerialSN) || "")
        .input("NgayNhap", sql.Date, NgayNhap || null)
        .input("Trangthai", sql.NVarChar, state)
        .input(
          "Nguoisudung",
          sql.NVarChar,
          assignedUser ? assignedUser.HoVaTen : null,
        )
        .input("Vitri", sql.NVarChar, Vitri || null)
        .query(
          `INSERT INTO dbo.THIETBI
           (MaThietBi, TenThietBi, LoaiThietBi, SerialSN, NgayNhap, Trangthai, Nguoisudung, Vitri)
           VALUES (@MaThietBi, @TenThietBi, @LoaiThietBi, @SerialSN, @NgayNhap, @Trangthai, @Nguoisudung, @Vitri)`,
        );

      if (assignedUser) {
        // Giải phóng thiết bị cũ nếu có
        if (
          assignedUser.Thietbisudung &&
          assignedUser.Thietbisudung !== MaThietBi
        ) {
          await new sql.Request(tx)
            .input("PrevDev", sql.VarChar, assignedUser.Thietbisudung)
            .query(
              "UPDATE dbo.THIETBI SET Trangthai=N'Sẵn sàng', Nguoisudung=NULL WHERE MaThietBi=@PrevDev",
            );
        }
        await new sql.Request(tx)
          .input("MaNV", sql.VarChar, assignedUser.MaNV)
          .input("MaThietBi", sql.VarChar, MaThietBi)
          .input("Ngaycap", sql.Date, Ngaycap || null)
          .query(
            "UPDATE dbo.NHANVIEN SET Thietbisudung=@MaThietBi, Ngaycap=COALESCE(@Ngaycap, Ngaycap), Trangthai=N'Đang sử dụng' WHERE MaNV=@MaNV",
          );
      }
    });

    res.send("Thêm thiết bị thành công");
  } catch (err) {
    if (err?.http) return res.status(err.http).send(err.message);
    handleSqlError(res, err);
  }
});

// Sửa thiết bị
app.put("/api/devices/:id", authenticate, async (req, res) => {
  const { id } = req.params;
  const {
    TenThietBi,
    LoaiThietBi,
    SerialSN,
    NgayNhap,
    Trangthai,
    Nguoisudung,
    Ngaycap,
    Vitri,
    MaThietBi: NewMaThietBi,
  } = req.body || {};

  try {
    await runTx(async (tx) => {
      const rGet = new sql.Request(tx);
      const dRes = await rGet
        .input("MaThietBi", sql.VarChar, id)
        .query("SELECT TOP 1 * FROM dbo.THIETBI WHERE MaThietBi=@MaThietBi");
      if (!dRes.recordset.length) {
        throw Object.assign(new Error("Không tìm thấy thiết bị"), {
          http: 404,
        });
      }
      const dev = dRes.recordset[0];

      let targetId = id;
      if (NewMaThietBi && NewMaThietBi !== id) {
        const existNew = await new sql.Request(tx)
          .input("NewId", sql.VarChar, NewMaThietBi)
          .query("SELECT 1 FROM dbo.THIETBI WHERE MaThietBi=@NewId");
        if (existNew.recordset.length) {
          throw Object.assign(new Error("Mã thiết bị đã tồn tại."), {
            http: 409,
          });
        }
        await new sql.Request(tx)
          .input("OldId", sql.VarChar, id)
          .input("NewId", sql.VarChar, NewMaThietBi)
          .query(
            "UPDATE dbo.THIETBI SET MaThietBi=@NewId WHERE MaThietBi=@OldId",
          );
        await new sql.Request(tx)
          .input("OldId", sql.VarChar, id)
          .input("NewId", sql.VarChar, NewMaThietBi)
          .query(
            "UPDATE dbo.NHANVIEN SET Thietbisudung=@NewId WHERE Thietbisudung=@OldId",
          );
        targetId = NewMaThietBi;
      }

      async function updateDevice(finalState, finalUser) {
        await new sql.Request(tx)
          .input("MaThietBi", sql.VarChar, targetId)
          .input("TenThietBi", sql.NVarChar, TenThietBi ?? dev.TenThietBi ?? "")
          .input(
            "LoaiThietBi",
            sql.NVarChar,
            LoaiThietBi ?? dev.LoaiThietBi ?? "",
          )
          .input(
            "SerialSN",
            sql.VarChar(100),
            normalizeSerialSN(SerialSN ?? dev.SerialSN) || "",
          )
          .input("NgayNhap", sql.Date, NgayNhap ?? dev.NgayNhap ?? null)
          .input("Trangthai", sql.NVarChar, finalState)
          .input("Nguoisudung", sql.NVarChar, finalUser ?? null)
          .input("Vitri", sql.NVarChar, Vitri ?? dev.Vitri ?? null)
          .query(
            `UPDATE dbo.THIETBI SET 
         TenThietBi=@TenThietBi,
         LoaiThietBi=@LoaiThietBi,
         SerialSN=@SerialSN,
         NgayNhap=@NgayNhap,
         Trangthai=@Trangthai,
         Nguoisudung=@Nguoisudung,
         Vitri=@Vitri,
         LastUserName=COALESCE(@Nguoisudung, LastUserName)
       WHERE MaThietBi=@MaThietBi`,
          );
      }

      const wantState =
        typeof Trangthai !== "undefined" && Trangthai ? Trangthai : null;

      // Chuyển sang Bảo Hành/Hư Hỏng => gỡ gán
      if (wantState === "Bảo Hành" || wantState === "Hư Hỏng") {
        const cu = await new sql.Request(tx)
          .input("DevId", sql.VarChar, targetId)
          .query(
            "SELECT TOP 1 MaNV, HoVaTen, Ngaycap FROM dbo.NHANVIEN WHERE Thietbisudung=@DevId",
          );
        if (cu.recordset.length) {
          const r = cu.recordset[0];
          await new sql.Request(tx)
            .input("MaThietBi", sql.VarChar, targetId)
            .input("LastUserId", sql.VarChar, r.MaNV)
            .input("LastUserName", sql.NVarChar, r.HoVaTen)
            .input("LastAssignedDate", sql.Date, r.Ngaycap || null)
            .query(
              "UPDATE dbo.THIETBI SET LastUserId=@LastUserId, LastUserName=@LastUserName, LastAssignedDate=@LastAssignedDate WHERE MaThietBi=@MaThietBi",
            );
        } else if (dev.Nguoisudung) {
          await new sql.Request(tx)
            .input("MaThietBi", sql.VarChar, targetId)
            .input("LastUserName", sql.NVarChar, dev.Nguoisudung)
            .query(
              "UPDATE dbo.THIETBI SET LastUserName=@LastUserName WHERE MaThietBi=@MaThietBi",
            );
        }

        await updateDevice(wantState, null);
        await new sql.Request(tx)
          .input("DevId", sql.VarChar, targetId)
          .query(
            "UPDATE dbo.NHANVIEN SET Thietbisudung=NULL, Ngaycap=NULL, Trangthai=N'Chưa cấp' WHERE Thietbisudung=@DevId",
          );
        return;
      }

      // Thay đổi Nguoisudung?
      if (typeof Nguoisudung !== "undefined") {
        if (!Nguoisudung) {
          // Bỏ gán
          if (wantState === "Đang sử dụng") {
            const prevId = dev.LastUserId || null;
            if (prevId) {
              await updateDevice(
                "Đang sử dụng",
                dev.Nguoisudung || dev.LastUserName || null,
              );
              await new sql.Request(tx)
                .input("MaNV", sql.VarChar, prevId)
                .input("DevId", sql.VarChar, targetId)
                .input(
                  "LastAssignedDate",
                  sql.Date,
                  dev.LastAssignedDate || null,
                )
                .query(
                  "UPDATE dbo.NHANVIEN SET Thietbisudung=@DevId, Ngaycap=COALESCE(@LastAssignedDate, Ngaycap, GETDATE()), Trangthai=N'Đang sử dụng' WHERE MaNV=@MaNV",
                );
              await new sql.Request(tx)
                .input("DevId", sql.VarChar, targetId)
                .input("MaNV", sql.VarChar, prevId)
                .query(
                  "UPDATE dbo.THIETBI SET LastUserId=@MaNV WHERE MaThietBi=@DevId",
                );
            } else {
              const prevName = dev.Nguoisudung || dev.LastUserName || null;
              if (prevName) {
                await updateDevice("Đang sử dụng", prevName);
                const prevUser = await findUserByIdOrName(tx, String(prevName));
                if (prevUser) {
                  await new sql.Request(tx)
                    .input("MaNV", sql.VarChar, prevUser.MaNV)
                    .input("DevId", sql.VarChar, targetId)
                    .input(
                      "LastAssignedDate",
                      sql.Date,
                      dev.LastAssignedDate || null,
                    )
                    .query(
                      "UPDATE dbo.NHANVIEN SET Thietbisudung=@DevId, Ngaycap=COALESCE(@LastAssignedDate, Ngaycap, GETDATE()), Trangthai=N'Đang sử dụng' WHERE MaNV=@MaNV",
                    );
                  await new sql.Request(tx)
                    .input("DevId", sql.VarChar, targetId)
                    .input("MaNV", sql.VarChar, prevUser.MaNV)
                    .query(
                      "UPDATE dbo.THIETBI SET LastUserId=@MaNV WHERE MaThietBi=@DevId",
                    );
                }
              } else {
                await updateDevice("Sẵn sàng", null);
              }
            }
          } else {
            await updateDevice("Sẵn sàng", null);
            await new sql.Request(tx)
              .input("DevId", sql.VarChar, targetId)
              .query(
                "UPDATE dbo.NHANVIEN SET Thietbisudung=NULL, Ngaycap=NULL, Trangthai=N'Chưa cấp' WHERE Thietbisudung=@DevId",
              );
          }
        } else {
          // Gán theo MaNV hoặc HoVaTen
          const user = await findUserByIdOrName(tx, String(Nguoisudung));
          if (!user) {
            throw Object.assign(
              new Error("Không tìm thấy người dùng tương ứng"),
              {
                http: 400,
              },
            );
          }
          if (dev.Trangthai === "Bảo Hành" || dev.Trangthai === "Hư Hỏng") {
            throw Object.assign(
              new Error("Thiết bị không sẵn sàng (Bảo Hành/Hư Hỏng)"),
              { http: 409 },
            );
          }

          await new sql.Request(tx)
            .input("DevId", sql.VarChar, targetId)
            .input("MaNV", sql.VarChar, user.MaNV)
            .query(
              "UPDATE dbo.NHANVIEN SET Thietbisudung=NULL, Ngaycap=NULL, Trangthai=N'Chưa cấp' WHERE Thietbisudung=@DevId AND MaNV<>@MaNV",
            );

          if (user.Thietbisudung && user.Thietbisudung !== targetId) {
            await new sql.Request(tx)
              .input("PrevDev", sql.VarChar, user.Thietbisudung)
              .query(
                "UPDATE dbo.THIETBI SET Trangthai=N'Sẵn sàng', Nguoisudung=NULL WHERE MaThietBi=@PrevDev",
              );
          }

          await new sql.Request(tx)
            .input("MaNV", sql.VarChar, user.MaNV)
            .input("MaThietBi", sql.VarChar, targetId)
            .input("Ngaycap", sql.Date, Ngaycap || null)
            .query(
              "UPDATE dbo.NHANVIEN SET Thietbisudung=@MaThietBi, Ngaycap=COALESCE(@Ngaycap, Ngaycap, GETDATE()), Trangthai=N'Đang sử dụng' WHERE MaNV=@MaNV",
            );

          await updateDevice("Đang sử dụng", user.HoVaTen);
          await new sql.Request(tx)
            .input("DevId", sql.VarChar, targetId)
            .input("MaNV", sql.VarChar, user.MaNV)
            .query(
              "UPDATE dbo.THIETBI SET LastUserId=@MaNV WHERE MaThietBi=@DevId",
            );
        }
      } else {
        // Không đổi người dùng, chỉ đổi info/trạng thái
        const finalState =
          wantState ?? (dev.Nguoisudung ? "Đang sử dụng" : "Sẵn sàng");

        if (finalState === "Sẵn sàng") {
          await updateDevice("Sẵn sàng", null);
          await new sql.Request(tx)
            .input("DevId", sql.VarChar, targetId)
            .query(
              "UPDATE dbo.NHANVIEN SET Thietbisudung=NULL, Ngaycap=NULL, Trangthai=N'Chưa cấp' WHERE Thietbisudung=@DevId",
            );
        } else if (finalState === "Đang sử dụng") {
          const prevId = dev.LastUserId || null;
          if (prevId) {
            await updateDevice(
              "Đang sử dụng",
              dev.Nguoisudung || dev.LastUserName || null,
            );
            await new sql.Request(tx)
              .input("MaNV", sql.VarChar, prevId)
              .input("DevId", sql.VarChar, targetId)
              .input("LastAssignedDate", sql.Date, dev.LastAssignedDate || null)
              .query(
                "UPDATE dbo.NHANVIEN SET Thietbisudung=@DevId, Ngaycap=COALESCE(@LastAssignedDate, Ngaycap, GETDATE()), Trangthai=N'Đang sử dụng' WHERE MaNV=@MaNV",
              );
            await new sql.Request(tx)
              .input("DevId", sql.VarChar, targetId)
              .input("MaNV", sql.VarChar, prevId)
              .query(
                "UPDATE dbo.THIETBI SET LastUserId=@MaNV WHERE MaThietBi=@DevId",
              );
          } else {
            const prevName = dev.Nguoisudung || dev.LastUserName || null;
            await updateDevice("Đang sử dụng", prevName);
            if (prevName) {
              const prevUser = await findUserByIdOrName(tx, String(prevName));
              if (prevUser) {
                await new sql.Request(tx)
                  .input("MaNV", sql.VarChar, prevUser.MaNV)
                  .input("DevId", sql.VarChar, targetId)
                  .input(
                    "LastAssignedDate",
                    sql.Date,
                    dev.LastAssignedDate || null,
                  )
                  .query(
                    "UPDATE dbo.NHANVIEN SET Thietbisudung=@DevId, Ngaycap=COALESCE(@LastAssignedDate, Ngaycap, GETDATE()), Trangthai=N'Đang sử dụng' WHERE MaNV=@MaNV",
                  );
                await new sql.Request(tx)
                  .input("DevId", sql.VarChar, targetId)
                  .input("MaNV", sql.VarChar, prevUser.MaNV)
                  .query(
                    "UPDATE dbo.THIETBI SET LastUserId=@MaNV WHERE MaThietBi=@DevId",
                  );
              } else {
                await new sql.Request(tx)
                  .input("DevId", sql.VarChar, targetId)
                  .query(
                    "UPDATE dbo.NHANVIEN SET Trangthai=N'Đang sử dụng' WHERE Thietbisudung=@DevId",
                  );
              }
            }
          }
        } else {
          await updateDevice(finalState, dev.Nguoisudung);
        }
      }
    });

    res.send("Cập nhật thiết bị thành công");
  } catch (err) {
    if (err?.http) return res.status(err.http).send(err.message);
    handleSqlError(res, err);
  }
});

// Xóa thiết bị
app.delete(
  "/api/devices/:id",
  authenticate,
  authorizeAdmin,
  async (req, res) => {
    try {
      await runTx(async (tx) => {
        await new sql.Request(tx)
          .input("DevId", sql.VarChar, req.params.id)
          .query(
            "UPDATE dbo.NHANVIEN SET Thietbisudung=NULL, Ngaycap=NULL, Trangthai=N'Chưa cấp' WHERE Thietbisudung=@DevId",
          );

        await new sql.Request(tx)
          .input("MaThietBi", sql.VarChar, req.params.id)
          .query("DELETE FROM dbo.THIETBI WHERE MaThietBi=@MaThietBi");
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
  const { MaNV, MaThietBi, Ngaycap } = req.body || {};
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

      if (!MaThietBi) {
        if (user.Thietbisudung) {
          await new sql.Request(tx)
            .input("DevId", sql.VarChar, user.Thietbisudung)
            .query(
              "UPDATE dbo.THIETBI SET Trangthai=N'Sẵn sàng', Nguoisudung=NULL WHERE MaThietBi=@DevId",
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
        .input("MaThietBi", sql.VarChar, MaThietBi)
        .query("SELECT TOP 1 * FROM dbo.THIETBI WHERE MaThietBi=@MaThietBi");
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

      if (user.Thietbisudung && user.Thietbisudung !== MaThietBi) {
        await new sql.Request(tx)
          .input("PrevDev", sql.VarChar, user.Thietbisudung)
          .query(
            "UPDATE dbo.THIETBI SET Trangthai=N'Sẵn sàng', Nguoisudung=NULL WHERE MaThietBi=@PrevDev",
          );
      }

      await new sql.Request(tx)
        .input("MaNV", sql.VarChar, MaNV)
        .input("MaThietBi", sql.VarChar, MaThietBi)
        .input("Ngaycap", sql.Date, Ngaycap || null)
        .query(
          "UPDATE dbo.NHANVIEN SET Thietbisudung=@MaThietBi, Ngaycap=@Ngaycap, Trangthai=N'Đang sử dụng' WHERE MaNV=@MaNV",
        );

      await new sql.Request(tx)
        .input("MaThietBi", sql.VarChar, MaThietBi)
        .input("Nguoisudung", sql.NVarChar, user.HoVaTen)
        .input("MaNV", sql.VarChar, MaNV)
        .query(
          "UPDATE dbo.THIETBI SET Trangthai=N'Đang sử dụng', Nguoisudung=@Nguoisudung, LastUserName=@Nguoisudung, LastUserId=@MaNV WHERE MaThietBi=@MaThietBi",
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
          .input("MaThietBi", sql.VarChar, Thietbisudung)
          .query("SELECT TOP 1 * FROM dbo.THIETBI WHERE MaThietBi=@MaThietBi");
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
          .input("MaThietBi", sql.VarChar, Thietbisudung)
          .input("Nguoisudung", sql.NVarChar, HoVaTen)
          .input("MaNV", sql.VarChar, MaNV)
          .query(
            "UPDATE dbo.THIETBI SET Trangthai=N'Đang sử dụng', Nguoisudung=@Nguoisudung, LastUserName=@Nguoisudung, LastUserId=@MaNV WHERE MaThietBi=@MaThietBi",
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
      const uRes = await new sql.Request(tx)
        .input("MaNV", sql.VarChar, id)
        .query("SELECT TOP 1 * FROM dbo.NHANVIEN WHERE MaNV=@MaNV");
      if (!uRes.recordset.length) {
        throw Object.assign(new Error("Không tìm thấy nhân viên"), {
          http: 404,
        });
      }
      const curr = uRes.recordset[0];

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

      await new sql.Request(tx)
        .input("MaNV", sql.VarChar, targetId)
        .input("HoVaTen", sql.NVarChar, HoVaTen ?? curr.HoVaTen ?? "")
        .input("Phongban", sql.NVarChar, Phongban ?? curr.Phongban ?? "")
        .query(
          `UPDATE dbo.NHANVIEN SET HoVaTen=@HoVaTen, Phongban=@Phongban WHERE MaNV=@MaNV`,
        );

      const newName = HoVaTen ?? curr.HoVaTen;

      if (typeof Thietbisudung !== "undefined") {
        const newDevId = Thietbisudung || null;
        const prevDevId = curr.Thietbisudung || null;

        if (!newDevId) {
          if (prevDevId) {
            await new sql.Request(tx)
              .input("PrevDev", sql.VarChar, prevDevId)
              .query(
                "UPDATE dbo.THIETBI SET Trangthai=N'Sẵn sàng', Nguoisudung=NULL WHERE MaThietBi=@PrevDev",
              );
          }
          await new sql.Request(tx)
            .input("MaNV", sql.VarChar, targetId)
            .input("Ngaycap", sql.Date, Ngaycap || null)
            .query(
              "UPDATE dbo.NHANVIEN SET Thietbisudung=NULL, Ngaycap=ISNULL(@Ngaycap, Ngaycap), Trangthai=N'Chưa cấp' WHERE MaNV=@MaNV",
            );
        } else {
          const dRes = await new sql.Request(tx)
            .input("MaThietBi", sql.VarChar, newDevId)
            .query(
              "SELECT TOP 1 * FROM dbo.THIETBI WHERE MaThietBi=@MaThietBi",
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

          if (prevDevId && prevDevId !== newDevId) {
            await new sql.Request(tx)
              .input("PrevDev", sql.VarChar, prevDevId)
              .query(
                "UPDATE dbo.THIETBI SET Trangthai=N'Sẵn sàng', Nguoisudung=NULL WHERE MaThietBi=@PrevDev",
              );
          }

          await new sql.Request(tx)
            .input("MaNV", sql.VarChar, targetId)
            .input("MaThietBi", sql.VarChar, newDevId)
            .input("Ngaycap", sql.Date, Ngaycap || null)
            .query(
              "UPDATE dbo.NHANVIEN SET Thietbisudung=@MaThietBi, Ngaycap=@Ngaycap, Trangthai=N'Đang sử dụng' WHERE MaNV=@MaNV",
            );

          await new sql.Request(tx)
            .input("MaThietBi", sql.VarChar, newDevId)
            .input("Nguoisudung", sql.NVarChar, newName)
            .input("MaNV", sql.VarChar, targetId)
            .query(
              "UPDATE dbo.THIETBI SET Trangthai=N'Đang sử dụng', Nguoisudung=@Nguoisudung, LastUserName=@Nguoisudung, LastUserId=@MaNV WHERE MaThietBi=@MaThietBi",
            );
        }
      } else {
        if (typeof Ngaycap !== "undefined") {
          await new sql.Request(tx)
            .input("MaNV", sql.VarChar, targetId)
            .input("Ngaycap", sql.Date, Ngaycap || null)
            .query("UPDATE dbo.NHANVIEN SET Ngaycap=@Ngaycap WHERE MaNV=@MaNV");
        }
        if (curr.Thietbisudung && newName && newName !== curr.HoVaTen) {
          await new sql.Request(tx)
            .input("MaThietBi", sql.VarChar, curr.Thietbisudung)
            .input("Nguoisudung", sql.NVarChar, newName)
            .query(
              "UPDATE dbo.THIETBI SET Nguoisudung=@Nguoisudung WHERE MaThietBi=@MaThietBi",
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
              "UPDATE dbo.THIETBI SET Trangthai=N'Sẵn sàng', Nguoisudung=NULL WHERE MaThietBi=@DevId",
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

    try {
      const pool = await poolPromise;
      const insertPromises = items.map((u) => {
        const req = pool.request();
        req.input("MaNV", sql.VarChar(50), u.MaNV);
        req.input("HoVaTen", sql.NVarChar(100), u.HoVaTen || null);
        req.input("Phongban", sql.NVarChar(100), u.Phongban || null);
        req.input("Trangthai", sql.NVarChar(50), u.Trangthai || "Chưa cấp");

        let parsedDate = null;
        if (u.Ngaycap) {
          const d = new Date(u.Ngaycap);
          if (!isNaN(d) && d >= new Date("1753-01-01")) parsedDate = d;
        }
        req.input("Ngaycap", sql.Date, parsedDate);

        return req.query(`
        INSERT INTO dbo.NHANVIEN (MaNV, HoVaTen, Phongban, Trangthai, Ngaycap)
        VALUES (@MaNV, @HoVaTen, @Phongban, @Trangthai, @Ngaycap);
      `);
      });

      await Promise.all(insertPromises);
      res.status(201).send("Đã nhập xong dữ liệu người sử dụng");
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
      .input("MaThietBi", sql.VarChar, req.params.id).query(`
        SELECT TOP 1
          t.*,
          kk.HinhAnhThucTe
        FROM dbo.THIETBI t
        LEFT JOIN (
          SELECT
            MaThietBi, HinhAnhThucTe,
            ROW_NUMBER() OVER(PARTITION BY MaThietBi ORDER BY DotID DESC, ThoiGianQuet DESC) as rn
          FROM dbo.KIEMKECHITIET WHERE HinhAnhThucTe IS NOT NULL
        ) kk ON t.MaThietBi = kk.MaThietBi AND kk.rn = 1
        WHERE t.MaThietBi = @MaThietBi
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
    MaThietBi,
    TrangThaiThucTe,
    ViTriThucTe,
    NhanVienKiemKe,
    GhiChu,
  } = req.body || {};

  if (!MaThietBi) {
    return res.status(400).send("Thiếu MaThietBi");
  }

  try {
    await runTx(async (tx) => {
      // 0. Chuẩn hóa DotID client gửi lên
      let dotParam = parseInt(DotID, 10);
      if (!dotParam || dotParam < 1) dotParam = 1;

      // 1. Kiểm tra thiết bị có tồn tại không
      const devRes = await new sql.Request(tx)
        .input("MaThietBi", sql.VarChar, MaThietBi)
        .query(
          "SELECT TOP 1 MaThietBi FROM dbo.THIETBI WHERE MaThietBi=@MaThietBi",
        );
      if (!devRes.recordset.length) {
        throw Object.assign(new Error("Không tìm thấy thiết bị"), {
          http: 404,
        });
      }

      // 2. Tìm hoặc tạo đợt kiểm kê
      let finalDotId;

      // 2.1. Thử tìm đúng DotID mà client nhập
      const dotById = await new sql.Request(tx)
        .input("DotID", sql.Int, dotParam)
        .query("SELECT DotID FROM dbo.DOTKIEMKE WHERE DotID=@DotID");

      if (dotById.recordset.length) {
        // Đã có Đợt này rồi
        finalDotId = dotById.recordset[0].DotID;
      } else {
        // Chưa có → tạo đợt mới, KHÔNG insert cột DotID
        const createDot = await new sql.Request(tx).input(
          "TenDot",
          sql.NVarChar,
          `Kiểm kê đợt ${dotParam}`,
        ).query(`
            INSERT INTO dbo.DOTKIEMKE (TenDot, NgayBatDau, GhiChu)
            VALUES (@TenDot, CONVERT(date, GETDATE()), N'Tạo tự động từ /public/kiemke');
            SELECT SCOPE_IDENTITY() AS DotID;
          `);

        finalDotId = createDot.recordset[0].DotID;
        console.log("✅ Tạo mới DOTKIEMKE DotID =", finalDotId);
      }

      // 3. Upsert vào KIEMKECHITIET (mỗi DotID + MaThietBi chỉ 1 dòng)
      const checkRes = await new sql.Request(tx)
        .input("DotID", sql.Int, finalDotId)
        .input("MaThietBi", sql.VarChar, MaThietBi)
        .query(
          "SELECT ID FROM dbo.KIEMKECHITIET WHERE DotID=@DotID AND MaThietBi=@MaThietBi",
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
            `UPDATE dbo.KIEMKECHITIET
             SET TrangThaiThucTe = @TrangThaiThucTe,
                 ViTriThucTe     = @ViTriThucTe,
                 NhanVienKiemKe  = @NhanVienKiemKe,
                 ThoiGianQuet    = GETDATE(),
                 GhiChu          = @GhiChu
             WHERE ID=@ID`,
          );
      } else {
        // INSERT
        await new sql.Request(tx)
          .input("DotID", sql.Int, finalDotId)
          .input("MaThietBi", sql.VarChar, MaThietBi)
          .input("TrangThaiThucTe", sql.NVarChar, TrangThaiThucTe || null)
          .input("ViTriThucTe", sql.NVarChar, ViTriThucTe || null)
          .input("NhanVienKiemKe", sql.NVarChar, NhanVienKiemKe || null)
          .input("GhiChu", sql.NVarChar, GhiChu || null)
          .query(
            `INSERT INTO dbo.KIEMKECHITIET
             (DotID, MaThietBi, TrangThaiThucTe, ViTriThucTe, NhanVienKiemKe, GhiChu)
             VALUES (@DotID, @MaThietBi, @TrangThaiThucTe, @ViTriThucTe, @NhanVienKiemKe, @GhiChu)`,
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

      // Lấy / tạo DOTKIEMKE một lần
      let finalDotId;
      const dotById = await new sql.Request(tx)
        .input("DotID", sql.Int, dotParam)
        .query("SELECT DotID FROM dbo.DOTKIEMKE WHERE DotID=@DotID");

      if (dotById.recordset.length) {
        finalDotId = dotById.recordset[0].DotID;
      } else {
        const createDot = await new sql.Request(tx).input(
          "TenDot",
          sql.NVarChar,
          `Đợt kiểm kê ${dotParam}`,
        ).query(`
            INSERT INTO dbo.DOTKIEMKE (TenDot, NgayBatDau, GhiChu)
            VALUES (@TenDot, CONVERT(date, GETDATE()), N'Tạo tự động từ /public/kiemke-bulk');
            SELECT SCOPE_IDENTITY() AS DotID;
          `);
        finalDotId = createDot.recordset[0].DotID;
        console.log("✅ Tạo mới DOTKIEMKE (bulk) DotID =", finalDotId);
      }

      // Duyệt từng item trong mảng
      for (const it of items) {
        const {
          MaThietBi,
          TrangThaiThucTe,
          ViTriThucTe,
          NhanVienKiemKe,
          GhiChu,
        } = it || {};
        if (!MaThietBi) continue; // bỏ qua nếu thiếu mã

        // Kiểm tra thiết bị tồn tại
        const devRes = await new sql.Request(tx)
          .input("MaThietBi", sql.VarChar, MaThietBi)
          .query(
            "SELECT TOP 1 MaThietBi FROM dbo.THIETBI WHERE MaThietBi=@MaThietBi",
          );
        if (!devRes.recordset.length) {
          console.warn("⚠️ Thiết bị không tồn tại, bỏ qua:", MaThietBi);
          continue;
        }

        // Upsert vào KIEMKECHITIET
        const checkRes = await new sql.Request(tx)
          .input("DotID", sql.Int, finalDotId)
          .input("MaThietBi", sql.VarChar, MaThietBi)
          .query(
            "SELECT ID FROM dbo.KIEMKECHITIET WHERE DotID=@DotID AND MaThietBi=@MaThietBi",
          );

        if (checkRes.recordset.length) {
          await new sql.Request(tx)
            .input("ID", sql.Int, checkRes.recordset[0].ID)
            .input("TrangThaiThucTe", sql.NVarChar, TrangThaiThucTe || null)
            .input("ViTriThucTe", sql.NVarChar, ViTriThucTe || null)
            .input("NhanVienKiemKe", sql.NVarChar, NhanVienKiemKe || null)
            .input("GhiChu", sql.NVarChar, GhiChu || null).query(`
              UPDATE dbo.KIEMKECHITIET
              SET TrangThaiThucTe = @TrangThaiThucTe,
                  ViTriThucTe     = @ViTriThucTe,
                  NhanVienKiemKe  = @NhanVienKiemKe,
                  ThoiGianQuet    = GETDATE(),
                  GhiChu          = @GhiChu
              WHERE ID=@ID
            `);
        } else {
          await new sql.Request(tx)
            .input("DotID", sql.Int, finalDotId)
            .input("MaThietBi", sql.VarChar, MaThietBi)
            .input("TrangThaiThucTe", sql.NVarChar, TrangThaiThucTe || null)
            .input("ViTriThucTe", sql.NVarChar, ViTriThucTe || null)
            .input("NhanVienKiemKe", sql.NVarChar, NhanVienKiemKe || null)
            .input("GhiChu", sql.NVarChar, GhiChu || null).query(`
              INSERT INTO dbo.KIEMKECHITIET
              (DotID, MaThietBi, TrangThaiThucTe, ViTriThucTe, NhanVienKiemKe, GhiChu)
              VALUES (@DotID, @MaThietBi, @TrangThaiThucTe, @ViTriThucTe, @NhanVienKiemKe, @GhiChu)
            `);
        }
      }
    });

    res.send("Đã ghi nhận kiểm kê (bulk)");
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
