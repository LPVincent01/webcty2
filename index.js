// index.js — Express + MSSQL + Static
const express = require("express");
const sql = require("mssql");
const cors = require("cors");
const path = require("path");

const app = express();
const port = 3000;

/* ========= CẤU HÌNH SQL SERVER ========= */
const config = {
  user: "sa",
  password: "Abc@123456!",
  server: "DESKTOP-A8PDRAJ",
  database: "QuanLyThietBi",
  options: {
    instanceName: "BARTENDER",
    encrypt: false,
    trustServerCertificate: true,
  },
};

/* ============== MIDDLEWARE CHUNG ============== */
app.use(express.json());

// CORS: cho phép các origin bạn dùng trong dev (localhost/127.0.0.1/5500 & IP LAN)
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://192.168.11.86:3000",
  "http://192.168.11.86:5500",
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
  })
);
// preflight
app.options("*", cors());

// (khuyên) log request để debug nhanh
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});

/* ======= PHỤC VỤ FRONTEND (STATIC) ======= */
app.use(express.static(__dirname));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/health", (_req, res) => res.json({ ok: true }));

/* ====== KẾT NỐI SQL POOL + START ====== */
const poolPromise = new sql.ConnectionPool(config)
  .connect()
  .then((pool) => {
    console.log("✅ Kết nối SQL Server thành công");
    app.listen(port, "0.0.0.0", () =>
      console.log(`🚀 Server chạy tại http://192.168.11.86:${port}`)
    );
    return pool;
  })
  .catch((err) => {
    console.error("❌ Lỗi kết nối SQL:", err);
    process.exit(1);
  });

/* ====== TIỆN ÍCH LỖI SQL ====== */
function handleSqlError(res, err) {
  if (err && (err.number === 2627 || err.number === 2601)) {
    return res.status(409).send("Mã đã tồn tại.");
  }
  console.error("SQL error:", err);
  return res.status(500).send(err?.message || "Lỗi máy chủ.");
}

/* ========== API /api/devices ========== */

// Lấy danh sách thiết bị
app.get("/api/devices", async (_req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM dbo.THIETBI");
    res.json(result.recordset);
  } catch (err) {
    handleSqlError(res, err);
  }
});

// Thêm thiết bị
app.post("/api/devices", async (req, res) => {
  console.log("POST /api/devices body:", req.body);
  const {
    MaThietBi,
    TenThietBi,
    LoaiThietBi,
    SerialSN,
    NgayNhap,
    Trangthai,
    Nguoisudung,
  } = req.body;

  if (!MaThietBi || !TenThietBi) {
    return res.status(400).send("Thiếu mã hoặc tên thiết bị");
  }

  try {
    const pool = await poolPromise;
    await pool
      .request()
      .input("MaThietBi", sql.VarChar, MaThietBi)
      .input("TenThietBi", sql.NVarChar, TenThietBi)
      .input("LoaiThietBi", sql.NVarChar, LoaiThietBi || "")
      .input("SerialSN", sql.VarChar, SerialSN || "")
      .input("NgayNhap", sql.Date, NgayNhap || null)
      .input("Trangthai", sql.NVarChar, Trangthai || "Sẵn sàng")
      .input("Nguoisudung", sql.NVarChar, Nguoisudung || null).query(`
        INSERT INTO dbo.THIETBI
        (MaThietBi, TenThietBi, LoaiThietBi, SerialSN, NgayNhap, Trangthai, Nguoisudung)
        VALUES (@MaThietBi, @TenThietBi, @LoaiThietBi, @SerialSN, @NgayNhap, @Trangthai, @Nguoisudung)
      `);

    res.send("Thêm thiết bị thành công");
  } catch (err) {
    handleSqlError(res, err);
  }
});

