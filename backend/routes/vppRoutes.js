const express = require('express');
const sql = require('mssql');
const multer = require('multer');
const xlsx = require('xlsx');

const upload = multer({ storage: multer.memoryStorage() });

module.exports = function (poolPromise, authenticate) {
  const router = express.Router();

  // =============================================
  // DANH MỤC 3 CẤP APIs
  // =============================================

  // Lấy danh sách Loại vật tư (Cấp 1)
  router.get('/danhmuc/cap1', authenticate, async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(`SELECT * FROM dbo.LOAI_VATTU ORDER BY MaCap1`);
      res.json(result.recordset);
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi lấy danh mục cấp 1");
    }
  });

  // Lấy danh sách Sản phẩm (Cấp 2)
  router.get('/danhmuc/cap2', authenticate, async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(`
        SELECT s.Id, s.MaCap2, s.TenCap2, s.LoaiVatTuId, l.MaCap1, l.TenCap1
        FROM dbo.SANPHAM s
        JOIN dbo.LOAI_VATTU l ON s.LoaiVatTuId = l.Id
        ORDER BY s.MaCap2
      `);
      res.json(result.recordset);
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi lấy danh mục cấp 2");
    }
  });

  // Lấy danh sách vật phẩm chi tiết theo Sản phẩm cấp 2
  router.get('/danhmuc/cap2/:maCap2/vatpham', authenticate, async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request()
        .input('MaCap2', sql.NVarChar, req.params.maCap2)
        .query(`
          SELECT v.Id, v.MaCap3, v.TenVPP, v.DonViTinh, v.SanPhamId
          FROM dbo.VANPHONGPHAM v
          JOIN dbo.SANPHAM s ON v.SanPhamId = s.Id
          WHERE s.MaCap2 = @MaCap2
          ORDER BY v.MaCap3
        `);
      res.json(result.recordset);
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi lấy vật phẩm chi tiết");
    }
  });

  // Thêm vật phẩm chi tiết mới (tự sinh mã Cấp 3)
  router.post('/danhmuc/vatpham', authenticate, async (req, res) => {
    const { MaCap2, TenVPP, DonViTinh, GhiChu } = req.body;
    if (!MaCap2 || !TenVPP) return res.status(400).send("Thiếu Mã Sản phẩm hoặc Tên vật phẩm");

    try {
      const pool = await poolPromise;
      
      // 1. Tìm SanPhamId từ MaCap2
      const spResult = await pool.request()
        .input('MaCap2', sql.NVarChar, MaCap2)
        .query(`SELECT Id FROM dbo.SANPHAM WHERE MaCap2 = @MaCap2`);
      
      if (spResult.recordset.length === 0) {
        return res.status(404).send(`Không tìm thấy Sản phẩm với mã ${MaCap2}`);
      }
      const sanPhamId = spResult.recordset[0].Id;

      // 2. Tự sinh mã Cấp 3: Lấy MAX hiện tại
      const maxResult = await pool.request()
        .input('MaCap2Pattern', sql.NVarChar, MaCap2 + '%')
        .query(`SELECT MAX(MaCap3) AS MaxMa FROM dbo.VANPHONGPHAM WHERE MaCap3 LIKE @MaCap2Pattern`);
      
      let nextNumber = 1;
      const maxMa = maxResult.recordset[0].MaxMa;
      if (maxMa) {
        // MaCap2 ví dụ: F0901 (5 ký tự), MaCap3 ví dụ: F0901007 (8 ký tự)
        // Lấy 3 số cuối
        const suffixStr = maxMa.substring(MaCap2.length);
        const suffixNum = parseInt(suffixStr, 10);
        if (!isNaN(suffixNum)) {
          nextNumber = suffixNum + 1;
        }
      }
      
      const newMaCap3 = MaCap2 + String(nextNumber).padStart(3, '0');

      // 3. Insert vào VANPHONGPHAM
      const insertResult = await pool.request()
        .input('MaCap3', sql.NVarChar, newMaCap3)
        .input('TenVPP', sql.NVarChar, TenVPP)
        .input('DonViTinh', sql.NVarChar, DonViTinh || '')
        .input('GhiChu', sql.NVarChar, GhiChu || '')
        .input('SanPhamId', sql.Int, sanPhamId)
        .query(`
          INSERT INTO dbo.VANPHONGPHAM (MaCap3, TenVPP, DonViTinh, GhiChu, SanPhamId)
          OUTPUT INSERTED.Id, INSERTED.MaCap3
          VALUES (@MaCap3, @TenVPP, @DonViTinh, @GhiChu, @SanPhamId)
        `);
      
      res.json({ 
        id: insertResult.recordset[0].Id, 
        MaCap3: insertResult.recordset[0].MaCap3,
        message: "Thêm vật phẩm thành công" 
      });
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi thêm vật phẩm chi tiết");
    }
  });

  // =============================================
  // VPP CRUD APIs (cập nhật MaVPP → MaCap3)
  // =============================================

  // Lấy danh sách Văn phòng phẩm
  router.get('/items', authenticate, async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(`
        SELECT 
          v.Id, v.MaCap3, v.TenVPP, v.DonViTinh, v.GhiChu, v.HinhAnh, v.SanPhamId, v.ThuongHieu, v.NhaCungCap, v.NguonMua,
          ISNULL(n.DonGia, 0) AS DonGia,
          ISNULL(n.VAT, 0) AS VAT,
          CAST(CASE WHEN n.DonGia IS NOT NULL THEN 1 ELSE 0 END AS BIT) AS HasImport,
          s.MaCap2, s.TenCap2
        FROM dbo.VANPHONGPHAM v
        LEFT JOIN dbo.SANPHAM s ON v.SanPhamId = s.Id
        OUTER APPLY (
          SELECT TOP 1 DonGia, VAT
          FROM dbo.NHAP_VPP
          WHERE VppId = v.Id
          ORDER BY NgayNhap DESC
        ) n
        ORDER BY v.Id ASC
      `);
      res.json(result.recordset);
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi lấy danh sách VPP");
    }
  });

  // Lấy danh sách Tồn kho
  router.get('/inventory', authenticate, async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(`
        SELECT 
          t.VppId AS Id, v.MaCap3, v.TenVPP, v.DonViTinh,
          t.SoLuongTon, t.DonGiaTon, t.ThanhTienTon, t.Loai
        FROM dbo.TONKHO_VPP t
        JOIN dbo.V_VATTU v ON t.VppId = v.Id AND t.Loai = v.Loai
        WHERE t.SoLuongTon > 0
        ORDER BY v.MaCap3 ASC
      `);
      res.json(result.recordset);
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi lấy danh sách tồn kho");
    }
  });

  // Thêm mới Văn phòng phẩm (dùng MaCap3 + SanPhamId)
  router.post('/items', authenticate, async (req, res) => {
    const { MaCap2, TenVPP, DonViTinh, GhiChu } = req.body;
    if (!TenVPP) return res.status(400).send("Thiếu Tên Văn phòng phẩm");
    
    try {
      const pool = await poolPromise;
      
      let sanPhamId = null;
      let maCap3 = null;

      // Nếu có MaCap2 (chọn Sản phẩm), tự sinh mã Cấp 3
      if (MaCap2) {
        const spResult = await pool.request()
          .input('MaCap2', sql.NVarChar, MaCap2)
          .query(`SELECT Id FROM dbo.SANPHAM WHERE MaCap2 = @MaCap2`);
        
        if (spResult.recordset.length > 0) {
          sanPhamId = spResult.recordset[0].Id;
          
          // Tự sinh mã Cấp 3
          const maxResult = await pool.request()
            .input('MaCap2Pattern', sql.NVarChar, MaCap2 + '%')
            .query(`SELECT MAX(MaCap3) AS MaxMa FROM dbo.VANPHONGPHAM WHERE MaCap3 LIKE @MaCap2Pattern`);
          
          let nextNumber = 1;
          const maxMa = maxResult.recordset[0].MaxMa;
          if (maxMa) {
            const suffixStr = maxMa.substring(MaCap2.length);
            const suffixNum = parseInt(suffixStr, 10);
            if (!isNaN(suffixNum)) nextNumber = suffixNum + 1;
          }
          maCap3 = MaCap2 + String(nextNumber).padStart(3, '0');
        }
      }

      const result = await pool.request()
        .input('MaCap3', sql.NVarChar, maCap3 || '')
        .input('TenVPP', sql.NVarChar, TenVPP)
        .input('DonViTinh', sql.NVarChar, DonViTinh || '')
        .input('GhiChu', sql.NVarChar, GhiChu || '')
        .input('ThuongHieu', sql.NVarChar, req.body.ThuongHieu || '')
        .input('NhaCungCap', sql.NVarChar, req.body.NhaCungCap || '')
        .input('NguonMua', sql.NVarChar, req.body.NguonMua || 'VN')
        .input('SanPhamId', sql.Int, sanPhamId)
        .query(`
          INSERT INTO dbo.VANPHONGPHAM (MaCap3, TenVPP, DonViTinh, GhiChu, SanPhamId, ThuongHieu, NhaCungCap, NguonMua)
          OUTPUT INSERTED.Id, INSERTED.MaCap3
          VALUES (@MaCap3, @TenVPP, @DonViTinh, @GhiChu, @SanPhamId, @ThuongHieu, @NhaCungCap, @NguonMua)
        `);
      res.json({ id: result.recordset[0].Id, MaCap3: result.recordset[0].MaCap3, message: "Thêm VPP thành công" });
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi thêm VPP");
    }
  });

  // Cập nhật Hình ảnh
  router.put('/items/:id/image', authenticate, express.json({limit: '10mb'}), async (req, res) => {
    const { HinhAnh } = req.body;
    try {
      const pool = await poolPromise;
      await pool.request()
        .input('Id', sql.Int, req.params.id)
        .input('HinhAnh', sql.VarChar(sql.MAX), HinhAnh || '')
        .query(`UPDATE dbo.VANPHONGPHAM SET HinhAnh = @HinhAnh WHERE Id = @Id`);
      res.send("Cập nhật hình ảnh thành công");
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi cập nhật hình ảnh");
    }
  });

  // Cập nhật thông tin chung VPP
  router.put('/items/:id', authenticate, express.json({limit: '10mb'}), async (req, res) => {
    const { TenVPP, DonViTinh, HinhAnh, DonGia, VAT } = req.body;
    try {
      const pool = await poolPromise;
      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        await transaction.request()
          .input('Id', sql.Int, req.params.id)
          .input('TenVPP', sql.NVarChar, TenVPP)
          .input('DonViTinh', sql.NVarChar, DonViTinh || '')
          .input('HinhAnh', sql.VarChar(sql.MAX), HinhAnh || '')
          .input('ThuongHieu', sql.NVarChar, req.body.ThuongHieu || '')
          .input('NhaCungCap', sql.NVarChar, req.body.NhaCungCap || '')
          .input('GhiChu', sql.NVarChar, req.body.GhiChu || '')
          .query(`
            UPDATE dbo.VANPHONGPHAM 
            SET TenVPP = @TenVPP, DonViTinh = @DonViTinh, HinhAnh = @HinhAnh,
                ThuongHieu = @ThuongHieu, NhaCungCap = @NhaCungCap, GhiChu = @GhiChu
            WHERE Id = @Id
          `);

        // Update newest NHAP_VPP if present
        if (DonGia !== undefined && VAT !== undefined) {
          await transaction.request()
            .input('Id', sql.Int, req.params.id)
            .input('DonGia', sql.Float, parseFloat(DonGia) || 0)
            .input('VAT', sql.Float, parseFloat(VAT) || 0)
            .query(`
              WITH LatestNhap AS (
                SELECT TOP 1 DonGia, VAT
                FROM dbo.NHAP_VPP
                WHERE VppId = @Id
                ORDER BY NgayNhap DESC
              )
              UPDATE LatestNhap SET DonGia = @DonGia, VAT = @VAT;
            `);
        }
        await transaction.commit();
        res.send("Cập nhật thông tin thành công");
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi cập nhật VPP");
    }
  });

  // Xóa VPP
  router.delete('/items/:id', authenticate, async (req, res) => {
    try {
      const pool = await poolPromise;
      // Ktra xem có lịch sử nhập/xuất không
      const check = await pool.request()
        .input('Id', sql.Int, req.params.id)
        .query(`
          SELECT 
            (SELECT COUNT(*) FROM dbo.NHAP_VPP WHERE VppId = @Id) + 
            (SELECT COUNT(*) FROM dbo.XUAT_VPP WHERE VppId = @Id) AS Total
        `);
      
      if (check.recordset[0].Total > 0) {
        return res.status(400).send("Không thể xóa do đã có phát sinh nhập/xuất");
      }

      await pool.request()
        .input('Id', sql.Int, req.params.id)
        .query(`DELETE FROM dbo.VANPHONGPHAM WHERE Id = @Id`);
      res.send("Xóa thành công");
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi xóa VPP");
    }
  });

  // Lưu Phiếu Nhập VPP (Nhiều dòng cùng lúc)
  router.post('/import', authenticate, async (req, res) => {
    const { items } = req.body; // Array of items
    const user = req.user ? req.user.username : 'Unknown';

    if (!items || !items.length) {
      return res.status(400).send("Không có dữ liệu nhập");
    }

    try {
      const pool = await poolPromise;
      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        
        const vppIds = items.map(i => i.VppId).filter(id => id != null && id !== '');
        let nguonMuaPrefix = 'FVN';
        let nguonMua = 'VN';
        if (vppIds.length > 0) {
          const idList = vppIds.join(',');
          const sourceCheck = await pool.request().query(`SELECT DISTINCT NguonMua FROM dbo.V_VATTU WHERE Id IN (${idList})`);
          if (sourceCheck.recordset.length > 1) {
             return res.status(400).send("Không thể tạo chung phiếu cho vật tư VN và CN. Vui lòng tách 2 phiếu riêng.");
          }
          if (sourceCheck.recordset.length === 1) {
             nguonMua = sourceCheck.recordset[0].NguonMua || 'VN';
             nguonMuaPrefix = (nguonMua === 'CN') ? 'FCN' : 'FVN';
          }
        }
        
        const today = new Date();
        const dateStr = today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');
        const todayYMD = today.toISOString().slice(0, 10);
        const countResult = await pool.request().input('Today', sql.Date, todayYMD).query(`SELECT COUNT(DISTINCT MaDon) AS Cnt FROM dbo.NHAP_VPP`);
        const nextNum = String(countResult.recordset[0].Cnt + 1).padStart(3, '0');
        const maDon = nguonMuaPrefix + nextNum + 'A-' + dateStr;
        
        const request = new sql.Request(transaction);


        for (let item of items) {
          // 1. Nếu chưa có VppId, tức là thêm mới VPP luôn từ form nhập
          let vppId = item.VppId;
          if (!vppId) {
             const vppInsert = await request
              .input('TenVPP', sql.NVarChar, item.TenVPP)
              .input('DonViTinh', sql.NVarChar, item.DonViTinh || '')
              .input('NguonMua', sql.NVarChar, nguonMua)
              .query(`
                INSERT INTO dbo.VANPHONGPHAM (TenVPP, DonViTinh, NguonMua)
                OUTPUT INSERTED.Id
                VALUES (@TenVPP, @DonViTinh, @NguonMua)
              `);
             vppId = vppInsert.recordset[0].Id;
             // Reset parameter for next loop
             request.parameters = {}; 
          }

          // 2. Lưu vào NHAP_VPP
          await request
            .input('VppId2', sql.Int, vppId)
            .input('SoLuong', sql.Float, item.SoLuong)
            .input('DonGia', sql.Float, item.DonGia)
            .input('VAT', sql.Float, item.VAT)
            .input('ThanhTien', sql.Float, item.ThanhTien)
            .input('NguoiNhap', sql.NVarChar, user)
            .input('GhiChuNhap', sql.NVarChar, item.GhiChu || '')
            .input('MaDon', sql.NVarChar, maDon)
            .query(`
              INSERT INTO dbo.NHAP_VPP (VppId, SoLuong, DonGia, VAT, ThanhTien, NguoiNhap, GhiChu, MaDon, PheDuyet)
              VALUES (@VppId2, @SoLuong, @DonGia, @VAT, @ThanhTien, @NguoiNhap, @GhiChuNhap, @MaDon, 0)
            `);
            
          request.parameters = {};

          // 3. Cập nhật Số lượng tồn
          await request
            .input('VppId3', sql.Int, vppId)
            .input('Qty', sql.Float, item.SoLuong)
            .input('DonGia', sql.Float, item.DonGia)
            .input('VATT', sql.Float, item.VAT)
            .query(`
              DECLARE @CurrentQty FLOAT = 0;
              DECLARE @CurrentDonGiaTon FLOAT = 0;
              
              IF EXISTS (SELECT 1 FROM dbo.TONKHO_VPP WHERE VppId = @VppId3)
              BEGIN
                SELECT @CurrentQty = SoLuongTon, @CurrentDonGiaTon = DonGiaTon 
                FROM dbo.TONKHO_VPP WHERE VppId = @VppId3;
              END
              
              DECLARE @ImportQty FLOAT = ISNULL(@Qty, 0);
              DECLARE @ImportDonGiaVAT FLOAT = ISNULL(@DonGia, 0) * (1 + ISNULL(@VATT, 0)/100.0);
              DECLARE @ImportTotal FLOAT = @ImportQty * @ImportDonGiaVAT;
              
              DECLARE @NewQty FLOAT = @CurrentQty + @ImportQty;
              DECLARE @NewTotal FLOAT = (@CurrentQty * @CurrentDonGiaTon) + @ImportTotal;
              DECLARE @NewDonGiaTon FLOAT = CASE WHEN @NewQty > 0 THEN @NewTotal / @NewQty ELSE 0 END;
              
              IF EXISTS (SELECT 1 FROM dbo.TONKHO_VPP WHERE VppId = @VppId3)
              BEGIN
                UPDATE dbo.TONKHO_VPP 
                SET SoLuongTon = @NewQty,
                    DonGiaTon = @NewDonGiaTon
                WHERE VppId = @VppId3
              END
              ELSE
              BEGIN
                INSERT INTO dbo.TONKHO_VPP (VppId, SoLuongTon, DonGiaTon)
                VALUES (@VppId3, @NewQty, @NewDonGiaTon)
              END
            `);
          request.parameters = {};
        }

        await transaction.commit();
        res.json({ message: "Nhập hàng thành công" });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi nhập VPP");
    }
  });

  // Lấy Lịch sử nhập
  router.get('/imports', authenticate, async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(`
        SELECT n.Id, v.TenVPP, v.DonViTinh, n.SoLuong, n.DonGia, n.VAT, n.ThanhTien, n.NgayNhap, n.NguoiNhap, n.GhiChu
        FROM dbo.NHAP_VPP n
        JOIN dbo.V_VATTU v ON n.VppId = v.Id AND n.Loai = v.Loai
        ORDER BY n.NgayNhap ASC
      `);
      res.json(result.recordset);
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi lấy lịch sử nhập VPP");
    }
  });

  // Lưu Phiếu Xuất VPP
  router.post('/export', authenticate, async (req, res) => {
    const { items } = req.body;
    const user = req.user ? req.user.username : 'Unknown';

    if (!items || !items.length) {
      return res.status(400).send("Không có dữ liệu xuất");
    }

    try {
      const pool = await poolPromise;
      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        const vppIds = items.map(i => i.VppId).filter(id => id != null && id !== '');
        let nguonMuaPrefix = 'FVN';
        if (vppIds.length > 0) {
          const idList = vppIds.join(',');
          const sourceCheck = await pool.request().query(`SELECT DISTINCT NguonMua FROM dbo.V_VATTU WHERE Id IN (${idList})`);
          if (sourceCheck.recordset.length > 1) {
             return res.status(400).send("Không thể xuất chung phiếu cho vật tư VN và CN. Vui lòng tách 2 phiếu riêng.");
          }
          if (sourceCheck.recordset.length === 1) {
             const nguonMua = sourceCheck.recordset[0].NguonMua || 'VN';
             nguonMuaPrefix = (nguonMua === 'CN') ? 'FCN' : 'FVN';
          }
        }
        
        const today = new Date();
        const dateStr = today.getFullYear() + String(today.getMonth() + 1).padStart(2, '0') + String(today.getDate()).padStart(2, '0');
        const countResult = await pool.request().query(`SELECT COUNT(DISTINCT MaDon) AS Cnt FROM dbo.XUAT_VPP`);
        const nextNum = String(countResult.recordset[0].Cnt + 1).padStart(3, '0');
        const maDon = nguonMuaPrefix + nextNum + 'B-' + dateStr;

        for (let item of items) {
          if (!item.VppId) throw new Error("Thiếu mã vật tư");
          
          const loaiValue = item.Loai || 'VPP';
          
          // Kiểm tra tồn kho
          const checkReq = new sql.Request(transaction);
          const checkStock = await checkReq
            .input('IdCheck', sql.Int, item.VppId)
            .input('LoaiCheck', sql.VarChar, loaiValue)
            .query(`
              SELECT t.SoLuongTon, v.TenVPP 
              FROM dbo.TONKHO_VPP t
              JOIN dbo.V_VATTU v ON t.VppId = v.Id AND t.Loai = v.Loai
              WHERE t.VppId = @IdCheck AND t.Loai = @LoaiCheck
            `);
            
          if(checkStock.recordset.length === 0) throw new Error("Không tìm thấy vật tư");
          if(checkStock.recordset[0].SoLuongTon < item.SoLuong) {
            throw new Error(`Vật tư [${checkStock.recordset[0].TenVPP}] không đủ tồn kho (Còn: ${checkStock.recordset[0].SoLuongTon})`);
          }

          // Lưu xuất kho
          const insertReq = new sql.Request(transaction);
          await insertReq
            .input('VppId', sql.Int, item.VppId)
            .input('Loai', sql.VarChar, loaiValue)
            .input('SoLuong', sql.Float, item.SoLuong)
            .input('NguoiNhan', sql.NVarChar, item.NguoiNhan || '')
            .input('GhiChu', sql.NVarChar, item.GhiChu || '')
            .input('MSNV', sql.NVarChar, item.MSNV || '')
            .input('BoPhan', sql.NVarChar, item.BoPhan || '')
            .input('MaDon', sql.NVarChar, maDon)
            .query(`
              INSERT INTO dbo.XUAT_VPP (VppId, Loai, SoLuong, NguoiNhan, GhiChu, MSNV, BoPhan, MaDon, PheDuyet)
              VALUES (@VppId, @Loai, @SoLuong, @NguoiNhan, @GhiChu, @MSNV, @BoPhan, @MaDon, 0)
            `);

          // Trừ tồn kho
          const updateReq = new sql.Request(transaction);
          await updateReq
            .input('VppIdUpdate', sql.Int, item.VppId)
            .input('LoaiUpdate', sql.VarChar, loaiValue)
            .input('Qty', sql.Float, item.SoLuong)
            .query(`
              UPDATE dbo.TONKHO_VPP 
              SET SoLuongTon = SoLuongTon - @Qty
              WHERE VppId = @VppIdUpdate AND Loai = @LoaiUpdate
            `);
        }

        await transaction.commit();
        res.json({ message: "Xuất kho thành công" });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(500).send(err.message || "Lỗi server khi xuất VPP");
    }
  });

  // Lịch sử chung (Nhập + Xuất)
  router.get('/history', authenticate, async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(`
        SELECT 
          v.MaCap3,
          'NHAP' AS Loai, 
          v.TenVPP, 
          n.SoLuong, 
          n.DonGia,
          n.VAT,
          n.ThanhTien,
          n.NguoiNhap AS NguoiThucHien, 
          '' AS NguoiNhan, 
          n.GhiChu,
          '' AS MSNV,
          '' AS BoPhan,
          n.NgayNhap AS ThoiGianRaw,
          CONVERT(varchar, n.NgayNhap, 120) AS ThoiGian
        FROM dbo.NHAP_VPP n
        JOIN dbo.V_VATTU v ON n.VppId = v.Id AND n.Loai = v.Loai
        
        UNION ALL
        
        SELECT 
          v.MaCap3,
          'XUAT' AS Loai, 
          v.TenVPP, 
          x.SoLuong, 
          t.DonGiaTon AS DonGia,
          NULL AS VAT,
          (x.SoLuong * t.DonGiaTon) AS ThanhTien,
          '' AS NguoiThucHien, 
          x.NguoiNhan, 
          x.GhiChu,
          x.MSNV,
          x.BoPhan,
          x.NgayXuat AS ThoiGianRaw,
          CONVERT(varchar, x.NgayXuat, 120) AS ThoiGian
        FROM dbo.XUAT_VPP x
        JOIN dbo.V_VATTU v ON x.VppId = v.Id AND x.Loai = v.Loai
        LEFT JOIN dbo.TONKHO_VPP t ON x.VppId = t.VppId AND x.Loai = t.Loai
        
        ORDER BY ThoiGianRaw ASC
      `);
      res.json(result.recordset);
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi lấy lịch sử VPP");
    }
  });

  

  // =============================================
  // QUẢN LÝ ĐƠN NHẬP KHO
  // =============================================
  router.get('/import-list', authenticate, async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(`
        SELECT n.Id, n.MaDon, v.MaCap3, v.TenVPP, n.SoLuong, n.DonGia, n.VAT, n.ThanhTien, n.NguoiNhap, n.PheDuyet, n.NgayNhap
        FROM dbo.NHAP_VPP n
        JOIN dbo.V_VATTU v ON n.VppId = v.Id AND n.Loai = v.Loai
        ORDER BY n.NgayNhap ASC
      `);
      res.json(result.recordset);
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi lấy danh sách đơn nhập");
    }
  });

  router.put('/import/approve', authenticate, async (req, res) => {
    const { ids, status } = req.body;
    if (!ids || !ids.length) return res.status(400).send("Không có ID");
    try {
      const pool = await poolPromise;
      const idList = ids.join(',');
      await pool.request().query(`UPDATE dbo.NHAP_VPP SET PheDuyet = ${status} WHERE Id IN (${idList})`);
      res.json({ message: "Cập nhật thành công" });
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi cập nhật");
    }
  });

  router.delete('/import/:id', authenticate, async (req, res) => {
    const id = req.params.id;
    try {
      const pool = await poolPromise;
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const reqCheck = new sql.Request(transaction);
        const nhapData = await reqCheck.input('Id', sql.Int, id).query(`SELECT VppId, Loai, SoLuong, DonGia, VAT, ThanhTien FROM dbo.NHAP_VPP WHERE Id = @Id AND PheDuyet = 0`);
        if (nhapData.recordset.length === 0) throw new Error("Không tìm thấy hoặc đã được phê duyệt (khóa)");
        
        const data = nhapData.recordset[0];
        
        // Trừ tồn kho
        const reqUpdate = new sql.Request(transaction);
        await reqUpdate
          .input('VppId', sql.Int, data.VppId)
          .input('Loai', sql.VarChar, data.Loai)
          .input('Qty', sql.Float, data.SoLuong)
          .input('ThanhTien', sql.Float, data.ThanhTien)
          .query(`
            UPDATE dbo.TONKHO_VPP 
            SET SoLuongTon = SoLuongTon - @Qty,
                DonGiaTon = CASE WHEN (SoLuongTon - @Qty) > 0 THEN ((SoLuongTon * DonGiaTon) - @ThanhTien) / (SoLuongTon - @Qty) ELSE 0 END
            WHERE VppId = @VppId AND Loai = @Loai
          `);
          
        const reqDel = new sql.Request(transaction);
        await reqDel.input('Id', sql.Int, id).query(`DELETE FROM dbo.NHAP_VPP WHERE Id = @Id`);
        
        await transaction.commit();
        res.json({ message: "Xóa thành công" });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(500).send(err.message || "Lỗi xóa đơn nhập");
    }
  });
  
  router.put('/import/:id', authenticate, async (req, res) => {
    const id = req.params.id;
    const { SoLuong, DonGia, VAT } = req.body;
    try {
      const pool = await poolPromise;
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const reqCheck = new sql.Request(transaction);
        const nhapData = await reqCheck.input('Id', sql.Int, id).query(`SELECT VppId, Loai, SoLuong, DonGia, VAT, ThanhTien FROM dbo.NHAP_VPP WHERE Id = @Id AND PheDuyet = 0`);
        if (nhapData.recordset.length === 0) throw new Error("Không tìm thấy hoặc đã được phê duyệt (khóa)");
        
        const oldData = nhapData.recordset[0];
        const newThanhTien = SoLuong * (DonGia * (1 + (VAT || 0)/100.0));
        
        // Trừ cái cũ, cộng cái mới vào tồn kho
        const reqUpdate = new sql.Request(transaction);
        await reqUpdate
          .input('VppId', sql.Int, oldData.VppId)
          .input('Loai', sql.VarChar, oldData.Loai)
          .input('OldQty', sql.Float, oldData.SoLuong)
          .input('OldThanhTien', sql.Float, oldData.ThanhTien)
          .input('NewQty', sql.Float, SoLuong)
          .input('NewThanhTien', sql.Float, newThanhTien)
          .query(`
            UPDATE dbo.TONKHO_VPP 
            SET SoLuongTon = SoLuongTon - @OldQty + @NewQty,
                DonGiaTon = CASE WHEN (SoLuongTon - @OldQty + @NewQty) > 0 
                            THEN ((SoLuongTon * DonGiaTon) - @OldThanhTien + @NewThanhTien) / (SoLuongTon - @OldQty + @NewQty) 
                            ELSE 0 END
            WHERE VppId = @VppId AND Loai = @Loai
          `);
          
        const reqSave = new sql.Request(transaction);
        await reqSave
          .input('Id', sql.Int, id)
          .input('SoLuong', sql.Float, SoLuong)
          .input('DonGia', sql.Float, DonGia)
          .input('VAT', sql.Float, VAT || 0)
          .input('ThanhTien', sql.Float, newThanhTien)
          .query(`
            UPDATE dbo.NHAP_VPP 
            SET SoLuong = @SoLuong, DonGia = @DonGia, VAT = @VAT, ThanhTien = @ThanhTien
            WHERE Id = @Id
          `);
          
        await transaction.commit();
        res.json({ message: "Sửa thành công" });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(500).send(err.message || "Lỗi sửa đơn nhập");
    }
  });

  // =============================================
  // QUẢN LÝ ĐƠN XUẤT KHO
  // =============================================
  router.get('/export-list', authenticate, async (req, res) => {
    try {
      const pool = await poolPromise;
      const result = await pool.request().query(`
        SELECT x.Id, x.MaDon, v.MaCap3, v.TenVPP, x.SoLuong, t.DonGiaTon, (x.SoLuong * ISNULL(t.DonGiaTon, 0)) AS ThanhTien, x.NguoiNhan, x.MSNV, x.BoPhan, x.PheDuyet, x.NgayXuat
        FROM dbo.XUAT_VPP x
        JOIN dbo.V_VATTU v ON x.VppId = v.Id AND x.Loai = v.Loai
        LEFT JOIN dbo.TONKHO_VPP t ON x.VppId = t.VppId AND x.Loai = t.Loai
        ORDER BY x.NgayXuat ASC
      `);
      res.json(result.recordset);
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi lấy danh sách đơn xuất");
    }
  });

  router.put('/export/approve', authenticate, async (req, res) => {
    const { ids, status } = req.body;
    if (!ids || !ids.length) return res.status(400).send("Không có ID");
    try {
      const pool = await poolPromise;
      const idList = ids.join(',');
      await pool.request().query(`UPDATE dbo.XUAT_VPP SET PheDuyet = ${status} WHERE Id IN (${idList})`);
      res.json({ message: "Cập nhật thành công" });
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi cập nhật");
    }
  });

  router.delete('/export/:id', authenticate, async (req, res) => {
    const id = req.params.id;
    try {
      const pool = await poolPromise;
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const reqCheck = new sql.Request(transaction);
        const xuatData = await reqCheck.input('Id', sql.Int, id).query(`SELECT VppId, Loai, SoLuong FROM dbo.XUAT_VPP WHERE Id = @Id AND PheDuyet = 0`);
        if (xuatData.recordset.length === 0) throw new Error("Không tìm thấy hoặc đã được phê duyệt (khóa)");
        
        const data = xuatData.recordset[0];
        
        // Cộng lại tồn kho
        const reqUpdate = new sql.Request(transaction);
        await reqUpdate
          .input('VppId', sql.Int, data.VppId)
          .input('Loai', sql.VarChar, data.Loai)
          .input('Qty', sql.Float, data.SoLuong)
          .query(`
            UPDATE dbo.TONKHO_VPP 
            SET SoLuongTon = SoLuongTon + @Qty
            WHERE VppId = @VppId AND Loai = @Loai
          `);
          
        const reqDel = new sql.Request(transaction);
        await reqDel.input('Id', sql.Int, id).query(`DELETE FROM dbo.XUAT_VPP WHERE Id = @Id`);
        
        await transaction.commit();
        res.json({ message: "Xóa thành công" });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(500).send(err.message || "Lỗi xóa đơn xuất");
    }
  });
  
  router.put('/export/:id', authenticate, async (req, res) => {
    const id = req.params.id;
    const { SoLuong } = req.body;
    try {
      const pool = await poolPromise;
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const reqCheck = new sql.Request(transaction);
        const xuatData = await reqCheck.input('Id', sql.Int, id).query(`SELECT VppId, Loai, SoLuong FROM dbo.XUAT_VPP WHERE Id = @Id AND PheDuyet = 0`);
        if (xuatData.recordset.length === 0) throw new Error("Không tìm thấy hoặc đã được phê duyệt (khóa)");
        
        const oldData = xuatData.recordset[0];
        
        // Kiểm tra tồn kho có đủ không
        const reqStock = new sql.Request(transaction);
        const stockData = await reqStock
          .input('VppId', sql.Int, oldData.VppId)
          .input('Loai', sql.VarChar, oldData.Loai)
          .query(`SELECT SoLuongTon FROM dbo.TONKHO_VPP WHERE VppId = @VppId AND Loai = @Loai`);
          
        if (stockData.recordset.length === 0) throw new Error("Không tìm thấy tồn kho");
        const availableStock = stockData.recordset[0].SoLuongTon + oldData.SoLuong; // Trả lại kho trước khi trừ
        
        if (availableStock < SoLuong) {
           throw new Error(`Không đủ tồn kho. Tối đa: ${availableStock}`);
        }
        
        // Cộng lại cái cũ, trừ cái mới
        const reqUpdate = new sql.Request(transaction);
        await reqUpdate
          .input('VppId', sql.Int, oldData.VppId)
          .input('Loai', sql.VarChar, oldData.Loai)
          .input('OldQty', sql.Float, oldData.SoLuong)
          .input('NewQty', sql.Float, SoLuong)
          .query(`
            UPDATE dbo.TONKHO_VPP 
            SET SoLuongTon = SoLuongTon + @OldQty - @NewQty
            WHERE VppId = @VppId AND Loai = @Loai
          `);
          
        const reqSave = new sql.Request(transaction);
        await reqSave
          .input('Id', sql.Int, id)
          .input('SoLuong', sql.Float, SoLuong)
          .query(`
            UPDATE dbo.XUAT_VPP 
            SET SoLuong = @SoLuong
            WHERE Id = @Id
          `);
          
        await transaction.commit();
        res.json({ message: "Sửa thành công" });
      } catch (err) {
        await transaction.rollback();
        throw err;
      }
    } catch (err) {
      console.error(err);
      res.status(500).send(err.message || "Lỗi sửa đơn xuất");
    }
  });

  // =============================================
  // IMPORT EXCEL
  // =============================================
  router.post('/import-excel', authenticate, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).send("Không có file được upload");
      
      const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      // Format: Mã vật tư, Tên Vật Tư, Thương hiệu/ Hãng, Nhà Cung Cấp, Ghi Chú
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      
      if(rows.length < 2) return res.status(400).send("File rỗng hoặc chỉ có dòng tiêu đề");

      const pool = await poolPromise;
      const transaction = new sql.Transaction(pool);
      await transaction.begin();

      try {
        const request = new sql.Request(transaction);
        let count = 0;
        
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if(!row || row.length === 0 || !row[0]) continue;
          
          const maVatTu = String(row[0] || '').trim();
          const tenVatTu = String(row[1] || '').trim();
          const donViTinh = String(row[2] || '').trim();
          const thuongHieu = String(row[3] || '').trim();
          const nhaCungCap = String(row[4] || '').trim();
          const ghiChu = String(row[5] || '').trim();
          
          if(!maVatTu || !tenVatTu) continue;

          // MaCap2 là 5 ký tự đầu
          const maCap2 = maVatTu.substring(0, 5);
          const spResult = await request.query(`SELECT Id FROM dbo.SANPHAM WHERE MaCap2 = '${maCap2}'`);
          
          if(spResult.recordset.length === 0) continue; // Bỏ qua nếu ko tìm thấy MaCap2
          const sanPhamId = spResult.recordset[0].Id;
          
          const checkExist = await request.query(`SELECT 1 FROM dbo.VANPHONGPHAM WHERE MaCap3 = N'${maVatTu}'`);
          if (checkExist.recordset.length > 0) {
            throw new Error(`Trùng Mã vật tư (${maVatTu}), vui lòng kiểm tra và import lại.`);
          }
          
          await request.query(`
            INSERT INTO dbo.VANPHONGPHAM (MaCap3, TenVPP, ThuongHieu, NhaCungCap, GhiChu, SanPhamId, DonViTinh)
            VALUES (N'${maVatTu}', N'${tenVatTu}', N'${thuongHieu}', N'${nhaCungCap}', N'${ghiChu}', ${sanPhamId}, N'${donViTinh}')
          `);
          count++;
        }

        await transaction.commit();
        res.json({ message: "Import thành công", count });
      } catch (err) {
        await transaction.rollback();
        console.error(err);
        res.status(500).send("Lỗi khi import dữ liệu: " + err.message);
      }
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi đọc file Excel");
    }
  });

  router.get('/fix-db', async (req, res) => {
    try {
      const pool = await poolPromise;
      await pool.request().query(`
        UPDATE t
        SET t.DonGiaTon = ISNULL(
          (SELECT SUM(n.ThanhTien) / SUM(n.SoLuong)
           FROM dbo.NHAP_VPP n
           WHERE n.VppId = t.VppId), 0)
        FROM dbo.TONKHO_VPP t
      `);
      res.send("Fixed DB DonGiaTon based on history");
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  return router;
};
