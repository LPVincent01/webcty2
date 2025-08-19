// index.js — Express + MSSQL + Static (đã sửa lỗi trùng lặp, đồng bộ gán người dùng <-> thiết bị)
const express = require("express");
const sql = require("mssql");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = 3000;
const HOST = "0.0.0.0"; // Cho phép truy cập từ tất cả IP trong LAN

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

// CORS: cho phép origin từ localhost và IP LAN
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://192.168.11.51:3000", // IP LAN
  "http://192.168.11.51:5500", // IP LAN
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

// Log request để debug nhanh
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});

/* ======= PHỤC VỤ FRONTEND (STATIC) ======= */
app.use(express.static(__dirname));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/health", (_req, res) => res.json({ ok: true }));

/* ====== AUTH (ĐĂNG NHẬP + PHÂN QUYỀN) ====== */
const USERS = [
  { username: "admin", password: "admin123", role: "admin" },
  { username: "user", password: "user123", role: "user" },
];
const TOKENS = new Map(); // token -> { username, role }
function makeToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const u = USERS.find(
    (x) => x.username === username && x.password === password
  );
  if (!u) return res.status(401).send("Sai tài khoản hoặc mật khẩu");
  const token = makeToken();
  TOKENS.set(token, { username: u.username, role: u.role });
  return res.json({ token, role: u.role, username: u.username });
});

function authenticate(req, res, next) {
  const auth = req.headers["authorization"] || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).send("Thiếu token");
  const token = m[1];
  const session = TOKENS.get(token);
  if (!session) return res.status(401).send("Token không hợp lệ");
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
    `
      )
      .then(() => {
        console.log(
          "✅ CHECK constraints Trangthai đã sẵn sàng (có 'Hư Hỏng')."
        );
      })
      .catch((e) => {
        console.warn(
          "⚠️ Không thể thiết lập CHECK constraints:",
          e?.message || e
        );
      });

    // Đảm bảo unique index mỗi thiết bị chỉ gán cho 1 nhân viên (bỏ qua NULL)
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
      `
      )
      .then(() => {
        console.log("✅ Unique index NHANVIEN(Thietbisudung) sẵn sàng");
      })
      .catch((e) => {
        console.warn(
          "⚠️ Không thể tạo unique index (có thể đã tồn tại):",
          e?.message || e
        );
      });

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
      `
      )
      .then(() => {
        console.log("✅ Unique index THIETBI(SerialSN) sẵn sàng");
      })
      .catch((e) => {
        console.warn(
          "⚠️ Không thể tạo unique index SerialSN (có thể đã tồn tại):",
          e?.message || e
        );
      });

    // Ensure column to remember last user for restoration after maintenance
    await pool
      .request()
      .query(`
        IF COL_LENGTH('dbo.THIETBI','LastUserName') IS NULL
          ALTER TABLE dbo.THIETBI ADD LastUserName NVARCHAR(255) NULL;
      `)
      .then(() => {
        console.log("✅ THIETBI.LastUserName ready");
      })
      .catch((e) => {
        console.warn("⚠️ Cannot ensure LastUserName column:", e?.message || e);
      });

    // Ensure LastUserId column exists
    await pool
      .request()
      .query(`
        IF COL_LENGTH('dbo.THIETBI','LastUserId') IS NULL
          ALTER TABLE dbo.THIETBI ADD LastUserId VARCHAR(50) NULL;
      `)
      .then(() => {
        console.log("✅ THIETBI.LastUserId ready");
      })
      .catch((e) => {
        console.warn("⚠️ Cannot ensure LastUserId column:", e?.message || e);
      });

    // Ensure LastAssignedDate exists to restore previous assignment date
    await pool
      .request()
      .query(`
        IF COL_LENGTH('dbo.THIETBI','LastAssignedDate') IS NULL
          ALTER TABLE dbo.THIETBI ADD LastAssignedDate DATE NULL;
      `)
      .then(() => console.log('✅ THIETBI.LastAssignedDate ready'))
      .catch((e) => console.warn('⚠️ Cannot ensure LastAssignedDate:', e?.message || e));

    app.listen(PORT, HOST, () =>
      console.log(`🚀 Server chạy tại http://192.168.11.51:${PORT}`)
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
    const msg = String(err.message || "");
    if (msg.includes("UX_THIETBI_SerialSN")) {
      return res.status(409).send("Serial(S/N) đã tồn tại.");
    }
    if (msg.includes("UX_NHANVIEN_Thietbisudung")) {
      return res.status(409).send("Thiết bị đã được gán.");
    }
    return res.status(409).send("Dữ liệu trùng lặp.");
  }
  console.error("SQL error:", err);
  return res.status(500).send(err?.message || "Lỗi máy chủ.");
}

