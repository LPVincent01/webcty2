const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const sql = require("mssql/msnodesqlv8");

const app = express();
const port = 3000;

// Cấu hình kết nối SQL Server
const config = {
  server: "DESKTOP-A8PDRAJ\\BARTENDER",
  database: "QuanlyThietBi",
  driver: "msnodesqlv8",
  options: {
    trustedConnection: true,
  },
};

// Middleware
app.use(bodyParser.json());
app.use(express.static("public"));
app.use(
  cors({
    origin: "http://localhost:5500", // Hoặc port của frontend
    methods: ["GET", "POST", "PUT", "DELETE"],
  })
);

// API Thiết bị - Đã điều chỉnh theo cấu trúc bảng
app.get("/api/devices", async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query("SELECT * FROM THIETBI");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    pool.close(); // Đóng kết nối khi hoàn thành
  }
});

app.post("/api/devices", async (req, res) => {
  try {
    const {
      MaThietBi,
      TenThietBi,
      LoaiThietBi,
      SerialSN,
      NgayNhap,
      Trangthai,
      Nguoisudung,
    } = req.body;

    const pool = await sql.connect(config);
    await pool
      .request()
      .input("MaThietBi", sql.VarChar(20), MaThietBi)
      .input("TenThietBi", sql.NVarChar(100), TenThietBi)
      .input("LoaiThietBi", sql.NVarChar(50), LoaiThietBi)
      .input("SerialSN", sql.VarChar(50), SerialSN)
      .input("NgayNhap", sql.Date, NgayNhap)
      .input("Trangthai", sql.NVarChar(50), Trangthai)
      .input("Nguoisudung", sql.NVarChar(50), Nguoisudung).query(`
        INSERT INTO THIETBI 
        (MaThietBi, TenThietBi, LoaiThietBi, SerialSN, NgayNhap, Trangthai, Nguoisudung)
        VALUES 
        (@MaThietBi, @TenThietBi, @LoaiThietBi, @SerialSN, @NgayNhap, @Trangthai, @Nguoisudung)
      `);
    console.log(`Đã thêm nhân viên ${MaNV} vào database`);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({
      error: err.message,
      details: err.originalError?.info?.message,
    });
  } finally {
    pool.close(); // Đóng kết nối khi hoàn thành
  }
});

// API cập nhật thiết bị
app.put("/api/devices/:MaThietBi", async (req, res) => {
  try {
    const { MaThietBi } = req.params;
    const {
      TenThietBi,
      LoaiThietBi,
      SerialSN,
      NgayNhap,
      Trangthai,
      Nguoisudung,
    } = req.body;

    const pool = await sql.connect(config);
    await pool
      .request()
      .input("MaThietBi", sql.VarChar(20), MaThietBi)
      .input("TenThietBi", sql.NVarChar(100), TenThietBi)
      .input("LoaiThietBi", sql.NVarChar(50), LoaiThietBi)
      .input("SerialSN", sql.VarChar(50), SerialSN)
      .input("NgayNhap", sql.Date, NgayNhap)
      .input("Trangthai", sql.NVarChar(50), Trangthai)
      .input("Nguoisudung", sql.NVarChar(50), Nguoisudung).query(`
        UPDATE THIETBI SET
            MaThietBi = @MaThietBi,
            TenThietBi = @TenThietBi,
            LoaiThietBi = @LoaiThietBi,
            SerialSN = @SerialSN,
            NgayNhap = @NgayNhap,
            Trangthai = @Trangthai,
            Nguoisudung = @Nguoisudung
        WHERE MaThietBi = @MaThietBi
      `);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    pool.close(); // Đóng kết nối khi hoàn thành
  }
});
// THÊM DELETE DEVICE Ở ĐÂY
app.delete("/api/devices/:MaThietBi", async (req, res) => {
  try {
    const { MaThietBi } = req.params;
    const pool = await sql.connect(config);
    const checkUsage = await pool
      .request()
      .input("MaThietBi", sql.VarChar(20), MaThietBi)
      .query(
        "SELECT COUNT(*) AS count FROM NHANVIEN WHERE MaThietBi = @MaThietBi"
      ); // Sửa deviceId thành MaThietBi nếu cần

    if (checkUsage.recordset[0].count > 0) {
      return res
        .status(400)
        .json({ error: "Thiết bị đang được sử dụng, không thể xóa" });
    }

    await pool
      .request()
      .input("MaThietBi", sql.VarChar(20), MaThietBi)
      .query("DELETE FROM THIETBI WHERE MaThietBi = @MaThietBi");

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    pool.close(); // Đóng kết nối khi hoàn thành
  }
});
// API NHÂN VIÊN (USERS)
// Lấy danh sách nhân viên
app.get("/api/users", async (req, res) => {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query("SELECT * FROM NHANVIEN");
    res.json(result.recordset);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    pool.close(); // Đóng kết nối khi hoàn thành
  }
});