// Sửa thiết bị
app.put("/api/devices/:id", async (req, res) => {
  console.log("PUT /api/devices/:id", req.params.id, req.body);
  const { id } = req.params;
  const {
    TenThietBi,
    LoaiThietBi,
    SerialSN,
    NgayNhap,
    Trangthai,
    Nguoisudung,
  } = req.body;

  try {
    const pool = await poolPromise;
    await pool
      .request()
      .input("MaThietBi", sql.VarChar, id)
      .input("TenThietBi", sql.NVarChar, TenThietBi || "")
      .input("LoaiThietBi", sql.NVarChar, LoaiThietBi || "")
      .input("SerialSN", sql.VarChar, SerialSN || "")
      .input("NgayNhap", sql.Date, NgayNhap || null)
      .input("Trangthai", sql.NVarChar, Trangthai || "Sẵn sàng")
      .input("Nguoisudung", sql.NVarChar, Nguoisudung || null).query(`
        UPDATE dbo.THIETBI
        SET TenThietBi=@TenThietBi, LoaiThietBi=@LoaiThietBi, SerialSN=@SerialSN,
            NgayNhap=@NgayNhap, Trangthai=@Trangthai, Nguoisudung=@Nguoisudung
        WHERE MaThietBi=@MaThietBi
      `);

    res.send("Cập nhật thiết bị thành công");
  } catch (err) {
    handleSqlError(res, err);
  }
});

// Xóa thiết bị
app.delete("/api/devices/:id", async (req, res) => {
  console.log("DELETE /api/devices/:id", req.params.id);
  try {
    const pool = await poolPromise;
    await pool
      .request()
      .input("MaThietBi", sql.VarChar, req.params.id)
      .query("DELETE FROM dbo.THIETBI WHERE MaThietBi=@MaThietBi");

    res.send("Xóa thiết bị thành công");
  } catch (err) {
    handleSqlError(res, err);
  }
});

/* ========== API /api/users ========== */

// Lấy danh sách nhân viên
app.get("/api/users", async (_req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM dbo.NHANVIEN");
    res.json(result.recordset);
  } catch (err) {
    handleSqlError(res, err);
  }
});

// Thêm nhân viên
app.post("/api/users", async (req, res) => {
  console.log("POST /api/users body:", req.body);
  const { MaNV, HoVaTen, Phongban, Thietbisudung, Ngaycap, Trangthai } =
    req.body;

  if (!MaNV || !HoVaTen) {
    return res.status(400).send("Thiếu mã hoặc họ tên nhân viên");
  }

  try {
    const pool = await poolPromise;
    await pool
      .request()
      .input("MaNV", sql.VarChar, MaNV)
      .input("HoVaTen", sql.NVarChar, HoVaTen)
      .input("Phongban", sql.NVarChar, Phongban || "")
      .input("Thietbisudung", sql.VarChar, Thietbisudung || null)
      .input("Ngaycap", sql.Date, Ngaycap || null)
      .input("Trangthai", sql.NVarChar, Trangthai || "Chưa cấp").query(`
        INSERT INTO dbo.NHANVIEN
        (MaNV, HoVaTen, Phongban, Thietbisudung, Ngaycap, Trangthai)
        VALUES (@MaNV, @HoVaTen, @Phongban, @Thietbisudung, @Ngaycap, @Trangthai)
      `);

    res.send("Thêm nhân viên thành công");
  } catch (err) {
    handleSqlError(res, err);
  }
});

// Sửa nhân viên
app.put("/api/users/:id", async (req, res) => {
  console.log("PUT /api/users/:id", req.params.id, req.body);
  const { id } = req.params;
  const { HoVaTen, Phongban, Thietbisudung, Ngaycap, Trangthai } = req.body;

  try {
    const pool = await poolPromise;
    await pool
      .request()
      .input("MaNV", sql.VarChar, id)
      .input("HoVaTen", sql.NVarChar, HoVaTen || "")
      .input("Phongban", sql.NVarChar, Phongban || "")
      .input("Thietbisudung", sql.VarChar, Thietbisudung || null)
      .input("Ngaycap", sql.Date, Ngaycap || null)
      .input("Trangthai", sql.NVarChar, Trangthai || "Chưa cấp").query(`
        UPDATE dbo.NHANVIEN
        SET HoVaTen=@HoVaTen, Phongban=@Phongban, Thietbisudung=@Thietbisudung,
            Ngaycap=@Ngaycap, Trangthai=@Trangthai
        WHERE MaNV=@MaNV
      `);

    res.send("Cập nhật nhân viên thành công");
  } catch (err) {
    handleSqlError(res, err);
  }
});

// Xóa nhân viên
app.delete("/api/users/:id", async (req, res) => {
  console.log("DELETE /api/users/:id", req.params.id);
  try {
    const pool = await poolPromise;
    await pool
      .request()
      .input("MaNV", sql.VarChar, req.params.id)
      .query("DELETE FROM dbo.NHANVIEN WHERE MaNV=@MaNV");

    res.send("Xóa nhân viên thành công");
  } catch (err) {
    handleSqlError(res, err);
  }
});