/* ====== TIỆN ÍCH TRA CỨU NGƯỜI DÙNG ====== */
async function findUserByIdOrName(tx, key) {
  if (!key || typeof key !== "string") return null;
  const k = key.trim();
  if (!k) return null;
  // Ưu tiên tra cứu theo MaNV để tránh nhập nhằng khi trùng tên
  let req = new sql.Request(tx);
  req.input("KeyNV", sql.VarChar, k);
  let res = await req.query(
    "SELECT TOP 1 * FROM dbo.NHANVIEN WHERE MaNV=@KeyNV"
  );
  if (res.recordset.length) return res.recordset[0];

  // Fallback theo HoVaTen chỉ khi kết quả DUY NHẤT
  req = new sql.Request(tx);
  req.input("KeyName", sql.NVarChar, k);
  res = await req.query(
    "SELECT * FROM dbo.NHANVIEN WHERE HoVaTen=@KeyName"
  );
  if (res.recordset.length === 1) return res.recordset[0];
  return null; // nếu nhiều hơn 1 hoặc không có, trả null để tránh gán nhầm
}

/* ========== RULES ĐỒNG BỘ ========== */
/*
  Quy ước đồng bộ:
  - Khi THIETBI.Trangthai = 'Bảo Hành' hoặc 'Hư Hỏng' => gỡ gán khỏi NHANVIEN:
      NHANVIEN(Thietbisudung=NULL, Ngaycap=NULL, Trangthai='Chưa cấp'), THIETBI(Nguoisudung=NULL)
  - Chỉ cho phép gán thiết bị cho nhân viên nếu thiết bị đang 'Sẵn sàng' (hoặc đã gán chính nhân viên đó).
  - Khi gỡ gán từ NHANVIEN => THIETBI về 'Sẵn sàng', Nguoisudung=NULL.
*/

/* ========== API /api/devices ========== */

// Lấy danh sách thiết bị
app.get("/api/devices", authenticate, async (_req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM dbo.THIETBI");
    res.json(result.recordset);
  } catch (err) {
    handleSqlError(res, err);
  }
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
  } = req.body || {};

  if (!MaThietBi || !TenThietBi) {
    return res.status(400).send("Thiếu mã hoặc tên thiết bị");
  }

  try {
    const pool = await poolPromise;
    const tx = new sql.Transaction(pool);
    await tx.begin();

    const state = Trangthai || "Sẵn sàng";
    // Nếu tạo mới với trạng thái BH/Hư Hỏng thì không gán user
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
        await tx.rollback();
        return res.status(400).send("Không tìm thấy người dùng tương ứng");
      }
    }

    // Chèn thiết bị, nếu có user thì lưu Nguoisudung theo HoVaTen chuẩn
    await new sql.Request(tx)
      .input("MaThietBi", sql.VarChar, MaThietBi)
      .input("TenThietBi", sql.NVarChar, TenThietBi)
      .input("LoaiThietBi", sql.NVarChar, LoaiThietBi || "")
      .input("SerialSN", sql.VarChar, SerialSN || "")
      .input("NgayNhap", sql.Date, NgayNhap || null)
      .input("Trangthai", sql.NVarChar, state)
      .input(
        "Nguoisudung",
        sql.NVarChar,
        assignedUser ? assignedUser.HoVaTen : null
      )
      .query(
        `INSERT INTO dbo.THIETBI
         (MaThietBi, TenThietBi, LoaiThietBi, SerialSN, NgayNhap, Trangthai, Nguoisudung)
         VALUES (@MaThietBi, @TenThietBi, @LoaiThietBi, @SerialSN, @NgayNhap, @Trangthai, @Nguoisudung)`
      );

    // Nếu có gán user khi tạo (chỉ khi trạng thái không phải BH/Hư Hỏng)
    if (assignedUser) {
      // Giải phóng thiết bị cũ nếu có
      if (
        assignedUser.Thietbisudung &&
        assignedUser.Thietbisudung !== MaThietBi
      ) {
        await new sql.Request(tx)
          .input("PrevDev", sql.VarChar, assignedUser.Thietbisudung)
          .query(
            "UPDATE dbo.THIETBI SET Trangthai=N'Sẵn sàng', Nguoisudung=NULL WHERE MaThietBi=@PrevDev"
          );
      }
      await new sql.Request(tx)
        .input("MaNV", sql.VarChar, assignedUser.MaNV)
        .input("MaThietBi", sql.VarChar, MaThietBi)
        .input("Ngaycap", sql.Date, Ngaycap || null)
        .query(
          "UPDATE dbo.NHANVIEN SET Thietbisudung=@MaThietBi, Ngaycap=COALESCE(@Ngaycap, Ngaycap), Trangthai=N'Đang sử dụng' WHERE MaNV=@MaNV"
        );
    }

    await tx.commit();
    res.send("Thêm thiết bị thành công");
  } catch (err) {
    try {
    } catch {}
    handleSqlError(res, err);
  }
});