// Thêm nhân viên mới
app.post("/api/users", async (req, res) => {
  try {
    const { MaNV, HoVaTen, Phongban, Thietbisudung, Ngaycap, Trangthai } =
      req.body;
    const pool = await sql.connect(config);

    await pool
      .request()
      .input("MaNV", sql.VarChar(50), MaNV)
      .input("HoVaTen", sql.NVarChar(50), HoVaTen)
      .input("Phongban", sql.NVarChar(50), Phongban)
      .input("Thietbisudung", sql.VarChar(50), Thietbisudung)
      .input("Ngaycap", sql.Date, Ngaycap)
      .input("Trangthai", sql.NVarChar(20), Trangthai).query(`
        INSERT INTO NHANVIEN (MaNV, HoVaTen, Phongban, Thietbisudung, Ngaycap, Trangthai)
        VALUES (@MaNV, @HoVaTen, @Phongban, @Thietbisudung, @Ngaycap, @Trangthai)
      `);
    console.log(`Đã thêm nhân viên ${MaNV} vào database`);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    pool.close(); // Đóng kết nối khi hoàn thành
  }
});

// Cập nhật nhân viên
app.put("/api/users/:MaNV", async (req, res) => {
  try {
    const { MaNV } = req.params;
    const { HoVaTen, Phongban, Thietbisudung, Ngaycap, Trangthai } = req.body;
    const pool = await sql.connect(config);

    await pool
      .request()
      .input("MaNV", sql.VarChar(50), MaNV)
      .input("HoVaTen", sql.NVarChar(50), HoVaTen)
      .input("Phongban", sql.NVarChar(50), Phongban)
      .input("Thietbisudung", sql.VarChar(50), Thietbisudung)
      .input("Ngaycap", sql.Date, Ngaycap)
      .input("Trangthai", sql.NVarChar(20), Trangthai).query(`
        UPDATE NHANVIEN SET
          MaNV = @MaNV,
          HoVaTen = @HoVaTen,
          Phongban = @Phongban,
          Thietbisudung = @Thietbisudung,
          Ngaycap = @Ngaycap,
          Trangthai = @Trangthai
        WHERE MaNV = @MaNV
      `);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    pool.close(); // Đóng kết nối khi hoàn thành
  }
});

// Xóa nhân viên
app.delete("/api/users/:MaNV", async (req, res) => {
  try {
    const { MaNV } = req.params;
    const pool = await sql.connect(config);

    // Kiểm tra nếu nhân viên đang sử dụng thiết bị
    const checkDevice = await pool
      .request()
      .input("MaNV", sql.VarChar(50), MaNV)
      .query(
        "SELECT Thietbisudung FROM NHANVIEN WHERE MaNV = @MaNV AND Thietbisudung IS NOT NULL"
      );

    if (checkDevice.recordset.length > 0) {
      return res
        .status(400)
        .json({ error: "Nhân viên đang sử dụng thiết bị, không thể xóa" });
    }

    await pool
      .request()
      .input("MaNV", sql.VarChar(50), MaNV)
      .query("DELETE FROM NHANVIEN WHERE MaNV = @MaNV");

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    pool.close(); // Đóng kết nối khi hoàn thành
  }
});
// Khởi động server
app.listen(port, () => {
  console.log(`Server đang chạy tại http://localhost:${port}`);
});
