const express = require('express');
const sql = require('mssql');

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
          SELECT v.Id, v.MaCap3, v.TenVPP, v.DonViTinh, v.SoLuongTon, v.SanPhamId
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
          INSERT INTO dbo.VANPHONGPHAM (MaCap3, TenVPP, DonViTinh, SoLuongTon, GhiChu, SanPhamId)
          OUTPUT INSERTED.Id, INSERTED.MaCap3
          VALUES (@MaCap3, @TenVPP, @DonViTinh, 0, @GhiChu, @SanPhamId)
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
          v.Id, v.MaCap3, v.TenVPP, v.DonViTinh, v.SoLuongTon, v.GhiChu, v.HinhAnh, v.SanPhamId, v.ThuongHieu, v.NhaCungCap,
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
        ORDER BY v.MaCap3 ASC, v.TenVPP ASC
      `);
      res.json(result.recordset);
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi lấy danh sách VPP");
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
        .input('SanPhamId', sql.Int, sanPhamId)
        .query(`
          INSERT INTO dbo.VANPHONGPHAM (MaCap3, TenVPP, DonViTinh, SoLuongTon, GhiChu, SanPhamId, ThuongHieu, NhaCungCap)
          OUTPUT INSERTED.Id, INSERTED.MaCap3
          VALUES (@MaCap3, @TenVPP, @DonViTinh, 0, @GhiChu, @SanPhamId, @ThuongHieu, @NhaCungCap)
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
        const request = new sql.Request(transaction);
        
        for (let item of items) {
          // 1. Nếu chưa có VppId, tức là thêm mới VPP luôn từ form nhập
          let vppId = item.VppId;
          if (!vppId) {
             const vppInsert = await request
              .input('TenVPP', sql.NVarChar, item.TenVPP)
              .input('DonViTinh', sql.NVarChar, item.DonViTinh || '')
              .query(`
                INSERT INTO dbo.VANPHONGPHAM (TenVPP, DonViTinh, SoLuongTon)
                OUTPUT INSERTED.Id
                VALUES (@TenVPP, @DonViTinh, 0)
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
            .query(`
              INSERT INTO dbo.NHAP_VPP (VppId, SoLuong, DonGia, VAT, ThanhTien, NguoiNhap, GhiChu)
              VALUES (@VppId2, @SoLuong, @DonGia, @VAT, @ThanhTien, @NguoiNhap, @GhiChuNhap)
            `);
            
          request.parameters = {};

          // 3. Cập nhật Số lượng tồn
          await request
            .input('VppId3', sql.Int, vppId)
            .input('Qty', sql.Float, item.SoLuong)
            .query(`
              UPDATE dbo.VANPHONGPHAM 
              SET SoLuongTon = SoLuongTon + @Qty 
              WHERE Id = @VppId3
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
        JOIN dbo.VANPHONGPHAM v ON n.VppId = v.Id
        ORDER BY n.NgayNhap DESC
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
        const request = new sql.Request(transaction);
        
        for (let item of items) {
          if (!item.VppId) throw new Error("Thiếu mã vật tư");
          
          // Kiểm tra tồn kho
          const checkStock = await request
            .input('IdCheck', sql.Int, item.VppId)
            .query(`SELECT SoLuongTon, TenVPP FROM dbo.VANPHONGPHAM WHERE Id = @IdCheck`);
            
          request.parameters = {};
          
          if(checkStock.recordset.length === 0) throw new Error("Không tìm thấy vật tư");
          if(checkStock.recordset[0].SoLuongTon < item.SoLuong) {
            throw new Error(`Vật tư [${checkStock.recordset[0].TenVPP}] không đủ tồn kho (Còn: ${checkStock.recordset[0].SoLuongTon})`);
          }

          // Lưu xuất kho
          await request
            .input('VppId', sql.Int, item.VppId)
            .input('SoLuong', sql.Float, item.SoLuong)
            .input('NguoiNhan', sql.NVarChar, item.NguoiNhan || '')
            .input('GhiChu', sql.NVarChar, item.GhiChu || '')
            .query(`
              INSERT INTO dbo.XUAT_VPP (VppId, SoLuong, NguoiNhan, GhiChu)
              VALUES (@VppId, @SoLuong, @NguoiNhan, @GhiChu)
            `);
          request.parameters = {};

          // Trừ tồn kho
          await request
            .input('VppIdUpdate', sql.Int, item.VppId)
            .input('Qty', sql.Float, item.SoLuong)
            .query(`
              UPDATE dbo.VANPHONGPHAM 
              SET SoLuongTon = SoLuongTon - @Qty 
              WHERE Id = @VppIdUpdate
            `);
          request.parameters = {};
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
          n.NgayNhap AS ThoiGianRaw,
          CONVERT(varchar, n.NgayNhap, 120) AS ThoiGian
        FROM dbo.NHAP_VPP n
        JOIN dbo.VANPHONGPHAM v ON n.VppId = v.Id
        
        UNION ALL
        
        SELECT 
          v.MaCap3,
          'XUAT' AS Loai, 
          v.TenVPP, 
          x.SoLuong, 
          NULL AS DonGia,
          NULL AS VAT,
          NULL AS ThanhTien,
          '' AS NguoiThucHien, 
          x.NguoiNhan, 
          x.GhiChu,
          x.NgayXuat AS ThoiGianRaw,
          CONVERT(varchar, x.NgayXuat, 120) AS ThoiGian
        FROM dbo.XUAT_VPP x
        JOIN dbo.VANPHONGPHAM v ON x.VppId = v.Id
        
        ORDER BY ThoiGianRaw ASC
      `);
      res.json(result.recordset);
    } catch (err) {
      console.error(err);
      res.status(500).send("Lỗi server khi lấy lịch sử VPP");
    }
  });

  return router;
};