// Sửa thiết bị (đồng bộ 2 chiều trong transaction)
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
    MaThietBi: NewMaThietBi,
  } = req.body || {};

  try {
    const pool = await poolPromise;
    const tx = new sql.Transaction(pool);
    await tx.begin();

    const rGet = new sql.Request(tx);
    const dRes = await rGet
      .input("MaThietBi", sql.VarChar, id)
      .query("SELECT TOP 1 * FROM dbo.THIETBI WHERE MaThietBi=@MaThietBi");
    if (!dRes.recordset.length) {
      await tx.rollback();
      return res.status(404).send("Không tìm thấy thiết bị");
    }
    const dev = dRes.recordset[0];

    // Cho phép đổi Mã thiết bị; đ���ng bộ NHANVIEN.Thietbisudung theo
    let targetId = id;
    if (typeof NewMaThietBi !== "undefined" && NewMaThietBi && NewMaThietBi !== id) {
      const existNew = await new sql.Request(tx)
        .input("NewId", sql.VarChar, NewMaThietBi)
        .query("SELECT 1 FROM dbo.THIETBI WHERE MaThietBi=@NewId");
      if (existNew.recordset.length) {
        await tx.rollback();
        return res.status(409).send("Mã thiết bị đã tồn tại.");
      }
      await new sql.Request(tx)
        .input("OldId", sql.VarChar, id)
        .input("NewId", sql.VarChar, NewMaThietBi)
        .query("UPDATE dbo.THIETBI SET MaThietBi=@NewId WHERE MaThietBi=@OldId");
      await new sql.Request(tx)
        .input("OldId", sql.VarChar, id)
        .input("NewId", sql.VarChar, NewMaThietBi)
        .query("UPDATE dbo.NHANVIEN SET Thietbisudung=@NewId WHERE Thietbisudung=@OldId");
      targetId = NewMaThietBi;
    }

    async function updateDevice(finalState, finalUser) {
      await new sql.Request(tx)
        .input("MaThietBi", sql.VarChar, targetId)
        .input("TenThietBi", sql.NVarChar, TenThietBi ?? dev.TenThietBi ?? "")
        .input(
          "LoaiThietBi",
          sql.NVarChar,
          LoaiThietBi ?? dev.LoaiThietBi ?? ""
        )
        .input("SerialSN", sql.VarChar, SerialSN ?? dev.SerialSN ?? "")
        .input("NgayNhap", sql.Date, NgayNhap ?? dev.NgayNhap ?? null)
        .input("Trangthai", sql.NVarChar, finalState)
        .input("Nguoisudung", sql.NVarChar, finalUser ?? null)
        .query(
          `UPDATE dbo.THIETBI SET 
             TenThietBi=@TenThietBi, LoaiThietBi=@LoaiThietBi, SerialSN=@SerialSN,
             NgayNhap=@NgayNhap, Trangthai=@Trangthai, Nguoisudung=@Nguoisudung, LastUserName=COALESCE(@Nguoisudung, LastUserName)
           WHERE MaThietBi=@MaThietBi`
        );
    }

    const wantState =
      typeof Trangthai !== "undefined" && Trangthai ? Trangthai : null;

    // Nếu set trạng thái sang Bảo Hành/Hư Hỏng => gỡ gán user
    if (wantState === "Bảo Hành" || wantState === "Hư Hỏng") {
      // Remember current user (if any) into LastUserId/LastUserName, then clear user on device
      const cu = await new sql.Request(tx)
        .input("DevId", sql.VarChar, targetId)
        .query("SELECT TOP 1 MaNV, HoVaTen, Ngaycap FROM dbo.NHANVIEN WHERE Thietbisudung=@DevId");
      if (cu.recordset.length) {
        const r = cu.recordset[0];
        await new sql.Request(tx)
          .input("MaThietBi", sql.VarChar, targetId)
          .input("LastUserId", sql.VarChar, r.MaNV)
          .input("LastUserName", sql.NVarChar, r.HoVaTen)
          .input("LastAssignedDate", sql.Date, r.Ngaycap || null)
          .query(
            "UPDATE dbo.THIETBI SET LastUserId=@LastUserId, LastUserName=@LastUserName, LastAssignedDate=@LastAssignedDate WHERE MaThietBi=@MaThietBi"
          );
      } else if (dev.Nguoisudung) {
        await new sql.Request(tx)
          .input("MaThietBi", sql.VarChar, targetId)
          .input("LastUserName", sql.NVarChar, dev.Nguoisudung)
          .query(
            "UPDATE dbo.THIETBI SET LastUserName=@LastUserName WHERE MaThietBi=@MaThietBi"
          );
      }
      await updateDevice(wantState, null);
      await new sql.Request(tx)
        .input("DevId", sql.VarChar, targetId)
        .query(
          "UPDATE dbo.NHANVIEN SET Thietbisudung=NULL, Ngaycap=NULL, Trangthai=N'Chưa cấp' WHERE Thietbisudung=@DevId"
        );
      await tx.commit();
      return res.send("Cập nhật thiết bị thành công");
    }

    // Có thay đổi gán người dùng?
    if (typeof Nguoisudung !== "undefined") {
      if (!Nguoisudung) {
        if (wantState === "Đang sử dụng") {
          const prevId = dev.LastUserId || null;
          if (prevId) {
            await updateDevice("Đang sử dụng", dev.Nguoisudung || dev.LastUserName || null);
            await new sql.Request(tx)
              .input("MaNV", sql.VarChar, prevId)
              .input("DevId", sql.VarChar, targetId)
              .input("LastAssignedDate", sql.Date, dev.LastAssignedDate || null)
              .query(
                "UPDATE dbo.NHANVIEN SET Thietbisudung=@DevId, Ngaycap=COALESCE(@LastAssignedDate, Ngaycap, GETDATE()), Trangthai=N'Đang sử dụng' WHERE MaNV=@MaNV"
              );
            await new sql.Request(tx)
              .input("DevId", sql.VarChar, targetId)
              .input("MaNV", sql.VarChar, prevId)
              .query("UPDATE dbo.THIETBI SET LastUserId=@MaNV WHERE MaThietBi=@DevId");
          } else {
            const prevName = dev.Nguoisudung || dev.LastUserName || null;
            if (prevName) {
              await updateDevice("Đang sử dụng", prevName);
              const prevUser = await findUserByIdOrName(tx, String(prevName));
              if (prevUser) {
                await new sql.Request(tx)
                  .input("MaNV", sql.VarChar, prevUser.MaNV)
                  .input("DevId", sql.VarChar, targetId)
                  .input("LastAssignedDate", sql.Date, dev.LastAssignedDate || null)
                  .query(
                    "UPDATE dbo.NHANVIEN SET Thietbisudung=@DevId, Ngaycap=COALESCE(@LastAssignedDate, Ngaycap, GETDATE()), Trangthai=N'Đang sử dụng' WHERE MaNV=@MaNV"
                  );
                await new sql.Request(tx)
                  .input("DevId", sql.VarChar, targetId)
                  .input("MaNV", sql.VarChar, prevUser.MaNV)
                  .query("UPDATE dbo.THIETBI SET LastUserId=@MaNV WHERE MaThietBi=@DevId");
              } else {
                // Không tìm được người theo tên => không thay đổi NHANVIEN
              }
            } else {
              // Không có thông tin người trước đó => đưa về Sẵn sàng
              await updateDevice("Sẵn sàng", null);
            }
          }
        } else {
          // Bỏ gán => thiết bị về Sẵn sàng, nhân viên (nếu có) về Chưa cấp
          await updateDevice("Sẵn sàng", null);
          await new sql.Request(tx)
            .input("DevId", sql.VarChar, targetId)
            .query(
              "UPDATE dbo.NHANVIEN SET Thietbisudung=NULL, Ngaycap=NULL, Trangthai=N'Chưa cấp' WHERE Thietbisudung=@DevId"
            );
        }
      } else {
        // Hỗ trợ gán theo MaNV hoặc HoVaTen
        const user = await findUserByIdOrName(tx, String(Nguoisudung));
        if (!user) {
          await tx.rollback();
          return res.status(400).send("Không tìm thấy người dùng tương ứng");
        }

        // Không cho gán nếu thiết bị đang BH/Hư Hỏng
        if (dev.Trangthai === "Bảo Hành" || dev.Trangthai === "Hư Hỏng") {
          await tx.rollback();
          return res
            .status(409)
            .send("Thiết bị không sẵn sàng (Bảo Hành/Hư Hỏng)");
        }

        // Giải phóng user khác đang giữ thiết bị này (nếu có)
        await new sql.Request(tx)
          .input("DevId", sql.VarChar, targetId)
          .input("MaNV", sql.VarChar, user.MaNV)
          .query(
            "UPDATE dbo.NHANVIEN SET Thietbisudung=NULL, Ngaycap=NULL, Trangthai=N'Chưa cấp' WHERE Thietbisudung=@DevId AND MaNV<>@MaNV"
          );

        // Nếu user này đang giữ thiết bị khác => trả về Sẵn sàng
        if (user.Thietbisudung && user.Thietbisudung !== targetId) {
          await new sql.Request(tx)
            .input("PrevDev", sql.VarChar, user.Thietbisudung)
            .query(
              "UPDATE dbo.THIETBI SET Trangthai=N'Sẵn sàng', Nguoisudung=NULL WHERE MaThietBi=@PrevDev"
            );
        }

        // Gán cho user này
        await new sql.Request(tx)
        .input("MaNV", sql.VarChar, user.MaNV)
        .input("MaThietBi", sql.VarChar, targetId)
        .input("Ngaycap", sql.Date, Ngaycap || null)
        .query(
        "UPDATE dbo.NHANVIEN SET Thietbisudung=@MaThietBi, Ngaycap=COALESCE(@Ngaycap, Ngaycap, GETDATE()), Trangthai=N'Đang sử dụng' WHERE MaNV=@MaNV"
        );
        
        await updateDevice("Đang sử dụng", user.HoVaTen);
        await new sql.Request(tx)
        .input("DevId", sql.VarChar, targetId)
        .input("MaNV", sql.VarChar, user.MaNV)
        .query("UPDATE dbo.THIETBI SET LastUserId=@MaNV WHERE MaThietBi=@DevId");
      }
    } else {
      // Không đổi người dùng, chỉ cập nhật thông tin cơ bản/trạng thái
      const finalState =
        wantState ?? (dev.Nguoisudung ? "Đang sử dụng" : "Sẵn sàng");

      if (finalState === "Sẵn sàng") {
        await updateDevice("Sẵn sàng", null);
        await new sql.Request(tx)
          .input("DevId", sql.VarChar, targetId)
          .query(
            "UPDATE dbo.NHANVIEN SET Thietbisudung=NULL, Ngaycap=NULL, Trangthai=N'Chưa cấp' WHERE Thietbisudung=@DevId"
          );
      } else if (finalState === "Đang sử dụng") {
        const prevId = dev.LastUserId || null;
        if (prevId) {
          // restore strictly by MaNV
          await updateDevice("Đang sử dụng", dev.Nguoisudung || dev.LastUserName || null);
          await new sql.Request(tx)
            .input("MaNV", sql.VarChar, prevId)
            .input("DevId", sql.VarChar, targetId)
            .input("LastAssignedDate", sql.Date, dev.LastAssignedDate || null)
            .query(
              "UPDATE dbo.NHANVIEN SET Thietbisudung=@DevId, Ngaycap=COALESCE(@LastAssignedDate, Ngaycap, GETDATE()), Trangthai=N'Đang sử dụng' WHERE MaNV=@MaNV"
            );
          await new sql.Request(tx)
            .input("DevId", sql.VarChar, targetId)
            .input("MaNV", sql.VarChar, prevId)
            .query("UPDATE dbo.THIETBI SET LastUserId=@MaNV WHERE MaThietBi=@DevId");
        } else {
          const prevName = dev.Nguoisudung || dev.LastUserName || null;
          if (prevName) {
            await updateDevice("Đang sử dụng", prevName);
            const prevUser = await findUserByIdOrName(tx, String(prevName));
            if (prevUser) {
              await new sql.Request(tx)
                .input("MaNV", sql.VarChar, prevUser.MaNV)
                .input("DevId", sql.VarChar, targetId)
                .input("LastAssignedDate", sql.Date, dev.LastAssignedDate || null)
                .query(
                  "UPDATE dbo.NHANVIEN SET Thietbisudung=@DevId, Ngaycap=COALESCE(@LastAssignedDate, Ngaycap, GETDATE()), Trangthai=N'Đang sử dụng' WHERE MaNV=@MaNV"
                );
              await new sql.Request(tx)
                .input("DevId", sql.VarChar, targetId)
                .input("MaNV", sql.VarChar, prevUser.MaNV)
                .query("UPDATE dbo.THIETBI SET LastUserId=@MaNV WHERE MaThietBi=@DevId");
            } else {
              await new sql.Request(tx)
                .input("DevId", sql.VarChar, targetId)
                .query(
                  "UPDATE dbo.NHANVIEN SET Trangthai=N'Đang sử dụng' WHERE Thietbisudung=@DevId"
                );
            }
          } else {
            await updateDevice("Đang sử dụng", dev.Nguoisudung);
          }
        }
      } else {
        await updateDevice(finalState, dev.Nguoisudung);
      }
    }

    await tx.commit();
    res.send("Cập nhật thiết bị thành công");
  } catch (err) {
    try {
    } catch {}
    handleSqlError(res, err);
  }
});

// Xóa thiết bị (gỡ gán nhân viên trước khi xóa)
app.delete(
  "/api/devices/:id",
  authenticate,
  authorizeAdmin,
  async (req, res) => {
    try {
      const pool = await poolPromise;
      const tx = new sql.Transaction(pool);
      await tx.begin();

      await new sql.Request(tx)
        .input("DevId", sql.VarChar, req.params.id)
        .query(
          "UPDATE dbo.NHANVIEN SET Thietbisudung=NULL, Ngaycap=NULL, Trangthai=N'Chưa cấp' WHERE Thietbisudung=@DevId"
        );

      await new sql.Request(tx)
        .input("MaThietBi", sql.VarChar, req.params.id)
        .query("DELETE FROM dbo.THIETBI WHERE MaThietBi=@MaThietBi");

      await tx.commit();
      res.send("Xóa thiết bị thành công");
    } catch (err) {
      handleSqlError(res, err);
    }
  }
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

// Gán/bỏ gán thiết bị cho người dùng (transactional)
app.post("/api/assign", authenticate, async (req, res) => {
  const { MaNV, MaThietBi, Ngaycap } = req.body || {};
  if (!MaNV) return res.status(400).send("Thiếu MaNV");
  try {
    const pool = await poolPromise;
    const tx = new sql.Transaction(pool);
    await tx.begin();

    const uRes = await new sql.Request(tx)
      .input("MaNV", sql.VarChar, MaNV)
      .query("SELECT TOP 1 * FROM dbo.NHANVIEN WHERE MaNV=@MaNV");
    if (!uRes.recordset.length) {
      await tx.rollback();
      return res.status(404).send("Không tìm thấy nhân viên");
    }
    const user = uRes.recordset[0];

    if (!MaThietBi) {
      // Bỏ gán
      if (user.Thietbisudung) {
        await new sql.Request(tx)
          .input("DevId", sql.VarChar, user.Thietbisudung)
          .query(
            "UPDATE dbo.THIETBI SET Trangthai=N'Sẵn sàng', Nguoisudung=NULL WHERE MaThietBi=@DevId"
          );
      }
      await new sql.Request(tx)
        .input("MaNV", sql.VarChar, MaNV)
        .query(
          "UPDATE dbo.NHANVIEN SET Thietbisudung=NULL, Ngaycap=NULL, Trangthai=N'Chưa cấp' WHERE MaNV=@MaNV"
        );
      await tx.commit();
      return res.send("Bỏ gán thiết bị thành công");
    } else {
      // Gán mới
      const dRes = await new sql.Request(tx)
        .input("MaThietBi", sql.VarChar, MaThietBi)
        .query("SELECT TOP 1 * FROM dbo.THIETBI WHERE MaThietBi=@MaThietBi");
      if (!dRes.recordset.length) {
        await tx.rollback();
        return res.status(404).send("Không tìm thấy thiết bị");
      }
      const dev = dRes.recordset[0];

      if (dev.Trangthai === "Bảo Hành" || dev.Trangthai === "Hư Hỏng") {
        await tx.rollback();
        return res
          .status(409)
          .send("Thiết bị không sẵn sàng (Bảo Hành/Hư Hỏng)");
      }

      if (
        dev.Trangthai === "Đang sử dụng" &&
        dev.Nguoisudung &&
        dev.Nguoisudung !== user.HoVaTen
      ) {
        await tx.rollback();
        return res.status(409).send("Thiết bị đang được sử dụng");
      }

      if (user.Thietbisudung && user.Thietbisudung !== MaThietBi) {
        await new sql.Request(tx)
          .input("PrevDev", sql.VarChar, user.Thietbisudung)
          .query(
            "UPDATE dbo.THIETBI SET Trangthai=N'Sẵn sàng', Nguoisudung=NULL WHERE MaThietBi=@PrevDev"
          );
      }

      await new sql.Request(tx)
        .input("MaNV", sql.VarChar, MaNV)
        .input("MaThietBi", sql.VarChar, MaThietBi)
        .input("Ngaycap", sql.Date, Ngaycap || null)
        .query(
          "UPDATE dbo.NHANVIEN SET Thietbisudung=@MaThietBi, Ngaycap=@Ngaycap, Trangthai=N'Đang sử dụng' WHERE MaNV=@MaNV"
        );

      await new sql.Request(tx)
        .input("MaThietBi", sql.VarChar, MaThietBi)
        .input("Nguoisudung", sql.NVarChar, user.HoVaTen)
        .input("MaNV", sql.VarChar, MaNV)
        .query(
          "UPDATE dbo.THIETBI SET Trangthai=N'Đang sử dụng', Nguoisudung=@Nguoisudung, LastUserName=@Nguoisudung, LastUserId=@MaNV WHERE MaThietBi=@MaThietBi"
        );

      await tx.commit();
      return res.send("Gán thiết bị thành công");
    }
  } catch (err) {
    try {
    } catch {}
    return handleSqlError(res, err);
  }
});

// Thêm nhân viên
app.post("/api/users", authenticate, async (req, res) => {
  const { MaNV, HoVaTen, Phongban, Thietbisudung, Ngaycap, Trangthai } =
    req.body || {};

  if (!MaNV || !HoVaTen) {
    return res.status(400).send("Thiếu mã hoặc họ tên nhân viên");
  }

  let tx;
  try {
    const pool = await poolPromise;
    tx = new sql.Transaction(pool);
    await tx.begin();

    // Kiểm tra trùng Mã NV trước khi chèn để trả lỗi rõ ràng và tránh lock/timeout
    const exists = await new sql.Request(tx)
      .input("MaNV", sql.VarChar, MaNV)
      .query("SELECT 1 FROM dbo.NHANVIEN WHERE MaNV=@MaNV");
    if (exists.recordset.length) {
      await tx.rollback();
      return res.status(409).send("Mã nhân viên đã tồn tại.");
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
        Trangthai || (Thietbisudung ? "Đang sử dụng" : "Chưa cấp")
      )
      .query(
        `INSERT INTO dbo.NHANVIEN
        (MaNV, HoVaTen, Phongban, Thietbisudung, Ngaycap, Trangthai)
        VALUES (@MaNV, @HoVaTen, @Phongban, @Thietbisudung, @Ngaycap, @Trangthai)`
      );

    // Nếu tạo mới đã gán thiết bị hợp lệ thì đồng bộ thiết bị
    if (Thietbisudung) {
      const dRes = await new sql.Request(tx)
        .input("MaThietBi", sql.VarChar, Thietbisudung)
        .query("SELECT TOP 1 * FROM dbo.THIETBI WHERE MaThietBi=@MaThietBi");
      if (!dRes.recordset.length) {
        await tx.rollback();
        return res.status(404).send("Không tìm thấy thiết bị");
      }
      const dev = dRes.recordset[0];
      if (dev.Trangthai === "Bảo Hành" || dev.Trangthai === "Hư Hỏng") {
        await tx.rollback();
        return res
          .status(409)
          .send("Thiết bị không sẵn sàng (Bảo Hành/Hư Hỏng)");
      }
      if (
        dev.Trangthai === "Đang sử dụng" &&
        dev.Nguoisudung &&
        dev.Nguoisudung !== HoVaTen
      ) {
        await tx.rollback();
        return res.status(409).send("Thiết bị đang được sử dụng");
      }
      await new sql.Request(tx)
        .input("MaThietBi", sql.VarChar, Thietbisudung)
        .input("Nguoisudung", sql.NVarChar, HoVaTen)
        .input("MaNV", sql.VarChar, MaNV)
        .query(
          "UPDATE dbo.THIETBI SET Trangthai=N'Đang sử dụng', Nguoisudung=@Nguoisudung, LastUserName=@Nguoisudung, LastUserId=@MaNV WHERE MaThietBi=@MaThietBi"
        );
    }

    await tx.commit();
    res.send("Thêm nhân viên thành công");
  } catch (err) {
    try {
      if (tx) await tx.rollback();
    } catch (_) {}
    if (err && (err.number === 2627 || err.number === 2601)) {
      return res.status(409).send("Mã nhân viên đã tồn tại.");
    }
    handleSqlError(res, err);
  }
});

// Sửa nhân viên (đồng bộ 2 chiều trong transaction)
app.put("/api/users/:id", authenticate, authorizeAdmin, async (req, res) => {
  const { id } = req.params;
  const { HoVaTen, Phongban, Thietbisudung, Ngaycap, MaNV: NewMaNV } = req.body || {};

  try {
    const pool = await poolPromise;
    const tx = new sql.Transaction(pool);
    await tx.begin();

    const uRes = await new sql.Request(tx)
      .input("MaNV", sql.VarChar, id)
      .query("SELECT TOP 1 * FROM dbo.NHANVIEN WHERE MaNV=@MaNV");
    if (!uRes.recordset.length) {
      await tx.rollback();
      return res.status(404).send("Không tìm thấy nhân viên");
    }
    const curr = uRes.recordset[0];

    // Cho phép đổi Mã NV nếu gửi từ UI
    let targetId = id;
    if (typeof NewMaNV !== "undefined" && NewMaNV && NewMaNV !== id) {
      const existsNew = await new sql.Request(tx)
        .input("NewMaNV", sql.VarChar, NewMaNV)
        .query("SELECT 1 FROM dbo.NHANVIEN WHERE MaNV=@NewMaNV");
      if (existsNew.recordset.length) {
        await tx.rollback();
        return res.status(409).send("Mã nhân viên đã tồn tại.");
      }
      await new sql.Request(tx)
        .input("OldMaNV", sql.VarChar, id)
        .input("NewMaNV", sql.VarChar, NewMaNV)
        .query("UPDATE dbo.NHANVIEN SET MaNV=@NewMaNV WHERE MaNV=@OldMaNV");
      targetId = NewMaNV;
    }

    // Cập nhật thông tin cơ bản
    await new sql.Request(tx)
      .input("MaNV", sql.VarChar, targetId)
      .input("HoVaTen", sql.NVarChar, HoVaTen ?? curr.HoVaTen ?? "")
      .input("Phongban", sql.NVarChar, Phongban ?? curr.Phongban ?? "")
      .query(
        `UPDATE dbo.NHANVIEN SET HoVaTen=@HoVaTen, Phongban=@Phongban WHERE MaNV=@MaNV`
      );

    const newName = HoVaTen ?? curr.HoVaTen;

    if (typeof Thietbisudung !== "undefined") {
      const newDevId = Thietbisudung || null;
      const prevDevId = curr.Thietbisudung || null;

      if (!newDevId) {
        // Bỏ gán
        if (prevDevId) {
          await new sql.Request(tx)
            .input("PrevDev", sql.VarChar, prevDevId)
            .query(
              "UPDATE dbo.THIETBI SET Trangthai=N'Sẵn sàng', Nguoisudung=NULL WHERE MaThietBi=@PrevDev"
            );
        }
        // Cho phép cập nhật Ngày cấp n��u có gửi từ UI, ngay cả khi không có thiết bị
        await new sql.Request(tx)
          .input("MaNV", sql.VarChar, targetId)
          .input("Ngaycap", sql.Date, Ngaycap || null)
          .query(
            "UPDATE dbo.NHANVIEN SET Thietbisudung=NULL, Ngaycap=ISNULL(@Ngaycap, Ngaycap), Trangthai=N'Chưa cấp' WHERE MaNV=@MaNV"
          );
      } else {
        // Gán mới
        const dRes = await new sql.Request(tx)
          .input("MaThietBi", sql.VarChar, newDevId)
          .query("SELECT TOP 1 * FROM dbo.THIETBI WHERE MaThietBi=@MaThietBi");
        if (!dRes.recordset.length) {
          await tx.rollback();
          return res.status(404).send("Không tìm thấy thiết bị");
        }
        const dev = dRes.recordset[0];

        if (dev.Trangthai === "Bảo Hành" || dev.Trangthai === "Hư Hỏng") {
          await tx.rollback();
          return res
            .status(409)
            .send("Thiết bị không sẵn sàng (Bảo Hành/Hư Hỏng)");
        }

        if (prevDevId && prevDevId !== newDevId) {
          await new sql.Request(tx)
            .input("PrevDev", sql.VarChar, prevDevId)
            .query(
              "UPDATE dbo.THIETBI SET Trangthai=N'Sẵn sàng', Nguoisudung=NULL WHERE MaThietBi=@PrevDev"
            );
        }

        await new sql.Request(tx)
          .input("MaNV", sql.VarChar, targetId)
          .input("MaThietBi", sql.VarChar, newDevId)
          .input("Ngaycap", sql.Date, Ngaycap || null)
          .query(
            "UPDATE dbo.NHANVIEN SET Thietbisudung=@MaThietBi, Ngaycap=@Ngaycap, Trangthai=N'Đang sử dụng' WHERE MaNV=@MaNV"
          );

        await new sql.Request(tx)
          .input("MaThietBi", sql.VarChar, newDevId)
          .input("Nguoisudung", sql.NVarChar, newName)
          .input("MaNV", sql.VarChar, targetId)
          .query(
            "UPDATE dbo.THIETBI SET Trangthai=N'Đang sử dụng', Nguoisudung=@Nguoisudung, LastUserName=@Nguoisudung, LastUserId=@MaNV WHERE MaThietBi=@MaThietBi"
          );
      }
    } else {
      // Cập nhật Ngày cấp nếu có gửi từ UI, ngay cả khi không đổi thiết bị
      if (typeof Ngaycap !== "undefined") {
        await new sql.Request(tx)
          .input("MaNV", sql.VarChar, targetId)
          .input("Ngaycap", sql.Date, Ngaycap || null)
          .query("UPDATE dbo.NHANVIEN SET Ngaycap=@Ngaycap WHERE MaNV=@MaNV");
      }
      // Không thay đổi gán, nếu ��ổi tên và đang giữ thiết bị thì cập nhật lại tên trên THIETBI
      if (curr.Thietbisudung && newName && newName !== curr.HoVaTen) {
        await new sql.Request(tx)
          .input("MaThietBi", sql.VarChar, curr.Thietbisudung)
          .input("Nguoisudung", sql.NVarChar, newName)
          .query(
            "UPDATE dbo.THIETBI SET Nguoisudung=@Nguoisudung WHERE MaThietBi=@MaThietBi"
          );
      }
    }

    await tx.commit();
    res.send("Cập nhật nhân viên thành công");
  } catch (err) {
    try {
    } catch {}
    handleSqlError(res, err);
  }
});

// Xóa nhân viên (trả thiết bị về Sẵn sàng)
app.delete("/api/users/:id", authenticate, authorizeAdmin, async (req, res) => {
  try {
    const pool = await poolPromise;
    const tx = new sql.Transaction(pool);
    await tx.begin();

    const uRes = await new sql.Request(tx)
      .input("MaNV", sql.VarChar, req.params.id)
      .query("SELECT TOP 1 * FROM dbo.NHANVIEN WHERE MaNV=@MaNV");
    if (uRes.recordset.length) {
      const u = uRes.recordset[0];
      if (u.Thietbisudung) {
        await new sql.Request(tx)
          .input("DevId", sql.VarChar, u.Thietbisudung)
          .query(
            "UPDATE dbo.THIETBI SET Trangthai=N'Sẵn sàng', Nguoisudung=NULL WHERE MaThietBi=@DevId"
          );
      }
    }

    await new sql.Request(tx)
      .input("MaNV", sql.VarChar, req.params.id)
      .query("DELETE FROM dbo.NHANVIEN WHERE MaNV=@MaNV");

    await tx.commit();
    res.send("Xóa nhân viên thành công");
  } catch (err) {
    handleSqlError(res, err);
  }
});

// PUBLIC API cho QR: lấy thông tin thiết bị theo mã (không yêu cầu đăng nhập)
app.get("/public/devices/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const r = await pool
      .request()
      .input("MaThietBi", sql.VarChar, req.params.id)
      .query("SELECT TOP 1 * FROM dbo.THIETBI WHERE MaThietBi=@MaThietBi");
    if (!r.recordset.length) return res.status(404).send("Không tìm thấy");
    res.json(r.recordset[0]);
  } catch (err) {
    handleSqlError(res, err);
  }
});
