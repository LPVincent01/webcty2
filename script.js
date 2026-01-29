/***********************
 * CẤU HÌNH API
 ***********************/
const API_BASE = window.location.origin;
const api = (url) => (url.startsWith("http") ? url : `${API_BASE}${url}`);
// ==== ĐƯỜNG LINK DÙNG CHO QR & EXCEL (THÊM MỚI) ====
//const PUBLIC_WEB_BASE = API_BASE;
// Nếu sau này muốn cố định IP / domain public thì đổi thành:
// const PUBLIC_WEB_BASE = "http://115.79.138.139:3000";
const PUBLIC_WEB_BASE = "http://192.168.11.205:3000";

function buildDeviceDisplayUrl(maThietBi) {
  return `${PUBLIC_WEB_BASE}/display.html?id=${encodeURIComponent(maThietBi)}`;
}
// ==== HẾT PHẦN THÊM MỚI ====

async function fetchJson(url, options = {}) {
  try {
    const headers = { ...(options.headers || {}) };

    if (window.authToken) {
      headers["Authorization"] = `Bearer ${window.authToken}`;
    }

    const res = await fetch(api(url), { ...options, headers });
    const text = await res.text();

    if (!res.ok) {
      // ⚠️ Lỗi ràng buộc FK khi xoá thiết bị có trong Purchase
      if (
        res.status === 500 &&
        text.includes("REFERENCE constraint") &&
        text.includes("FK_Purchase_THIETBI")
      ) {
        showAlert(
          "Không thể xoá thiết bị vì đang được dùng trong lịch sử mua hàng ❌",
          false,
        );
        return null;
      }

      // Lỗi nghiệp vụ
      if (res.status === 400 || res.status === 409) {
        showAlert(text || "Dữ liệu không hợp lệ hoặc trùng lặp ❗", false);
        return null;
      }

      // Hết phiên
      if (res.status === 401 || res.status === 403) {
        handleUnauthorized();
      }

      showAlert(`HTTP ${res.status} — ${text}`, false);
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${text}`);
    }

    if (res.status === 204) return true;

    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? JSON.parse(text) : text;
  } catch (err) {
    console.error("API Error:", err);
    showAlert(err.message || "Lỗi kết nối máy chủ ❗", false);
    return null;
  }
}

function handleUnauthorized() {
  window.authToken = null;
  window.currentRole = null;
  window.currentUsername = null;
  try {
    appContainer.style.display = "none";
    loginPage.style.display = "flex";
  } catch (_) {}
  showAlert(t("alert_unauthorized"), false);
}

/***********************
 * DOM ELEMENTS
 ***********************/
const loginPage = document.getElementById("loginPage");
const loginForm = document.getElementById("loginForm");

// Ẩn form lúc mới vào, click nền hoặc chữ SPRINGTEX mới hiện
if (loginPage && loginForm) {
  loginPage.addEventListener(
    "click",
    (e) => {
      // chỉ xử lý nếu form đang ẩn
      if (!loginForm.classList.contains("hidden")) return;

      // click trên nền login hoặc chữ SPRINGTEX mới bật form
      if (
        e.target === loginPage ||
        e.target.classList.contains("brand-banner")
      ) {
        loginForm.classList.remove("hidden");
      }
    },
    { once: true }, // chỉ chạy 1 lần, sau đó form luôn hiện
  );
}

const appContainer = document.getElementById("appContainer");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const refreshDataBtn = document.getElementById("refreshDataBtn"); // 👈 NÚT REFRESH
const menuItems = document.querySelectorAll(".sidebar-menu a");
const contentSections = document.querySelectorAll(".content-section");

const devicesTableHead = document.querySelector("#devicesTable thead");
const usersTableHead = document.querySelector("#usersTable thead");
const purchasesTableHead = document.querySelector("#purchasesTable thead"); // 👈 thêm dòng này
// Tables & Modals
const devicesTableBody = document.getElementById("devicesTableBody");
const usersTableBody = document.getElementById("usersTableBody");
const addDeviceBtn = document.getElementById("addDeviceBtn");
const addUserBtn = document.getElementById("addUserBtn");
const exportDevicesExcelBtn = document.getElementById("exportDevicesExcelBtn");
const exportUsersExcelBtn = document.getElementById("exportUsersExcelBtn");

// Purchases
const purchasesTableBody = document.getElementById("purchasesTableBody");
const purchaseSearchInput = document.getElementById("purchaseSearchInput");
const purchaseSourceFilter = document.getElementById("purchaseSourceFilter");
const purchasesPagination = document.getElementById("purchasesPagination");
const addPurchaseBtn = document.getElementById("addPurchaseBtn");
const exportPurchasesExcelBtn = document.getElementById(
  "exportPurchasesExcelBtn",
);
const importDevicesExcelBtn = document.getElementById("importDevicesExcelBtn");
const importDevicesExcelInput = document.getElementById(
  "importDevicesExcelInput",
);
const importUsersExcelBtn = document.getElementById("importUsersExcelBtn");
const importUsersExcelInput = document.getElementById("importUsersExcelInput");

// Khi bấm nút "Nhập Excel", mở hộp chọn file
importDevicesExcelBtn.addEventListener("click", () => {
  importDevicesExcelInput.click();
});

// Xử lý file Excel được chọn
importDevicesExcelInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    // TỐI ƯU: Tạo map tra cứu loại thiết bị 1 lần duy nhất (O(1) lookup)
    const deviceTypeLookup = new Map();
    for (const cat in deviceTypes) {
      for (const v of Object.values(deviceTypes[cat] || {})) {
        const normV = normalizeLoaiThietBi(v);
        if (normV) {
          deviceTypeLookup.set(normalizeLoaiThietBiCompact(normV), v);
        }
      }
    }

    const json = raw.map((row) => {
      const parsed = {
        ...row,
        Vitri: row.Vitri || "", // 👈 THÊM DÒNG NÀY
        MaNV: row.MaNV ? String(row.MaNV) : "",
        Thietbisudung: "",
        Trangthai: row.Trangthai || "",
      };
      /* ===== BẮT ĐẦU FIX SERIALSN (EXCEL NUMBER -> STRING) ===== */
      const rawSN = row.SerialSN ?? row["Serial(S/N)"] ?? row["Serial(SN)"]; // hỗ trợ nhiều header
      if (rawSN === null || rawSN === undefined) {
        parsed.SerialSN = "";
      } else {
        const sn = String(rawSN).trim();
        // Excel hay để "0" làm placeholder => coi như rỗng để không dính unique Serial
        parsed.SerialSN = sn === "" || sn === "0" ? "" : sn;
      }
      /* ===== KẾT THÚC FIX SERIALSN ===== */

      /* ===== BẮT ĐẦU FIX NgayNhap (Excel Date -> yyyy-mm-dd) ===== */
      const rawNgayNhap =
        row.NgayNhap ??
        row["Ngày nhập"] ??
        row["Ngay nhap"] ??
        row["NgayNhap"] ??
        "";

      const toISODate = (val) => {
        if (val === null || val === undefined || val === "") return null;

        // Nếu XLSX đọc ra Date object
        if (val instanceof Date && !Number.isNaN(val.getTime())) {
          return val.toISOString().split("T")[0];
        }

        // Excel serial number
        if (typeof val === "number") {
          const d = XLSX.SSF.parse_date_code(val);
          if (!d) return null;
          return new Date(Date.UTC(d.y, d.m - 1, d.d))
            .toISOString()
            .split("T")[0];
        }

        // Chuỗi: ưu tiên bắt dd/mm/yyyy hoặc dd-mm-yyyy (tránh lệch locale)
        const s = String(val).trim();
        const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (m) {
          const dd = m[1].padStart(2, "0");
          const mm = m[2].padStart(2, "0");
          const yyyy = m[3];
          return `${yyyy}-${mm}-${dd}`;
        }

        // ISO / format khác
        const dt = new Date(s);
        return Number.isNaN(dt.getTime())
          ? null
          : dt.toISOString().split("T")[0];
      };

      parsed.NgayNhap = toISODate(rawNgayNhap);
      /* ===== KẾT THÚC FIX NgayNhap ===== */

      /* ===== BẮT ĐẦU FIX LoaiThietBi (xoá xuống dòng + map về value chuẩn) ===== */
      const rawType =
        row.LoaiThietBi ??
        row["Loại thiết bị"] ??
        row["Loai thiet bi"] ??
        row["DeviceType"] ??
        "";

      const typeNorm = normalizeLoaiThietBi(rawType);

      // Map về đúng value đang có trong deviceTypes để edit tự tick chuẩn
      let mappedType = "";
      if (typeNorm) {
        const compactNeedle = normalizeLoaiThietBiCompact(typeNorm);
        // Tra cứu nhanh từ Map đã tạo
        if (deviceTypeLookup.has(compactNeedle)) {
          mappedType = deviceTypeLookup.get(compactNeedle);
        }
      }

      parsed.LoaiThietBi = mappedType || typeNorm;
      /* ===== KẾT THÚC FIX LoaiThietBi ===== */

      return parsed;
    });

    if (json.length === 0)
      return showAlert("Không có dữ liệu trong file", false);
    console.table(json); // 👈 bạn có thể thay bằng preview HTML

    const confirmImport = confirm(
      `Bạn có chắc muốn nhập ${json.length} thiết bị?`,
    );
    if (confirmImport) {
      const res = await fetchJson("/api/devices/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      if (res) {
        showAlert("Nhập thiết bị thành công ✔️");
        loadDevices();
      }
    }
  };
  reader.readAsArrayBuffer(file);
});
importUsersExcelBtn.addEventListener("click", () => {
  importUsersExcelInput.click();
});

importUsersExcelInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: "array", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    const json = raw.map((row) => {
      const parsed = {
        ...row,
        MaNV: row.MaNV ? String(row.MaNV) : "",
        Thietbisudung: "", // Bỏ trống theo yêu cầu
        Trangthai: row.Trangthai || "", // hoặc để trống, backend sẽ default "Chưa cấp"
      };

      // Chuẩn hoá cột Ngaycap để không bị nhảy về 1970
      if (parsed.Ngaycap) {
        // Trường hợp Excel Date → số serial (kiểu number)
        if (typeof parsed.Ngaycap === "number") {
          const d = XLSX.SSF.parse_date_code(parsed.Ngaycap);
          if (d) {
            parsed.Ngaycap = new Date(Date.UTC(d.y, d.m - 1, d.d))
              .toISOString()
              .split("T")[0]; // "YYYY-MM-DD"
          }
        }
        // Trường hợp là chuỗi, ví dụ "2025-10-01"
        else if (typeof parsed.Ngaycap === "string") {
          const d = new Date(parsed.Ngaycap);
          if (!Number.isNaN(d.getTime())) {
            parsed.Ngaycap = d.toISOString().split("T")[0];
          } else {
            parsed.Ngaycap = null;
          }
        }
      }

      return parsed;
    });

    if (json.length === 0) {
      showAlert("Không có dữ liệu trong file", false);
      return;
    }

    console.table(json); // Preview console

    const confirmImport = confirm(
      `Bạn có chắc muốn nhập ${json.length} người sử dụng?`,
    );
    if (confirmImport) {
      const res = await fetchJson("/api/users/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(json),
      });
      if (res) {
        showAlert("Nhập người sử dụng thành công ✔️");
        loadUsers();
      }
    }
  };
  reader.readAsArrayBuffer(file);
});

// Search & Filter inputs
const deviceSearchInput = document.getElementById("deviceSearchInput");
const deviceStatusFilter = document.getElementById("deviceStatusFilter");
const userSearchInput = document.getElementById("userSearchInput");
const userDepartmentFilter = document.getElementById("userDepartmentFilter");

const deviceModal = document.getElementById("deviceModal");
const userModal = document.getElementById("userModal");
const purchaseModal = document.getElementById("purchaseModal");
const deleteModal = document.getElementById("deleteModal");
const closeDeviceModal = document.getElementById("closeDeviceModal");
const cancelDeviceBtn = document.getElementById("cancelDeviceBtn");
const saveDeviceBtn = document.getElementById("saveDeviceBtn");
const closeUserModal = document.getElementById("closeUserModal");
const cancelUserBtn = document.getElementById("cancelUserBtn");
const saveUserBtn = document.getElementById("saveUserBtn");
const closePurchaseModal = document.getElementById("closePurchaseModal");
const cancelPurchaseBtn = document.getElementById("cancelPurchaseBtn");
const savePurchaseBtn = document.getElementById("savePurchaseBtn");
const closeDeleteModal = document.getElementById("closeDeleteModal");
const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

// Forms
const deviceForm = document.getElementById("deviceForm");
const userForm = document.getElementById("userForm");
const purchaseForm = document.getElementById("purchaseForm");

// Overview stats
const totalDevicesEl = document.getElementById("totalDevices");
const activeDevicesEl = document.getElementById("activeDevices");
const maintenanceDevicesEl = document.getElementById("maintenanceDevices");
const availableDevicesEl = document.getElementById("availableDevices");
const newDevicesTextEl = document.getElementById("newDevicesText");
const activePercentEl = document.getElementById("activePercent");
const maintenancePercentEl = document.getElementById("maintenancePercent");
const availablePercentEl = document.getElementById("availablePercent");
const brokenDevicesEl = document.getElementById("brokenDevices");
const brokenPercentEl = document.getElementById("brokenPercent");

// Yearly stats cards
const yearlyPurchasedEl = document.getElementById("yearlyPurchased");
const yearlyActiveEl = document.getElementById("yearlyActive");
const yearlyMaintenanceEl = document.getElementById("yearlyMaintenance");
const yearlyBrokenEl = document.getElementById("yearlyBroken");
const yearlyActivePercentEl = document.getElementById("yearlyActivePercent");
const yearlyMaintenancePercentEl = document.getElementById(
  "yearlyMaintenancePercent",
);
const yearlyBrokenPercentEl = document.getElementById("yearlyBrokenPercent");

// Year selector (chỉ để 2025-2026)
const yearlyChartYearSelector = document.getElementById(
  "yearlyChartYearSelector",
);
const selectedYearTextEl = document.getElementById("selectedYearText");
const overviewChartYear1El = document.getElementById("overviewChartYear1");
const overviewChartYear2El = document.getElementById("overviewChartYear2");

// Charts ctx
const monthlyChartCtx = document
  .getElementById("monthlyChart")
  ?.getContext("2d");
const monthlyChart2026Ctx = document
  .getElementById("monthlyChart2026")
  ?.getContext("2d");
const yearlyChartCtx = document.getElementById("yearlyChart")?.getContext("2d");

/***********************
 * STATE
 ***********************/
let devices = [];
let users = [];
// Purchases
let purchases = [];
let purchasesCurrentPage = 1;
let monthlyChart, monthlyChart2026, yearlyChart;
let currentDeviceId = null;
let currentUserId = null;
let currentPurchaseId = null;
let deleteType = null;
let deleteId = null;
window.authToken = null;

let deviceSort = { key: "MaThietBi", order: "asc" };
let userSort = { key: "MaNV", order: "asc" };
let purchasesSort = { key: "MaThietBi", order: "asc" }; // 👈 thêm dòng này
window.currentRole = null;
window.currentUsername = null;
let currentTabStatus = ""; //
let currentUserTabStatus = ""; // [MỚI] Cho người dùng Biến lưu trạng thái Tab hiện tại (Rỗng = Tất cả)
let userCurrentPage = 1;
const ROWS_PER_PAGE = 10;
// Bộ lọc tháng cho Danh sách thiết bị (lọc theo Ngày nhập)
let deviceDateFilter = null; // { year: 2025, month: 11 } hoặc null = không lọc
let currentLang = localStorage.getItem("lang") || "vi";

/***********************
 * LOAD DATA
 ***********************/
/* =========================================
   1. HÀM TẢI DỮ LIỆU THIẾT BỊ (ĐÃ CẬP NHẬT)
   ========================================= */
async function loadDevices() {
  const data = await fetchJson("/api/devices");
  if (!data) return;

  // Chuẩn hóa dữ liệu
  devices = data
    .map((d) => ({
      ...d,
      LoaiThietBi: normalizeLoaiThietBi(d.LoaiThietBi),
    }))
    .sort((a, b) => a.MaThietBi.localeCompare(b.MaThietBi));

  // [QUAN TRỌNG] Tính toán số lượng cho các Tabs trạng thái ngay khi tải xong
  updateDeviceStatusCounts();

  // Hiển thị dữ liệu ra bảng
  applyFiltersAndRender();
}
async function loadUsers() {
  const data = await fetchJson("/api/users");
  if (!data) return;
  users = data.sort((a, b) => a.MaNV.localeCompare(b.MaNV));

  updateUserStats(); // [MỚI] Cập nhật số lượng trên Tab Users
  applyUserFiltersAndRender(); // [MỚI] Gọi hàm render thông minh
}

async function loadPurchases() {
  const data = await fetchJson("/api/purchases");
  if (!data) return;

  purchases = data.sort((a, b) => {
    const da = new Date(a.NgayNhap).getTime() || 0;
    const db = new Date(b.NgayNhap).getTime() || 0;
    if (db !== da) return db - da;
    return (b.PurchaseId || 0) - (a.PurchaseId || 0);
  });

  renderPurchasesTable(purchases); // ✅ thêm dòng này
  applyPurchasesFiltersAndRender(); // ✅ vẫn giữ dòng này nếu có lọc
}

async function loadAllData() {
  // Dùng Promise.allSettled để nếu 1 cái lỗi, các cái khác vẫn chạy
  await Promise.allSettled([loadDevices(), loadUsers(), loadPurchases()]);

  // Cập nhật số liệu Dashboard sau khi tải xong
  updateStats();
  initCharts();
}

// Nút "Làm mới dữ liệu" – reload lại danh sách + Tổng Quan + biểu đồ
if (refreshDataBtn) {
  refreshDataBtn.addEventListener("click", async () => {
    if (!window.authToken) {
      showAlert("Vui lòng đăng nhập trước khi làm mới dữ liệu ❗", false);
      return;
    }

    // Lưu lại năm đang chọn ở dropdown biểu đồ (nếu có)
    let currentYear = parseInt(yearlyChartYearSelector?.value, 10);
    if (Number.isNaN(currentYear)) {
      currentYear = new Date().getFullYear();
    }

    // Gọi lại API lấy toàn bộ dữ liệu + vẽ lại stats + charts
    await loadAllData();

    // Gán lại năm đã chọn và vẽ lại biểu đồ theo năm đó
    if (yearlyChartYearSelector && selectedYearTextEl) {
      const options = Array.from(yearlyChartYearSelector.options).map((o) =>
        parseInt(o.value, 10),
      );

      let yearToApply =
        options.includes(currentYear) && currentYear ? currentYear : options[0];

      if (yearToApply) {
        yearlyChartYearSelector.value = String(yearToApply);
        updateChartSection(yearToApply);
        selectedYearTextEl.textContent = yearToApply;
      }
    }

    showAlert("Đã tải lại dữ liệu và cập nhật các biểu đồ ✔️", true);
  });
}

async function populateDeviceDropdownForPurchase() {
  const allDevices = await fetchJson("/api/devices");
  const allPurchases = await fetchJson("/api/purchases");

  const purchasedDeviceIds = new Set(allPurchases.map((p) => p.MaThietBi));
  const availableDevices = allDevices.filter(
    (d) => !purchasedDeviceIds.has(d.MaThietBi),
  );

  const select = document.getElementById("purchaseDevice");

  select.innerHTML = "";

  availableDevices.forEach((d) => {
    const option = document.createElement("option");
    option.value = d.MaThietBi;
    option.textContent = `${d.MaThietBi} - ${d.TenThietBi}`;
    select.appendChild(option);
  });

  if (availableDevices.length === 0) {
    const noOption = document.createElement("option");
    noOption.textContent = "Không còn thiết bị nào chưa được thêm";
    noOption.disabled = true;
    select.appendChild(noOption);
  }
}

/***********************
 * RENDER TABLES
 ***********************/
function renderDevicesTable(dataToRender) {
  // Nếu không có dữ liệu thì hiển thị thông báo
  if (!dataToRender || dataToRender.length === 0) {
    devicesTableBody.innerHTML =
      '<tr><td colspan="10" style="text-align:center; padding: 20px;">Không có dữ liệu</td></tr>';
    return;
  }

  // Sử dụng map để tạo chuỗi HTML nhanh hơn
  const htmlRows = dataToRender
    .map((d) => {
      const actions =
        window.currentRole === "admin"
          ? `<div class="action-btns">
             <button class="btn btn-primary btn-sm" onclick="editDevice('${d.MaThietBi}')"><i class="fas fa-edit"></i></button>
             <button class="btn btn-danger btn-sm" onclick="confirmDelete('device','${d.MaThietBi}')"><i class="fas fa-trash"></i></button>
           </div>`
          : `<div class="action-btns">
             <button class="btn btn-primary btn-sm" onclick="editDevice('${d.MaThietBi}')"><i class="fas fa-edit"></i></button>
           </div>`;

      // Ưu tiên hiển thị TenThietBi, nếu không có thì lấy Model
      const name = d.TenThietBi || d.Model || "";

      // [BẮT ĐẦU SỬA] -----------------------------------------------------------
      // [CODE MỚI] Ưu tiên lấy cột HinhAnhHienThi, nếu không có thì lấy HinhAnhThucTe
      // Chú ý: Kiểm tra kỹ xem nó có phải là chuỗi (string) không để tránh lỗi crash
      const rawImg = d.HinhAnhHienThi || d.HinhAnhThucTe;

      let cleanPath = "";
      if (rawImg && typeof rawImg === "string") {
        cleanPath = rawImg.replace(/\\/g, "/");
      }

      const imageHtml = cleanPath
        ? `<a href="#" onclick="openImageModal('${encodeURI(cleanPath)}')" title="Xem ảnh">
       <img src="${encodeURI(cleanPath)}" class="table-thumbnail" alt="thumbnail" loading="lazy">
     </a>`
        : "";
      // [KẾT THÚC SỬA] ----------------------------------------------------------

      return `
      <tr>
        <td>${d.MaThietBi}</td>
        <td>${name}</td>
        <td>${d.LoaiThietBi || ""}</td>
        <td>${d.SerialSN || "-"}</td>
        <td>${formatDate(d.NgayNhap)}</td>
        <td><span class="status-badge ${getStatusClass(d.Trangthai)}">${getTranslatedStatus(d.Trangthai)}</span></td>
        <td>${d.Nguoisudung || "-"}</td>
        <td>${d.Vitri || "-"}</td>
        <td data-label="Hình ảnh">${imageHtml}</td>
        <td>${actions}</td>
      </tr>`;
    })
    .join(""); // Nối tất cả thành 1 chuỗi lớn

  devicesTableBody.innerHTML = htmlRows; // Gán 1 lần duy nhất vào DOM
}

function openImageModal(imageSrc) {
  const imageModal = document.getElementById("imageModal");
  const modalImage = document.getElementById("modalImage");
  modalImage.src = decodeURI(imageSrc);
  imageModal.style.display = "flex";
}

document
  .getElementById("closeImageModal")
  .addEventListener("click", closeImageModal);

function closeImageModal() {
  document.getElementById("imageModal").style.display = "none";
}

window.addEventListener("click", (e) => {
  const imageModal = document.getElementById("imageModal");
  if (e.target === imageModal) imageModal.style.display = "none";
});
function renderUsersTable(filteredUsers) {
  const dataToRender = filteredUsers || users;
  usersTableBody.innerHTML = "";
  dataToRender.forEach((u) => {
    const badgeClass = getStatusClass(u.Trangthai) || "status-available";
    const actions =
      window.currentRole === "admin"
        ? /*html*/ `<div class="action-btns">
             <button class="btn btn-primary btn-sm" onclick="editUser('${u.MaNV}')"><i class="fas fa-edit"></i></button>
             <button class="btn btn-danger btn-sm" onclick="confirmDelete('user','${u.MaNV}')"><i class="fas fa-trash"></i></button>
           </div>`
        : ``;
    usersTableBody.innerHTML += `
      <tr>
        <td>${u.MaNV}</td>
        <td>${u.HoVaTen}</td>
        <td>${u.Phongban}</td>
        <td>${u.Thietbisudung || "-"}</td>
        <td>${u.Ngaycap ? formatDate(u.Ngaycap) : "-"}</td>
        <td><span class="status-badge ${badgeClass}">${getTranslatedStatus(
          u.Trangthai || "Chưa cấp",
        )}</span></td>
        <td>${actions}</td>
      </tr>`;
  });
}
function editPurchase(id) {
  const p = purchases.find((x) => x.PurchaseId === id);
  if (!p) return;
  currentPurchaseId = id;
  purchaseForm.reset();

  const select = document.getElementById("purchaseDevice");
  select.innerHTML = ""; // Clear dropdown

  // 👉 Chỉ thêm thiết bị hiện tại vào dropdown
  const opt = document.createElement("option");
  opt.value = p.MaThietBi;
  opt.textContent = `${p.MaThietBi} - ${p.TenThietBi || ""}`;
  select.appendChild(opt);
  select.disabled = true; // ❌ Không cho chọn thiết bị khác

  document.getElementById("purchaseDate").value = formatDate(p.NgayNhap);
  document.getElementById("purchasePrice").value = p.ThanhTien || "";
  document.getElementById("purchaseSource").value = p.NguonMua || "";
  document.getElementById("purchaseModalTitle").textContent = t(
    "editPurchaseModalTitle",
  );
  purchaseModal.style.display = "flex";
}

function renderPurchasesTable(dataToRender) {
  if (!purchasesTableBody) return;
  purchasesTableBody.innerHTML = "";

  dataToRender.forEach((p) => {
    const amount = formatCurrencyVND(p.ThanhTien);

    const srcRaw = (p.NguonMua || "").toString().trim().toUpperCase();
    let srcClass = "purchase-source-other";
    let srcLabel = srcRaw || "-";
    if (srcRaw === "VN") {
      srcClass = "purchase-source-vn";
      srcLabel = "VN";
    } else if (srcRaw === "CN") {
      srcClass = "purchase-source-cn";
      srcLabel = "CN";
    }

    const actions =
      window.currentRole === "admin"
        ? /*html*/ `<div class="action-btns">
             <button class="btn btn-primary btn-sm" onclick="editPurchase(${p.PurchaseId})"><i class="fas fa-edit"></i></button>
             <button class="btn btn-danger btn-sm" onclick="confirmDelete('purchase', ${p.PurchaseId})"><i class="fas fa-trash"></i></button>
           </div>`
        : "";

    purchasesTableBody.innerHTML += `
      <tr>
        <td>${p.MaThietBi}</td>
        <td>${p.TenThietBi || ""}</td>
        <td>${p.LoaiThietBi || ""}</td>
        <td>${formatDate(p.NgayNhap)}</td>
        <td>${amount}</td>
        <td>
          <span class="purchase-source-badge ${srcClass}">
            ${srcLabel}
          </span>
        </td>
        <td>${actions}</td>
      </tr>
    `;
  });
}

function sortData(data, sortInfo) {
  const { key, order } = sortInfo;
  const multiplier = order === "asc" ? 1 : -1;

  data.sort((a, b) => {
    let valA = a[key] || "";
    let valB = b[key] || "";

    // Handle date sorting
    if (key === "NgayNhap" || key === "Ngaycap") {
      valA = valA ? new Date(valA).getTime() : 0;
      valB = valB ? new Date(valB).getTime() : 0;
      return (valA - valB) * multiplier;
    }

    // Handle string sorting with localeCompare
    if (typeof valA === "string" && typeof valB === "string") {
      return valA.localeCompare(valB, "vi") * multiplier;
    }

    // Fallback for other types (numbers, etc.)
    return (valA > valB ? 1 : valA < valB ? -1 : 0) * multiplier;
  });
}

/* =========================================
   2. HÀM LỌC VÀ HIỂN THỊ (ĐÃ CẬP NHẬT LOGIC TABS)
   ========================================= */
function applyFiltersAndRender() {
  let filtered = devices;

  // --- Lọc theo ô tìm kiếm ---
  const deviceSearchInput = document.getElementById("deviceSearchInput");
  if (deviceSearchInput) {
    const term = deviceSearchInput.value.toLowerCase().trim();
    if (term) {
      filtered = filtered.filter((d) => {
        return (
          (d.MaThietBi || "").toLowerCase().includes(term) ||
          (d.TenThietBi || "").toLowerCase().includes(term) ||
          (d.SerialSN || "").toLowerCase().includes(term)
        );
      });
    }
  }

  // --- Lọc theo Tab Trạng Thái ---
  if (currentTabStatus) {
    filtered = filtered.filter((d) => d.Trangthai === currentTabStatus);
  }

  // --- Sắp xếp ---
  sortData(filtered, deviceSort);

  // [QUAN TRỌNG] TÍNH TOÁN PHÂN TRANG (CẮT DỮ LIỆU)
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / ROWS_PER_PAGE) || 1;

  if (deviceCurrentPage > totalPages) deviceCurrentPage = 1;

  const start = (deviceCurrentPage - 1) * ROWS_PER_PAGE;
  const end = start + ROWS_PER_PAGE;
  const dataOnPage = filtered.slice(start, end); // Chỉ lấy 10 dòng để hiển thị

  // Render bảng với dữ liệu ĐÃ CẮT
  renderDevicesTable(dataOnPage);

  // Render thanh phân trang (Truyền đúng ID chuỗi "devicesPagination")
  renderPagination(
    "devicesPagination",
    deviceCurrentPage,
    totalItems,
    ROWS_PER_PAGE,
    (page) => {
      deviceCurrentPage = page;
      applyFiltersAndRender();
    },
  );
}

function applyPurchasesFiltersAndRender() {
  if (!purchasesTableBody) return;

  const term = purchaseSearchInput.value.toLowerCase().trim();
  const sourceFilter = purchaseSourceFilter.value; // "", "VN", "CN", "OTHER"

  // reset page nếu filter thay đổi
  if (
    applyPurchasesFiltersAndRender.lastTerm !== term ||
    applyPurchasesFiltersAndRender.lastSource !== sourceFilter
  ) {
    purchasesCurrentPage = 1;
  }

  const filtered = purchases.filter((p) => {
    const matchesSearch =
      !term ||
      (p.MaThietBi || "").toLowerCase().includes(term) ||
      (p.TenThietBi || "").toLowerCase().includes(term) ||
      (p.LoaiThietBi || "").toLowerCase().includes(term);

    let matchesSource = true;
    const srcRaw = (p.NguonMua || "").toString().trim().toUpperCase();

    if (sourceFilter === "VN" || sourceFilter === "CN") {
      matchesSource = srcRaw === sourceFilter;
    } else if (sourceFilter === "OTHER") {
      matchesSource = srcRaw && srcRaw !== "VN" && srcRaw !== "CN";
    }

    return matchesSearch && matchesSource;
  });

  applyPurchasesFiltersAndRender.lastTerm = term;
  applyPurchasesFiltersAndRender.lastSource = sourceFilter;

  // 👇 sort theo tiêu chí hiện tại (giống devices/users)
  sortData(filtered, purchasesSort);

  // Đảm bảo currentPage không lớn hơn tổng số trang hiện có
  const totalPurchasePages = Math.ceil(filtered.length / ROWS_PER_PAGE);
  if (totalPurchasePages === 0) {
    purchasesCurrentPage = 1;
  } else if (purchasesCurrentPage > totalPurchasePages) {
    purchasesCurrentPage = totalPurchasePages;
  }

  // Paginate purchases
  const startIndex = (purchasesCurrentPage - 1) * ROWS_PER_PAGE;
  const paginatedPurchases = filtered.slice(
    startIndex,
    startIndex + ROWS_PER_PAGE,
  );

  renderPurchasesTable(paginatedPurchases);

  renderPagination(
    "purchasesPagination",
    purchasesCurrentPage,
    filtered.length,
    ROWS_PER_PAGE,
    (page) => {
      purchasesCurrentPage = page;
      applyPurchasesFiltersAndRender();
    },
  );

  // Cập nhật UI cho cột sort
  updateSortUI();
}

function updateSortUI() {
  // Clear previous sort indicators
  document
    .querySelectorAll("th.sortable")
    .forEach((th) => th.classList.remove("sorted-asc", "sorted-desc"));

  // Add indicator to current sorted column for devices
  const deviceTh = document.querySelector(
    `#devicesTable th[data-sort-key="${deviceSort.key}"]`,
  );
  if (deviceTh) deviceTh.classList.add(`sorted-${deviceSort.order}`);

  // Add indicator to current sorted column for users
  const userTh = document.querySelector(
    `#usersTable th[data-sort-key="${userSort.key}"]`,
  );
  if (userTh) userTh.classList.add(`sorted-${userSort.order}`);

  // 👇 Add indicator cho purchases
  const purchasesTh = document.querySelector(
    `#purchasesTable th[data-sort-key="${purchasesSort.key}"]`,
  );
  if (purchasesTh) purchasesTh.classList.add(`sorted-${purchasesSort.order}`);
}

function renderPagination(
  containerId,
  currentPage,
  totalItems,
  rowsPerPage,
  onPageClick,
) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const totalPages = Math.ceil(totalItems / rowsPerPage);
  container.innerHTML = "";

  if (totalPages <= 1) return;

  let paginationHTML = "";

  // Previous button
  paginationHTML += `<button class="pagination-btn" ${
    currentPage === 1 ? "disabled" : ""
  } onclick="(${onPageClick.toString()})(${currentPage - 1})">${t(
    "pagination_prev",
  )}</button>`;

  // Page numbers
  // Logic to show limited page numbers (e.g., 1 ... 4 5 6 ... 10)
  const maxPagesToShow = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
  let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

  if (endPage - startPage + 1 < maxPagesToShow) {
    startPage = Math.max(1, endPage - maxPagesToShow + 1);
  }

  if (startPage > 1) {
    paginationHTML += `<button class="pagination-btn" onclick="(${onPageClick.toString()})(1)">1</button>`;
    if (startPage > 2) {
      paginationHTML += `<span class="pagination-ellipsis">...</span>`;
    }
  }

  for (let i = startPage; i <= endPage; i++) {
    paginationHTML += `<button class="pagination-btn ${
      i === currentPage ? "active" : ""
    }" onclick="(${onPageClick.toString()})(${i})">${i}</button>`;
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) {
      paginationHTML += `<span class="pagination-ellipsis">...</span>`;
    }
    paginationHTML += `<button class="pagination-btn" onclick="(${onPageClick.toString()})(${totalPages})">${totalPages}</button>`;
  }

  // Next button
  paginationHTML += `<button class="pagination-btn" ${
    currentPage === totalPages ? "disabled" : ""
  } onclick="(${onPageClick.toString()})(${currentPage + 1})">${t(
    "pagination_next",
  )}</button>`;

  container.innerHTML = paginationHTML;
}

/***********************
 * STATS & CHARTS
 ***********************/
function updateStats() {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const total = devices.length;

  // Lọc theo đúng chuỗi trong Database
  const active = devices.filter((d) => d.Trangthai === "Đang sử dụng").length;
  const maintenance = devices.filter((d) => d.Trangthai === "Bảo Hành").length;
  const broken = devices.filter((d) => d.Trangthai === "Hư Hỏng").length; // Đếm hư hỏng
  const available = devices.filter((d) => d.Trangthai === "Sẵn sàng").length;

  // Gán giá trị vào thẻ HTML
  if (totalDevicesEl) totalDevicesEl.textContent = total;
  if (activeDevicesEl) activeDevicesEl.textContent = active;
  if (maintenanceDevicesEl) maintenanceDevicesEl.textContent = maintenance;
  if (availableDevicesEl) availableDevicesEl.textContent = available;
  if (brokenDevicesEl) brokenDevicesEl.textContent = broken; // Gán số lượng hư hỏng

  // Tính thiết bị mới trong tháng
  const newDevices = devices.filter((d) => {
    const purchaseDate = new Date(d.NgayNhap);
    return (
      !isNaN(purchaseDate) &&
      purchaseDate.getFullYear() === currentYear &&
      purchaseDate.getMonth() === currentMonth
    );
  }).length;

  if (newDevicesTextEl)
    newDevicesTextEl.textContent = `+${newDevices} ${t("newDevicesThisMonth")}`;

  // Tính % hiển thị
  if (activePercentEl)
    activePercentEl.textContent = `${percent(active, total)}% ${t("ofTotalDevices")}`;
  if (maintenancePercentEl)
    maintenancePercentEl.textContent = `${percent(maintenance, total)}% ${t("ofTotalDevices")}`;
  if (availablePercentEl)
    availablePercentEl.textContent = `${percent(available, total)}% ${t("ofTotalDevices")}`;
  if (brokenPercentEl)
    brokenPercentEl.textContent = `${percent(broken, total)}% ${t("ofTotalDevices")}`;

  // Cập nhật số lượng trên các Tabs bộ lọc (nếu có id tương ứng)
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setTxt("count-all", total);
  setTxt("count-available", available);
  setTxt("count-inuse", active);
  setTxt("count-maintenance", maintenance);
  setTxt("count-broken", broken);
}

function initCharts() {
  // --- Year dropdown: chỉ 2025-2026 ---
  populateYearSelector(["2025", "2026"], 2025);

  // --- TWO monthly charts for Overview: 2025 & 2026 ---
  const monthlyStats2025 = getMonthlyStats(2025);
  const monthlyStats2026 = getMonthlyStats(2026);

  if (monthlyChart) monthlyChart.destroy();
  if (monthlyChart2026) monthlyChart2026.destroy();
  if (yearlyChart) yearlyChart.destroy();

  // set headings text (nếu có span trên trang)
  if (overviewChartYear1El) overviewChartYear1El.textContent = "2025";
  if (overviewChartYear2El) overviewChartYear2El.textContent = "2026";

  if (monthlyChartCtx) {
    monthlyChart = new Chart(monthlyChartCtx, {
      type: "bar",
      data: {
        labels: monthlyStats2025.labels,
        datasets: [
          {
            label: t("chart_total"),
            data: monthlyStats2025.purchased,
            backgroundColor: "rgba(52,152,219,0.7)",
          },
          {
            label: t("chart_in_use"),
            data: monthlyStats2025.active,
            backgroundColor: "rgba(46,204,113,0.7)",
          },
          {
            label: t("chart_warranty"),
            data: monthlyStats2025.maintenance,
            backgroundColor: "rgba(243,156,18,0.7)",
          },
          {
            label: t("chart_broken"),
            data: monthlyStats2025.broken,
            backgroundColor: "rgba(231,76,60,0.7)",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Click cột -> nhảy tới Danh sách thiết bị tháng tương ứng của năm 2025
        onClick: (evt, elements, chart) => {
          const activePoints =
            (elements && elements.length
              ? elements
              : chart.getElementsAtEventForMode(
                  evt,
                  "nearest",
                  { intersect: true },
                  true,
                )) || [];
          if (!activePoints.length) return;

          const firstPoint = activePoints[0];
          const monthIndex = firstPoint.index; // 0..11
          navigateToDevicesByMonth(2025, monthIndex + 1);
        },
        plugins: {
          title: {
            display: true,
            text: `${t("chart_monthly_stats_title")} (2025)`,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1, // Đảm bảo các bước nhảy là số nguyên
              callback: (value) =>
                Number.isInteger(value) ? value : undefined,
            },
          },
        },
      },
    });
  }

  if (monthlyChart2026Ctx) {
    monthlyChart2026 = new Chart(monthlyChart2026Ctx, {
      type: "bar",
      data: {
        labels: monthlyStats2026.labels,
        datasets: [
          {
            label: t("chart_total"),
            data: monthlyStats2026.purchased,
            backgroundColor: "rgba(52,152,219,0.7)",
          },
          {
            label: t("chart_in_use"),
            data: monthlyStats2026.active,
            backgroundColor: "rgba(46,204,113,0.7)",
          },
          {
            label: t("chart_warranty"),
            data: monthlyStats2026.maintenance,
            backgroundColor: "rgba(243,156,18,0.7)",
          },
          {
            label: t("chart_broken"),
            data: monthlyStats2026.broken,
            backgroundColor: "rgba(231,76,60,0.7)",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        // Click cột -> nhảy tới Danh sách thiết bị tháng tương ứng của năm 2026
        onClick: (evt, elements, chart) => {
          const activePoints =
            (elements && elements.length
              ? elements
              : chart.getElementsAtEventForMode(
                  evt,
                  "nearest",
                  { intersect: true },
                  true,
                )) || [];
          if (!activePoints.length) return;

          const firstPoint = activePoints[0];
          const monthIndex = firstPoint.index; // 0..11
          navigateToDevicesByMonth(2026, monthIndex + 1);
        },
        plugins: {
          title: {
            display: true,
            text: `${t("chart_monthly_stats_title")} (2026)`,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1, // Đảm bảo các bước nhảy là số nguyên
              callback: (value) =>
                Number.isInteger(value) ? value : undefined,
            },
          },
        },
      },
    });
  }
}

function getMonthlyStats(year) {
  const months = Array.from({ length: 12 }, (_, i) => t(`month_${i + 1}`));
  const purchased = Array(12).fill(0);
  const active = Array(12).fill(0);
  const maintenance = Array(12).fill(0);
  const broken = Array(12).fill(0);

  devices.forEach((d) => {
    const purchaseDate = new Date(d.NgayNhap);
    if (!isNaN(purchaseDate) && purchaseDate.getFullYear() === year) {
      const month = purchaseDate.getMonth();
      purchased[month]++;
      switch (d.Trangthai) {
        case "Đang sử dụng":
          active[month]++;
          break;
        case "Bảo Hành":
          maintenance[month]++;
          break;
        case "Hư Hỏng":
          broken[month]++;
          break;
      }
    }
  });

  return { labels: months, purchased, active, maintenance, broken };
}

function populateYearSelector(years, selectedYear) {
  if (!yearlyChartYearSelector) return;
  yearlyChartYearSelector.innerHTML = "";
  years.forEach((year) => {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    if (parseInt(year) === selectedYear) option.selected = true;
    yearlyChartYearSelector.appendChild(option);
  });
}

/* ===== YEARLY CHART (1 năm – 4 cột) + custom legend dưới biểu đồ ===== */
function updateChartSection(year) {
  if (!yearlyChartCtx) return;

  const canvasEl = document.getElementById("yearlyChart");
  if (!canvasEl || canvasEl.offsetWidth === 0) {
    setTimeout(() => updateChartSection(year), 50);
    return;
  }

  const yNum = parseInt(year);
  const inYear = devices.filter((d) => {
    const dt = new Date(d.NgayNhap);
    return !isNaN(dt) && dt.getFullYear() === yNum;
  });

  const totalPurchased = inYear.length;
  const totalActive = inYear.filter(
    (d) => d.Trangthai === "Đang sử dụng",
  ).length;
  const totalMaintenance = inYear.filter(
    (d) => d.Trangthai === "Bảo Hành",
  ).length;
  const totalBroken = inYear.filter((d) => d.Trangthai === "Hư Hỏng").length;

  // Cập nhật 4 nhãn và 4 màu sắc
  const labels = [
    t("chart_total"),
    t("chart_in_use"),
    t("chart_warranty"),
    t("chart_broken"),
  ];
  const data = [totalPurchased, totalActive, totalMaintenance, totalBroken];
  const colors = [
    "rgba(52, 152, 219, 0.7)", // Tổng số (Blue)
    "rgba(46, 204, 113, 0.7)", // Đang sử dụng (Green)
    "rgba(243, 156, 18, 0.7)", // Bảo Hành (Orange)
    "rgba(231, 76, 60, 0.7)", // Hư Hỏng (Red)
  ];

  if (yearlyChart) yearlyChart.destroy();
  yearlyChart = new Chart(yearlyChartCtx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: t("chart_legend_amount"),
          data,
          backgroundColor: colors,
          borderWidth: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            stepSize: 1,
            callback: (value) => (Number.isInteger(value) ? value : undefined),
          },
        },
      },
    },
  });

  renderYearlyLegend(colors, labels);

  // Cập nhật số liệu text bên dưới biểu đồ
  if (yearlyPurchasedEl) yearlyPurchasedEl.textContent = totalPurchased;
  if (yearlyActiveEl) yearlyActiveEl.textContent = totalActive;
  if (yearlyMaintenanceEl) yearlyMaintenanceEl.textContent = totalMaintenance;
  if (yearlyBrokenEl) yearlyBrokenEl.textContent = totalBroken; // Đã thêm ID này vào HTML chưa?

  if (selectedYearTextEl) selectedYearTextEl.textContent = String(year);

  if (yearlyActivePercentEl)
    yearlyActivePercentEl.textContent = `${percent(totalActive, totalPurchased)}% ${t("ofTotalDevicesInYear")}`;
  if (yearlyMaintenancePercentEl)
    yearlyMaintenancePercentEl.textContent = `${percent(totalMaintenance, totalPurchased)}% ${t("ofTotalDevicesInYear")}`;
  if (yearlyBrokenPercentEl)
    yearlyBrokenPercentEl.textContent = `${percent(totalBroken, totalPurchased)}% ${t("ofTotalDevicesInYear")}`;
}

function renderYearlyLegend(colors, labels) {
  const canvas = document.getElementById("yearlyChart");
  if (!canvas) return;

  let legend = document.getElementById("yearlyLegend");
  if (!legend) {
    legend = document.createElement("div");
    legend.id = "yearlyLegend";
    legend.style.display = "flex";
    legend.style.flexWrap = "wrap";
    legend.style.gap = "16px";
    legend.style.marginTop = "12px";
    legend.style.justifyContent = "center"; // Căn giữa các mục chú thích
    legend.style.alignItems = "center";
    // Chèn vào sau chart-wrapper để nằm trong chart-container
    canvas.parentElement.insertAdjacentElement("afterend", legend);
  }

  const items = labels.map((label, index) => ({
    color: colors[index],
    text: label,
  }));

  legend.innerHTML = items
    .map(
      (it) =>
        `<div style="display:flex;align-items:center;gap:8px;">
           <span style="display:inline-block;width:16px;height:16px;border-radius:3px;background:${it.color}"></span>
           <span style="font-size:14px;color:#444">${it.text}</span>
         </div>`,
    )
    .join("");
}

/***********************
 * CRUD THIẾT BỊ
 ***********************/
function addDevice() {
  currentDeviceId = null;
  deviceForm.reset();
  handleCategoryChange();
  loadUsersForDeviceSelect();
  ensureQrUI();
  resetQrUI();
  deviceModal.style.display = "flex";
}
function editDevice(id) {
  const d = devices.find((x) => x.MaThietBi === id);
  if (!d) return;
  currentDeviceId = id;
  deviceForm.reset();
  handleCategoryChange();
  document.getElementById("MaThietBi").value = d.MaThietBi;
  document.getElementById("TenThietBi").value = d.TenThietBi;

  const typeNorm = normalizeLoaiThietBi(d.LoaiThietBi);

  const category = getDeviceCategory(typeNorm);
  if (category) {
    const radio = document.querySelector(
      `input[name="deviceCategoryRadio"][value="${category}"]`,
    );
    if (radio) radio.checked = true;

    handleCategoryChange(typeNorm);
  }

  document.getElementById("SerialSN").value = d.SerialSN || "";
  document.getElementById("NgayNhap").value = formatDate(d.NgayNhap);
  document.getElementById("Trangthai").value = d.Trangthai;
  loadUsersForDeviceSelect(d.Nguoisudung);
  document.getElementById("Vitri").value = d.Vitri || "";

  ensureQrUI();
  resetQrUI();
  deviceModal.style.display = "flex";
}
async function saveDevice() {
  // [ĐOẠN CODE MỚI THÊM] ==============================================
  // Tự động xóa người dùng nếu trạng thái là Sẵn sàng/Bảo hành/Hư hỏng
  const statusEl = document.getElementById("Trangthai");
  const userEl = document.getElementById("Nguoisudung");

  if (statusEl && userEl) {
    const chosenStatus = statusEl.value;
    // Nếu trạng thái KHÔNG PHẢI là "Đang sử dụng", thì reset người dùng về rỗng
    if (["Sẵn sàng", "Bảo Hành", "Hư Hỏng"].includes(chosenStatus)) {
      userEl.value = "";
    }
  }
  // [KẾT THÚC ĐOẠN MỚI] ===============================================
  const payload = {
    MaThietBi: document.getElementById("MaThietBi").value.trim(),
    TenThietBi: document.getElementById("TenThietBi").value.trim(),
    LoaiThietBi: document.getElementById("LoaiThietBi").value,
    SerialSN: document.getElementById("SerialSN").value.trim(),
    NgayNhap: document.getElementById("NgayNhap").value,
    Trangthai: document.getElementById("Trangthai").value,
    Nguoisudung: document.getElementById("Nguoisudung").value || null,
    Vitri: document.getElementById("Vitri").value.trim(),
  };

  // [CHÈN VÀO SAU ĐOẠN KHAI BÁO PAYLOAD] ------------------------------------

  // 1. [SỬA] Nếu chọn "Đang sử dụng" mà không chọn người -> Cho phép đi tiếp để Backend tự khôi phục
  // Chỉ báo lỗi nếu là THÊM MỚI (vì thêm mới không có lịch sử để khôi phục)
  if (
    !currentDeviceId &&
    payload.Trangthai === "Đang sử dụng" &&
    !payload.Nguoisudung
  ) {
    return showAlert(
      "❌ Khi thêm mới với trạng thái 'Đang sử dụng', bạn bắt buộc phải chọn 'Người sử dụng'!",
      false,
    );
  }

  // 2. Nếu chọn các trạng thái khác -> Đảm bảo xóa người dùng để không lưu rác
  if (["Sẵn sàng", "Bảo Hành", "Hư Hỏng"].includes(payload.Trangthai)) {
    payload.Nguoisudung = null;
  }
  // [KẾT THÚC ĐOẠN CHÈN] ----------------------------------------------------

  if (!payload.MaThietBi || !payload.TenThietBi)
    return showAlert(t("alert_enter_device_code_name"), false);
  if (!payload.LoaiThietBi)
    return showAlert(t("alert_select_device_type"), false);
  if (!payload.NgayNhap || isNaN(new Date(payload.NgayNhap).getTime()))
    return showAlert(t("alert_invalid_import_date"), false);

  if (payload.SerialSN) {
    const serialNorm = payload.SerialSN.trim().toLowerCase();
    const dup = devices.some(
      (d) =>
        (d.SerialSN || "").trim().toLowerCase() === serialNorm &&
        (currentDeviceId ? d.MaThietBi !== currentDeviceId : true),
    );
    if (dup) {
      showAlert(t("alert_serial_exists"), false);
      document.getElementById("SerialSN").focus();
      return;
    }
    if (!payload.Vitri) payload.Vitri = null;
  }

  const chosenStatus = document.getElementById("Trangthai").value;
  payload.Trangthai =
    chosenStatus || (payload.Nguoisudung ? "Đang sử dụng" : "Sẵn sàng");

  const url = currentDeviceId
    ? `/api/devices/${currentDeviceId}`
    : "/api/devices";
  const method = currentDeviceId ? "PUT" : "POST";

  const ok = await fetchJson(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (ok === null) return;

  deviceModal.style.display = "none";
  await loadAllData();
  showAlert(t("alert_save_device_success"), true);
}

/***********************
 * CRUD NGƯỜI DÙNG
 ***********************/
function addUser() {
  currentUserId = null;
  userForm.reset();
  loadDevicesForUserSelect();
  userModal.style.display = "flex";
}
function editUser(id) {
  const u = users.find((x) => x.MaNV === id);
  if (!u) return;
  currentUserId = id;
  document.getElementById("userCode").value = u.MaNV;
  document.getElementById("userName").value = u.HoVaTen;
  document.getElementById("userDepartment").value = u.Phongban;
  loadDevicesForUserSelect(u.Thietbisudung);
  document.getElementById("assignDate").value = u.Ngaycap
    ? formatDate(u.Ngaycap)
    : "";
  userModal.style.display = "flex";
}
async function saveUser() {
  const ngayCapValue = document.getElementById("assignDate").value;
  const deviceValue = document.getElementById("userDevice").value;

  const payload = {
    MaNV: document.getElementById("userCode").value.trim(),
    HoVaTen: document.getElementById("userName").value.trim(),
    Phongban: document.getElementById("userDepartment").value,
    Thietbisudung: deviceValue || null,
    Ngaycap: ngayCapValue || null,
    Trangthai: deviceValue ? "Đang sử dụng" : "Chưa cấp",
  };

  if (!payload.MaNV || !payload.HoVaTen)
    return showAlert(t("alert_enter_employee_code_name"), false);

  const prevUser = currentUserId
    ? users.find((x) => x.MaNV === currentUserId)
    : null;
  const prevDeviceId = prevUser?.Thietbisudung || null;

  const url = currentUserId ? `/api/users/${currentUserId}` : "/api/users";
  const method = currentUserId ? "PUT" : "POST";

  const ok = await fetchJson(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (ok === null) return;

  try {
    if (prevDeviceId && prevDeviceId !== payload.Thietbisudung) {
      const prevDev = devices.find((d) => d.MaThietBi === prevDeviceId);
      await updateDeviceFull(prevDev, {
        Trangthai: "Sẵn sàng",
        Nguoisudung: null,
      });
    }
    if (payload.Thietbisudung) {
      const newDev = devices.find((d) => d.MaThietBi === payload.Thietbisudung);
      await updateDeviceFull(newDev, {
        Trangthai: "Đang sử dụng",
        Nguoisudung: payload.HoVaTen,
      });
    }
  } catch (e) {
    console.error("Lỗi đồng bộ thiết bị cho người dùng:", e);
  }

  userModal.style.display = "none";
  await loadAllData();
  showAlert(t("alert_save_user_success"), true);
}

/***********************
 * CRUD THÔNG TIN MUA HÀNG
 ***********************/
function addPurchase() {
  // Đặt lại ID để đảm bảo đây là thao tác THÊM MỚI
  currentPurchaseId = null;
  document.getElementById("purchaseModalTitle").textContent = t(
    "addPurchaseModalTitle",
  );
  purchaseForm.reset();
  // Tải danh sách thiết bị chưa được mua vào dropdown
  populateDeviceDropdownForPurchase(null);

  document.getElementById("purchaseDate").value = formatDate(new Date());

  purchaseModal.style.display = "flex";
}

async function savePurchase() {
  const payload = {
    MaThietBi: document.getElementById("purchaseDevice").value,
    NgayNhap: document.getElementById("purchaseDate").value,
    ThanhTien: document.getElementById("purchasePrice").value || null,
    NguonMua: document.getElementById("purchaseSource").value.trim() || null,
  };

  if (!payload.MaThietBi) {
    return showAlert(t("alert_select_device"), false);
  }
  if (!payload.NgayNhap) {
    return showAlert(t("alert_invalid_import_date"), false);
  }

  // Quyết định dùng POST (thêm mới) hay PUT (sửa)
  const url = currentPurchaseId
    ? `/api/purchases/${currentPurchaseId}`
    : "/api/purchases";
  const method = currentPurchaseId ? "PUT" : "POST";

  const ok = await fetchJson(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (ok === null) {
    // Lỗi đã được fetchJson hiển thị, không làm gì thêm
    return;
  }

  purchaseModal.style.display = "none";
  await loadPurchases(); // load lại danh sách mua hàng
  applyPurchasesFiltersAndRender(); // render lại bảng
  showAlert(t("alert_save_purchase_success"), true);
}

/***********************
 * XOÁ
 ***********************/
function confirmDelete(type, id) {
  if (window.currentRole !== "admin") {
    showAlert(t("alert_no_delete_permission"), false);
    return;
  }
  deleteType = type;
  deleteId = id;
  const messageEl = document.getElementById("deleteMessage");
  messageEl.textContent = t("deleteConfirmMessage"); // Reset to default
  deleteModal.style.display = "flex";
}

async function deleteItem() {
  let prevDeviceForUser = null;
  let usersUsingDevice = [];

  if (deleteType === "user") {
    const u = users.find((x) => x.MaNV === deleteId);
    prevDeviceForUser = u?.Thietbisudung || null;
  } else if (deleteType === "device") {
    usersUsingDevice = users.filter((u) => u.Thietbisudung === deleteId);
  }

  let url;
  if (deleteType === "device") url = `/api/devices/${deleteId}`;
  else if (deleteType === "user") url = `/api/users/${deleteId}`;
  else if (deleteType === "purchase") url = `/api/purchases/${deleteId}`;
  else return;

  deleteModal.style.display = "none";
  const res = await fetchJson(url, { method: "DELETE" });
  if (res === null) return;

  showAlert(t("alert_delete_success"), true);

  if (deleteType === "device") await loadDevices();
  else if (deleteType === "user") await loadUsers();
  else if (deleteType === "purchase") {
    await loadPurchases();
    applyPurchasesFiltersAndRender();
  }
}

/***********************
 * HELPERS
 ***********************/
function normalizeLoaiThietBi(v) {
  if (v === null || v === undefined) return "";
  return String(v)
    .replace(/\r?\n+/g, " ") // xoá xuống dòng
    .trim()
    .replace(/\s+/g, " "); // gộp nhiều khoảng trắng
}

function normalizeLoaiThietBiCompact(v) {
  return normalizeLoaiThietBi(v)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // bỏ dấu tiếng Việt
    .replace(/[^a-z0-9]+/g, ""); // chỉ giữ chữ/số để so khớp
}

function getStatusClass(status) {
  if (!status) return "";
  const norm = status
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (norm === "dang su dung") return "status-active";
  if (norm === "bao hanh") return "status-maintenance";
  if (norm === "san sang" || norm === "chua cap") return "status-available";
  if (norm === "hu hong") return "status-broken";
  return "";
}
function percent(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}
function getTranslatedStatus(status) {
  if (!status) return "";
  const keyMap = {
    "Đang sử dụng": "status_in_use",
    "Bảo Hành": "status_warranty",
    "Sẵn sàng": "status_available",
    "Hư Hỏng": "status_broken",
    "Chưa cấp": "status_not_issued",
  };
  const key = keyMap[status];
  return key ? t(key) : status;
}
function t(key) {
  const lang = currentLang || "vi";
  return translations[lang]?.[key] || key;
}

function formatDate(date) {
  if (!date) return "-";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "-";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function formatCurrencyVND(value, blankIfEmpty = false) {
  if (value === null || value === undefined || value === "") {
    return blankIfEmpty ? "" : "-";
  }
  const num = Number(value);
  if (Number.isNaN(num)) {
    return blankIfEmpty ? "" : "-";
  }
  return `${num.toLocaleString("vi-VN")} VNĐ`;
}

function showAlert(message, isSuccess) {
  const el = document.createElement("div");
  el.className = `alert ${isSuccess ? "alert-success" : "alert-danger"}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => {
    el.classList.add("fade-out");
    setTimeout(() => el.remove(), 500);
  }, 3000);
}
async function updateDeviceFull(dev, overrides = {}) {
  if (!dev) return null;
  const body = {
    TenThietBi: dev.TenThietBi || "",
    LoaiThietBi: dev.LoaiThietBi || "",
    SerialSN: dev.SerialSN || "",
    NgayNhap: dev.NgayNhap ? formatDate(dev.NgayNhap) : null,
    Trangthai: dev.Trangthai || "Sẵn sàng",
    Nguoisudung: dev.Nguoisudung || null,
    Vitri: dev.Vitri || null, // [FIX] Thêm dòng này để giữ lại Vị trí cũ
    ...overrides,
  };
  return fetchJson(`/api/devices/${dev.MaThietBi}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function updateUserFull(user, overrides = {}) {
  if (!user) return null;
  const body = {
    HoVaTen: user.HoVaTen || "",
    Phongban: user.Phongban || "",
    Thietbisudung: user.Thietbisudung || null,
    Ngaycap: user.Ngaycap ? formatDate(user.Ngaycap) : null,
    Trangthai: user.Trangthai || "Chưa cấp",
    ...overrides,
  };
  return fetchJson(`/api/users/${user.MaNV}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function loadUsersForDeviceSelect(selected = null) {
  const sel = document.getElementById("Nguoisudung");
  sel.innerHTML = `<option value="">${t("noUser")}</option>`;
  users.forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u.MaNV;
    opt.textContent = `${u.HoVaTen} (${u.MaNV})`;
    if (selected && (u.MaNV === selected || u.HoVaTen === selected))
      opt.selected = true;
    sel.appendChild(opt);
  });
}
function loadDevicesForUserSelect(selectedId = null) {
  const sel = document.getElementById("userDevice");
  sel.innerHTML = `<option value="">${t("noUser")}</option>`;
  devices
    .filter((d) => d.Trangthai === "Sẵn sàng" || d.MaThietBi === selectedId)
    .forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d.MaThietBi;
      opt.textContent = `${d.TenThietBi} (${d.MaThietBi})`;
      if (selectedId && d.MaThietBi === selectedId) opt.selected = true;
      sel.appendChild(opt);
    });
}

/**
 * Điều hướng đến trang danh sách thiết bị và áp dụng bộ lọc trạng thái.
 * @param {string} status - Trạng thái cần lọc (ví dụ: 'Đang sử dụng').
 */
function navigateToDevicesWithFilter(status) {
  // Tìm link "Danh sách thiết bị" trong sidebar và click vào nó
  const deviceListLink = document.querySelector('a[data-section="devices"]');
  if (deviceListLink) {
    deviceListLink.click();
  }

  // Đặt giá trị cho bộ lọc trạng thái và áp dụng
  deviceStatusFilter.value = status;
  applyFiltersAndRender();
}

// Điều hướng từ biểu đồ -> Danh sách thiết bị theo tháng nhập
function navigateToDevicesByMonth(year, month) {
  // Mở tab "Danh sách thiết bị"
  const deviceListLink = document.querySelector('a[data-section="devices"]');
  if (deviceListLink) {
    deviceListLink.click();
  }

  // Xoá filter cũ để tránh lọc chồng
  deviceSearchInput.value = "";
  deviceStatusFilter.value = "";

  // Lưu filter tháng + reset về trang 1
  deviceDateFilter = { year, month };
  deviceCurrentPage = 1;

  // Render lại bảng theo filter mới
  applyFiltersAndRender();
}

/***********************
 * EVENTS
 ***********************/
loginBtn.addEventListener("click", async () => {
  const u = document.getElementById("username").value.trim();
  const p = document.getElementById("password").value.trim();
  if (!u || !p) return showAlert(t("alert_enter_user_pass"), false);
  const data = await fetchJson("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u, password: p }),
  });
  if (!data) return;

  window.authToken = data.token;
  window.currentRole = data.role;
  window.currentUsername = data.username;
  window.displayName = data.displayName;

  try {
    const userText = document.getElementById("currentUserText");
    const userAvatar = document.getElementById("userAvatar");
    if (userText) userText.textContent = window.currentUsername;
    if (userAvatar)
      userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
        window.displayName || window.currentUsername,
      )}&background=3498db&color=fff`;
  } catch (_) {}

  loginPage.style.display = "none";
  appContainer.style.display = "block";

  // Kiểm tra quyền để hiện menu Account
  document.getElementById("menuAccountManagement").style.display =
    window.currentRole === "admin" ? "block" : "none";

  // Tải dữ liệu và cập nhật UI sau khi đã có token
  await loadAllData();
  applyTranslations(currentLang); // Áp dụng bản dịch sau khi có dữ liệu để các biểu đồ cũng được dịch

  // Chuyển sang tab Biểu đồ thống kê và cập nhật biểu đồ
  const chartsLink = document.querySelector('a[data-section="chart"]');
  if (chartsLink) {
    // 1. Mở lại các nút trước (đề phòng bị disable từ lần đăng nhập trước)
    if (addDeviceBtn) addDeviceBtn.disabled = false;
    if (addUserBtn) addUserBtn.disabled = false;
    if (addPurchaseBtn) addPurchaseBtn.disabled = false;

    // 2. Chuẩn hóa role (về chữ thường và xóa khoảng trắng thừa) để so sánh
    const safeRole = (window.currentRole || "").trim().toLowerCase();

    // 3. Nếu KHÔNG phải admin thì mới khóa nút
    if (safeRole !== "admin" && safeRole !== "user") {
      if (addDeviceBtn) addDeviceBtn.disabled = true;
      if (addUserBtn) addUserBtn.disabled = true;
      if (addPurchaseBtn) addPurchaseBtn.disabled = true;
    }
    chartsLink.click();
    if (yearlyChartYearSelector) {
      yearlyChartYearSelector.value = "2025";
      updateChartSection(2025);
    }
  }
});

logoutBtn.addEventListener("click", () => {
  window.authToken = null;
  window.currentRole = null;
  window.currentUsername = null;
  window.displayName = null;
  try {
    const userText = document.getElementById("currentUserText");
    const userAvatar = document.getElementById("userAvatar");
    if (userText) userText.textContent = t("notLoggedIn");
    if (userAvatar)
      userAvatar.src =
        "https://ui-avatars.com/api/?name=User&background=3498db&color=fff";
  } catch (_) {}
  appContainer.style.display = "none";
  loginPage.style.display = "flex";
});

addDeviceBtn?.addEventListener("click", addDevice);
addUserBtn?.addEventListener("click", addUser);
exportDevicesExcelBtn?.addEventListener("click", exportDevicesToExcel);
exportUsersExcelBtn?.addEventListener("click", exportUsersToExcel);

// Purchases
exportPurchasesExcelBtn?.addEventListener("click", exportPurchasesToExcel);
addPurchaseBtn?.addEventListener("click", addPurchase);

// Filter/Search events

// --- BẮT ĐẦU ĐOẠN CODE TỐI ƯU (DEBOUNCE) ---
function debounce(func, wait) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

// Tạo các hàm tìm kiếm có độ trễ 400ms
const debouncedDeviceSearch = debounce(() => applyFiltersAndRender(), 400);
const debouncedUserSearch = debounce(() => applyUserFiltersAndRender(), 400);
const debouncedPurchaseSearch = debounce(
  () => applyPurchasesFiltersAndRender(),
  400,
);

// Gán sự kiện tìm kiếm (dùng bản debounce)
deviceSearchInput?.addEventListener("input", debouncedDeviceSearch);
userSearchInput?.addEventListener("input", debouncedUserSearch);
purchaseSearchInput?.addEventListener("input", debouncedPurchaseSearch);

// Các bộ lọc select/dropdown thì giữ nguyên (không cần debounce vì click là chọn ngay)
deviceStatusFilter?.addEventListener("change", applyFiltersAndRender);
userDepartmentFilter?.addEventListener("change", applyUserFiltersAndRender);
purchaseSourceFilter?.addEventListener(
  "change",
  applyPurchasesFiltersAndRender,
);
// --- KẾT THÚC ĐOẠN CODE TỐI ƯU ---

// Sorting events
devicesTableHead?.addEventListener("click", (e) => {
  const th = e.target.closest("th.sortable");
  if (!th) return;
  const key = th.dataset.sortKey;
  if (deviceSort.key === key) {
    deviceSort.order = deviceSort.order === "asc" ? "desc" : "asc";
  } else {
    deviceSort.key = key;
    deviceSort.order = "asc";
    deviceCurrentPage = 1;
  }
  applyFiltersAndRender();
});
usersTableHead?.addEventListener("click", (e) => {
  const th = e.target.closest("th.sortable");
  if (!th) return;
  const key = th.dataset.sortKey;
  if (userSort.key === key) {
    userSort.order = userSort.order === "asc" ? "desc" : "asc";
  } else {
    userSort.key = key;
    userSort.order = "asc";
    userCurrentPage = 1;
  }
  applyFiltersAndRender();
});
purchasesTableHead?.addEventListener("click", (e) => {
  const th = e.target.closest("th.sortable");
  if (!th) return;
  const key = th.dataset.sortKey;
  if (purchasesSort.key === key) {
    purchasesSort.order = purchasesSort.order === "asc" ? "desc" : "asc";
  } else {
    purchasesSort.key = key;
    purchasesSort.order = "asc";
    purchasesCurrentPage = 1;
  }
  applyPurchasesFiltersAndRender();
});

deviceForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  saveDevice();
});
userForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  saveUser();
});

purchaseForm?.addEventListener("submit", (e) => {
  e.preventDefault();
  savePurchase();
});

saveDeviceBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  deviceForm.requestSubmit();
});
saveUserBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  userForm.requestSubmit();
});
savePurchaseBtn?.addEventListener("click", (e) => {
  e.preventDefault();
  purchaseForm.requestSubmit();
});

confirmDeleteBtn?.addEventListener("click", async () => {
  await deleteItem(deleteType, deleteId); // ✅ truyền rõ ràng
});

cancelDeleteBtn?.addEventListener(
  "click",
  () => (deleteModal.style.display = "none"),
);
closeDeleteModal?.addEventListener(
  "click",
  () => (deleteModal.style.display = "none"),
);

cancelDeviceBtn?.addEventListener(
  "click",
  () => (deviceModal.style.display = "none"),
);
closeDeviceModal?.addEventListener(
  "click",
  () => (deviceModal.style.display = "none"),
);

cancelUserBtn?.addEventListener(
  "click",
  () => (userModal.style.display = "none"),
);
closeUserModal?.addEventListener(
  "click",
  () => (userModal.style.display = "none"),
);
cancelPurchaseBtn?.addEventListener(
  "click",
  () => (purchaseModal.style.display = "none"),
);
closePurchaseModal?.addEventListener(
  "click",
  () => (purchaseModal.style.display = "none"),
);

window.addEventListener("click", (e) => {
  if (e.target === deviceModal) deviceModal.style.display = "none";
  if (e.target === userModal) userModal.style.display = "none";
  if (e.target === purchaseModal) {
    purchaseModal.style.display = "none";
  }
  if (e.target === deleteModal) deleteModal.style.display = "none";
});

// Menu switching
menuItems.forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    menuItems.forEach((i) => i.classList.remove("active"));
    item.classList.add("active");

    // Remove animation classes from all sections first
    contentSections.forEach((sec) => {
      sec
        .querySelectorAll(".card, .table-container, .chart-container")
        .forEach((el) => el.classList.remove("animate-in"));
    });

    contentSections.forEach((sec) => (sec.style.display = "none"));
    const sectionId = item.dataset.section + "Section";
    const sectionElement = document.getElementById(sectionId);
    sectionElement.style.display = "block";

    // Add animation class to elements in the new section
    const elementsToAnimate = sectionElement.querySelectorAll(
      ".card, .table-container, .chart-container",
    );
    elementsToAnimate.forEach((el) => el.classList.add("animate-in"));

    // Nếu người dùng tự bấm menu "Danh sách thiết bị" thì bỏ filter tháng
    if (sectionId === "devicesSection") {
      deviceDateFilter = null;
      deviceCurrentPage = 1;
      applyFiltersAndRender();
    }

    // Special handling for charts that need redraw
    if (sectionId === "chartSection") {
      const y = parseInt(yearlyChartYearSelector?.value) || 2025;
      setTimeout(() => updateChartSection(y), 0);
    }
    if (sectionId === "accountsSection") {
      loadAccounts();
    }
  });
});

// Change year -> redraw yearly chart
yearlyChartYearSelector?.addEventListener("change", (e) => {
  const y = parseInt(e.target.value) || 2025;
  updateChartSection(y);
});

document.getElementById("languageSelector").addEventListener("change", (e) => {
  const newLang = e.target.value;
  currentLang = newLang;
  localStorage.setItem("lang", newLang);
  applyTranslations();
});

// Gắn sự kiện click cho các thẻ thống kê trên trang Tổng Quan
document
  .getElementById("card-active-devices")
  ?.addEventListener("click", () =>
    navigateToDevicesWithFilter("Đang sử dụng"),
  );
document
  .getElementById("card-maintenance-devices")
  ?.addEventListener("click", () => navigateToDevicesWithFilter("Bảo Hành"));
document
  .getElementById("card-broken-devices")
  ?.addEventListener("click", () => navigateToDevicesWithFilter("Hư Hỏng"));
document
  .getElementById("card-available-devices")
  ?.addEventListener("click", () => navigateToDevicesWithFilter("Sẵn sàng"));

/***********************
 * KHỞI TẠO NHỎ
 ***********************/
(function initSmall() {
  const y = new Date().getFullYear();
  const el1 = document.getElementById("currentYear");
  if (el1) el1.textContent = y;
  document.querySelectorAll('input[type="date"]').forEach((inp) => {
    if (!inp.value) inp.setAttribute("placeholder", "YYYY-MM-DD");
  });
})();

/* ---------------- QR CODE ---------------- */
let qrLibLoaded = false;
function loadQrLib() {
  return new Promise((resolve, reject) => {
    if (qrLibLoaded || window.QRCode) {
      qrLibLoaded = true;
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js";
    s.onload = () => {
      qrLibLoaded = true;
      resolve();
    };
    s.onerror = () => reject(new Error("Không tải được thư viện QR"));
    document.head.appendChild(s);
  });
}
function ensureQrUI() {
  const modalBody = deviceModal?.querySelector(".modal-body");
  if (!modalBody) return;
  if (document.getElementById("qrTools")) return;

  const wrap = document.createElement("div");
  wrap.id = "qrTools";
  wrap.style.marginTop = "12px";
  wrap.innerHTML = `
    <hr/>
    <div class="form-row">
      <label data-i18n="qrForDevice">${t("qrForDevice")}</label>
      <div id="qrContainer" class="center" style="min-height:150px;border:1px dashed #ccc;border-radius:6px;padding:8px;"></div>
      <div class="row" style="margin-top:8px;gap:8px;">
        <button type="button" class="btn btn-primary" id="generateQrBtn" data-i18n="generateQr">${t(
          "generateQr",
        )}</button>
        <button type="button" class="btn btn-primary" id="downloadQrBtn" disabled data-i18n="downloadQr">${t(
          "downloadQr",
        )}</button>
      </div>
      <div class="muted">QR sẽ mở trang thông tin thiết bị (display.html).</div>
    </div>
  `;
  modalBody.appendChild(wrap);
  document
    .getElementById("generateQrBtn")
    .addEventListener("click", generateDeviceQR);
  document
    .getElementById("downloadQrBtn")
    .addEventListener("click", downloadDeviceQR);
}
function resetQrUI() {
  const cont = document.getElementById("qrContainer");
  if (cont) cont.innerHTML = "";
  const dlBtn = document.getElementById("downloadQrBtn");
  if (dlBtn) dlBtn.disabled = true;
  lastQrCanvas = null;
  lastQrImg = null;
  lastQrUrl = null;
}
let lastQrCanvas = null,
  lastQrImg = null,
  lastQrUrl = null;
async function generateDeviceQR() {
  let useRemote = false;
  try {
    await loadQrLib();
  } catch (e) {
    useRemote = true;
  }
  const id = document.getElementById("MaThietBi").value.trim();
  if (!id) return showAlert(t("alert_enter_device_code_for_qr"), false);
  const url = buildDeviceDisplayUrl(id);

  const cont = document.getElementById("qrContainer");
  if (!cont) return;
  cont.innerHTML = "";

  if (!useRemote && window.QRCode?.toCanvas) {
    const canvas = document.createElement("canvas");
    cont.appendChild(canvas);
    lastQrCanvas = canvas;
    lastQrImg = null;
    lastQrUrl = url;
    try {
      await window.QRCode.toCanvas(canvas, url, { width: 220, margin: 1 });
      const dlBtn = document.getElementById("downloadQrBtn");
      if (dlBtn) dlBtn.disabled = false;
    } catch (e) {
      showAlert(t("alert_qr_generation_failed"), false);
    }
  } else {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      cont.innerHTML = "";
      cont.appendChild(img);
      lastQrCanvas = null;
      lastQrImg = img;
      lastQrUrl = url;
      const dlBtn = document.getElementById("downloadQrBtn");
      if (dlBtn) dlBtn.disabled = false;
    };
    img.onerror = () => showAlert(t("alert_qr_load_failed"), false);
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
      url,
    )}`;
  }
}
function downloadDeviceQR() {
  const id = document.getElementById("MaThietBi").value.trim() || "device";
  let canvas = lastQrCanvas;
  if (!canvas) {
    if (!lastQrImg) return showAlert(t("alert_no_qr_to_download"), false);
    canvas = document.createElement("canvas");
    canvas.width = lastQrImg.naturalWidth || lastQrImg.width || 220;
    canvas.height = lastQrImg.naturalHeight || lastQrImg.height || 220;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(lastQrImg, 0, 0, canvas.width, canvas.height);
  }
  const dataURL = canvas.toDataURL("image/png");
  const a = document.createElement("a");
  a.href = dataURL;
  a.download = `QR_${id}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* Liên kết tự động Người sử dụng <-> Trạng thái */
(function linkUserStatusFields() {
  const userSel = document.getElementById("Nguoisudung");
  const statusSel = document.getElementById("Trangthai");
  if (!userSel || !statusSel) return;
  userSel.addEventListener("change", () => {
    if (userSel.value) {
      if (!statusSel.value || statusSel.value === "Sẵn sàng")
        statusSel.value = "Đang sử dụng";
    } else {
      if (!statusSel.value || statusSel.value === "Đang sử dụng")
        statusSel.value = "Sẵn sàng";
    }
  });
})();

/* Toggle password */
(function togglePasswordVisibility() {
  const togglePassword = document.querySelector("#togglePassword");
  const password = document.querySelector("#password");
  if (!togglePassword || !password) return;
  togglePassword.addEventListener("click", function () {
    const type =
      password.getAttribute("type") === "password" ? "text" : "password";
    password.setAttribute("type", type);
    this.classList.toggle("fa-eye");
    this.classList.toggle("fa-eye-slash");
  });
})();

/* =======================
 * I18N (TRANSLATION)
 * ======================= */
function applyTranslations() {
  document.documentElement.lang = currentLang;
  document.getElementById("languageSelector").value = currentLang;

  const dict = translations[currentLang];
  if (!dict) return;

  // Helper to set text content
  const setText = (selector, key) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = dict[key] || key;
  };

  // Overview Section monthly chart titles
  const overviewChartTitle1Base = document.querySelector(
    'h3[data-i18n-base="monthlyStatsByYearPrefix"] #overviewChartYear1',
  )?.parentNode;
  if (overviewChartTitle1Base) {
    overviewChartTitle1Base.childNodes[0].textContent = t(
      "monthlyStatsByYearPrefix",
    );
  }
  const overviewChartTitle2Base = document.querySelector(
    'h3[data-i18n-base="monthlyStatsByYearPrefix"] #overviewChartYear2',
  )?.parentNode;
  if (overviewChartTitle2Base) {
    overviewChartTitle2Base.childNodes[0].textContent = t(
      "monthlyStatsByYearPrefix",
    );
  }

  const setI18nText = (element, key) => {
    if (element) {
      element.textContent = dict[key] || key;
    }
  };

  // Helper to set placeholder
  const setPlaceholder = (selector, key) => {
    const el = document.querySelector(selector);
    if (el) el.placeholder = dict[key] || key;
  };

  // Translate static text
  document.title = dict.appTitle;
  setText("header h1", "appTitle");
  setText(".login-form h1", "login");
  setText('label[for="username"]', "username");
  setPlaceholder("#username", "usernamePlaceholder");
  setText('label[for="password"]', "password");
  setPlaceholder("#password", "passwordPlaceholder");
  setText("#loginBtn", "loginButton");
  setText("#logoutBtn", "logout");
  // CHỈ dịch nội dung span, giữ nguyên icon <i>
  setText('a[data-section="overview"] span', "overview");
  setText('a[data-section="devices"] span', "deviceList");
  setText('a[data-section="users"] span', "userList");
  setText('a[data-section="chart"] span', "statisticsChart");

  // Overview
  setText("#overviewSection .section-title", "overviewTitle");
  setText("#overviewSection .section-description", "overviewDescription");
  setText(".card:nth-child(1) .card-title", "totalDevices");
  setText(".card:nth-child(2) .card-title", "inUse");
  setText(".card:nth-child(3) .card-title", "warranty");
  setText(".card:nth-child(4) .card-title", "broken");
  setText(".card:nth-child(5) .card-title", "availableForIssue");
  setText("#overviewChartYear1", "year");
  setText("#overviewChartYear2", "year");

  // Device List
  setText("#devicesSection .table-title", "deviceListTitle");
  setText("#addDeviceBtn", "addDevice");
  setText("#exportDevicesExcelBtn", "exportExcel");
  setPlaceholder("#deviceSearchInput", "deviceSearchInputPlaceholder"); // Assuming key exists
  setText('th[data-sort-key="MaThietBi"]', "deviceCode");
  setText('th[data-sort-key="TenThietBi"]', "deviceName");
  setText('th[data-sort-key="LoaiThietBi"]', "deviceType");
  setText('th[data-sort-key="SerialSN"]', "serialNumber");
  setText('th[data-sort-key="NgayNhap"]', "importDate");
  setText('th[data-sort-key="Trangthai"]', "status");
  setText('th[data-sort-key="Nguoisudung"]', "user");
  setText('th[data-sort-key="Vitri"]', "location"); // <— thêm dòng này
  setText("#devicesTable th:last-child", "actions");

  // User List
  setText("#usersSection .table-title", "userListTitle");
  setText("#addUserBtn", "addUser");
  setText("#exportUsersExcelBtn", "exportExcel");
  setPlaceholder("#userSearchInput", "userSearchInputPlaceholder"); // Assuming key exists
  setText('th[data-sort-key="MaNV"]', "employeeId");
  setText('th[data-sort-key="HoVaTen"]', "fullName");
  setText('th[data-sort-key="Phongban"]', "department");
  setText('th[data-sort-key="Thietbisudung"]', "deviceInUse");
  setText('th[data-sort-key="Ngaycap"]', "issueDate");
  setText('#usersTable th[data-sort-key="Trangthai"]', "status");
  setText("#usersTable th:last-child", "actions");

  // Chart Section
  setText("#chartSection .section-title", "chartSectionTitle");
  setI18nText(
    document.querySelector("#chartSection .section-description"),
    "chartSectionDescription",
  );
  const yearlyChartTitleBase = document.querySelector(
    'h3[data-i18n-base="chart_yearly_stats_title"]',
  );
  if (yearlyChartTitleBase) {
    yearlyChartTitleBase.childNodes[0].textContent = t(
      "chart_yearly_stats_title",
    );
  }
  const devicesThisYearFooter = document.querySelector(
    'div[data-i18n-base="devicesThisYear"]',
  );
  if (devicesThisYearFooter) {
    devicesThisYearFooter.childNodes[0].textContent =
      t("devicesThisYear") + " ";
  }
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    if (dict[el.dataset.i18n]) el.textContent = dict[el.dataset.i18n];
  });

  // Dịch các placeholder
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.dataset.i18nPlaceholder;
    if (dict[key]) el.placeholder = dict[key];
  });

  // Modals
  setText(
    "#deviceModalTitle",
    currentDeviceId ? "editDeviceModalTitle" : "addDeviceModalTitle",
  );
  setText(
    "#userModalTitle",
    currentUserId ? "editUserModalTitle" : "addUserModalTitle",
  );
  setText("#deleteModalTitle", "deleteConfirmTitle");
  setText("#deleteMessage", "deleteConfirmMessage");
  setText("#cancelDeviceBtn", "cancel");
  setText("#saveDeviceBtn", "save");
  setText("#cancelUserBtn", "cancel");
  setText("#saveUserBtn", "save");
  setText("#cancelDeleteBtn", "cancel");
  setText("#confirmDeleteBtn", "confirm");

  // Re-render dynamic content
  // 🔒 Chỉ gọi lại loadAllData khi ĐÃ đăng nhập (có token)
  if (window.authToken) {
    loadAllData();
  }
}

/* =======================
 * EXCEL EXPORT
 * ======================= */
function exportToExcel(data, headers, sheetName, fileName) {
  // Tạo worksheet từ dữ liệu
  const ws = XLSX.utils.json_to_sheet(data, { header: headers });

  // Tạo workbook và thêm worksheet vào
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // Xuất file
  XLSX.writeFile(wb, fileName);
}

function exportDevicesToExcel() {
  const headers = [
    "MaThietBi",
    "TenThietBi",
    "LoaiThietBi",
    "SerialSN",
    "NgayNhap",
    "Trangthai",
    "Nguoisudung",
    "Vitri", // 👈 THÊM CỘT VỊ TRÍ
    "QRcode", // 👈 dùng cho Bartender
  ];

  const dataToExport = devices.map((d) => ({
    MaThietBi: d.MaThietBi,
    TenThietBi: d.TenThietBi,
    LoaiThietBi: d.LoaiThietBi,
    SerialSN: d.SerialSN || "",
    NgayNhap: d.NgayNhap ? formatDate(d.NgayNhap) : "",
    Trangthai: d.Trangthai || "",
    Nguoisudung: d.Nguoisudung || "",
    Vitri: d.Vitri || "", // 👈 ĐẨY VỊ TRÍ RA EXCEL
    // URL dùng cho QR trong Bartender
    QRcode: buildDeviceDisplayUrl(d.MaThietBi),
  }));

  exportToExcel(
    dataToExport,
    headers,
    "Danh sách thiết bị",
    "DanhSachThietBi.xlsx",
  );
}

async function importDevicesFromExcel(file) {
  if (!file) return;

  const reader = new FileReader();

  reader.onload = async (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array" });

      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      if (!rows.length) {
        showAlert("File Excel không có dữ liệu.", false);
        return;
      }

      const requiredCols = [
        "MaThietBi",
        "TenThietBi",
        "LoaiThietBi",
        "SerialSN",
        "NgayNhap",
        "Trangthai",
        "Nguoisudung",
      ];

      const missing = requiredCols.filter((c) => !(c in rows[0]));
      if (missing.length) {
        showAlert("Thiếu các cột: " + missing.join(", "), false);
        return;
      }

      let success = 0;
      let fail = 0;

      for (const r of rows) {
        const payload = {
          MaThietBi: r.MaThietBi || "",
          TenThietBi: r.TenThietBi || "",
          LoaiThietBi: r.LoaiThietBi || "",
          SerialSN: r.SerialSN || "",
          NgayNhap: r.NgayNhap || "",
          Trangthai: r.Trangthai || "Sẵn sàng",
          Nguoisudung: r.Nguoisudung || "",
        };

        if (!payload.MaThietBi || !payload.TenThietBi) {
          fail++;
          continue;
        }

        try {
          await fetchJson("/api/devices", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          success++;
        } catch (err) {
          fail++;
        }
      }

      showAlert(
        `Nhập Excel hoàn tất: ${success} dòng thành công, ${fail} dòng lỗi.`,
        success > 0,
      );

      await loadDevices();
    } catch (err) {
      showAlert("Không thể đọc file Excel.", false);
    } finally {
      importDevicesExcelInput.value = "";
    }
  };

  reader.readAsArrayBuffer(file);
}

function exportUsersToExcel() {
  const headers = [
    "MaNV",
    "HoVaTen",
    "Phongban",
    "Thietbisudung",
    "Ngaycap",
    "Trangthai",
  ];

  const dataToExport = users.map((u) => ({
    MaNV: u.MaNV,
    HoVaTen: u.HoVaTen,
    Phongban: u.Phongban,
    Thietbisudung: u.Thietbisudung || "",
    Ngaycap: u.Ngaycap ? formatDate(u.Ngaycap) : "",
    Trangthai: u.Trangthai,
  }));

  exportToExcel(dataToExport, headers, "Người sử dụng", "NguoiSuDung.xlsx");
}

function exportPurchasesToExcel() {
  const headers = [
    "PurchaseId",
    "MaThietBi",
    "TenThietBi",
    "LoaiThietBi",
    "NgayNhap",
    "ThanhTien",
    "NguonMua",
    "CreatedAt",
    "UpdatedAt",
    "LastUserName",
    "LastUserId",
    "LastAssignedDate",
  ];

  const dataToExport = purchases.map((p) => ({
    PurchaseId: p.PurchaseId,
    MaThietBi: p.MaThietBi,
    TenThietBi: p.TenThietBi || "",
    LoaiThietBi: p.LoaiThietBi || "",
    NgayNhap: formatDate(p.NgayNhap),

    // ⭐ Dùng hàm formatCurrencyVND, để blankIfEmpty = true cho Excel
    ThanhTien: formatCurrencyVND(p.ThanhTien, true),

    NguonMua: p.NguonMua || "",
    CreatedAt: p.CreatedAt ? formatDate(p.CreatedAt) : "",
    UpdatedAt: p.UpdatedAt ? formatDate(p.UpdatedAt) : "",
    LastUserName: p.LastUserName || "",
    LastUserId: p.LastUserId || "",
    LastAssignedDate: p.LastAssignedDate ? formatDate(p.LastAssignedDate) : "",
  }));

  exportToExcel(
    dataToExport,
    headers,
    "Thong tin mua hang",
    "ThongTinMuaHang.xlsx",
  );
}

/* ====== LOẠI THIẾT BỊ ====== */
const deviceTypes = {
  vanphong: {
    dev_type_server: "Máy chủ主机",
    dev_type_keyboard: "Bàn phím键盘",
    dev_type_camera: "Camera监控",
    dev_type_mouse: "Chuột máy tính鼠标",
    dev_type_cpu: "CPU",
    dev_type_monitor: "Màn hình屏幕",
    dev_type_tablet: "Tablet",
    dev_type_camera_recorder: "Đầu thu Camera摄像头接收器",
    dev_type_radio_receiver: "Đầu thu phát thanh无线电接收器",
    dev_type_digital_receiver_meeting:
      "Đầu thu số(phòng họp)数字接收器（会议室）",
    dev_type_smartphone: "Điện Thoại thông minh手机",
    dev_type_office_chair: "Ghế Văn Phòng办公椅",
    dev_type_laptop: "Laptop笔记本",
    dev_type_bluetooth_speaker: "Loa Bluetooth蓝牙音箱",
    dev_type_conference_speaker: "Loa họp会议微音器",
    dev_type_loudspeaker: "Loa phát thanh扬声器",
    dev_type_small_screen_meeting: "Màn hình nhỏ(phòng họp)小屏幕（会议室）",
    dev_type_face_scan_screen: "Màn hình quét mặt刷脸屏幕",
    dev_type_printer: "Máy In打印机",
    dev_type_small_printer: "Máy In nhỏ小型打印机",
    dev_type_pos_machine: "Máy POS",
    dev_type_usb_hub: "Thiết bị kết nối USB USB连接设备",
    dev_type_network_device: "Thiết Bị Mạng交换机",
    dev_type_wifi_router: "Thiết bị phát wifi无线发射器",
    dev_type_tv: "TiVi电视",
    dev_type_fridge: "Tủ Lạnh冰箱",
    dev_type_small_refrigerator: "Tủ Lạnh nhỏ小冰箱",
    dev_type_air_conditioner: "Máy Lạnh空调",
    dev_type_water_dispenser: "Máy nước nóng lạnh冷热水机",
    dev_type_dryer: "Máy Sấy",
    dev_type_coffee_machine: "Máy pha cà phê咖啡机",
    dev_type_electric_kettle: "Bình đun siêu tốc电热水壶",
    dev_type_microwave_oven: "Lò vi sóng电磁炉",
    dev_type_fan: "Quạt máy",
    dev_type_tripod: "Chân máy ảnh(tripod)相机三脚架",
  },
  sanxuat: {
    dev_type_iron: "Bàn Ủi烫台",
    dev_type_iron_boiler: "Lò hơi ủi熨烫锅炉",
    dev_type_electronic_scale: "Cân điện tử电子秤",
    dev_type_lightning_rod_system: "Hệ Thống Thu Lôi",
    dev_type_wastewater_system: "Hệ Thống Xử Lý Nước Thải",
    dev_type_buttonhole_machine: "Khuy mắt phụng凤眼纽扣",
    dev_type_button_machine: "M khuy平头锁眼机",
    dev_type_hand_cutter: "Máy Cắt Tay 手动裁剪机",
    dev_type_table_end_cutter: "Máy cắt đầu bàn 台式切割机",
    dev_type_auto_cutter: "Máy cắt tự động 自动裁剪机",
    dev_type_band_knife_cutter: "Máy cắt vòng 钢带机sc-350/龙门刀",
    dev_type_needle_detector: "Máy dò kim 检针机",
    dev_type_1_needle_machine: "Máy 1 Kim 1针机",
    dev_type_1_1_needle_machine: "Máy 1 kim trợ lực 1针辅助机",
    dev_type_2_needle_machine: "Máy 2 Kim 2针机",
    dev_type_12_needle_machine: "Máy 12 kim",
    dev_type_12_needle_puller: "Máy kéo sợi 12 kim",
    dev_type_1_needle_lockstitch: "Máy 1 kim xén 1针压机",
    dev_type_2_needle_lockstitch: "Máy 2 kim xén",
    dev_type_2_needle_chainstitch: "Máy 2 kim móc xích 双针锁链车",
    dev_type_4_needle_6_thread: "Máy 4 kim 6 chỉ 4针6线机",
    dev_type_bartacking_machine: "Máy bọ 套结机",
    dev_type_label_cutter: "Máy cắt nhãn 标签切割机",
    dev_type_bobbin_winder: "Máy đánh chỉ 绕线机",
    dev_type_metal_button_machine: "Máy đóng nút sắt 铁钉扣机",
    dev_type_button_attaching_machine: "Máy đóng nút 钉扣机",
    dev_type_button_shank_wrapping: "Máy quấn chân nút 纽扣脚缠绕机",
    dev_type_side_seam_machine: "Máy cuốn sườn 埋夹车",
    dev_type_elastic_press_machine: "Máy ép thun 弹力压合机",
    dev_type_kansai_machine: "Máy kansai Kansai 机",
    dev_type_kansai1_machine: "Máy kansai 12 Kim 坎萨伊12针",
    dev_type_hemming_machine: "Máy săm lai 挑脚机",
    dev_type_decorative_overlock: "Máy vắt sổ trang trí 装饰包缝机",
    dev_type_overlock_machine: "Máy vắt sổ 包缝机",
    dev_type_decorative_stitch: "Máy khâu trang trí 装饰缝纫机",
    dev_type_zigzag_machine: "Máy zic zắc 锯齿机",
    dev_type_fabric_inspection_machine: "Máy Soi Vải 验布机",
    dev_type_fabric_checking_machine: "Máy Kiểm Vải 检布机",
    dev_type_auto_spreading_machine: "Máy Trải Vải Tự Động",
    dev_type_fabric_spreader: "Máy trải vải 拉布机",
    dev_type_nano_canh: "NANO CANH",
    dev_type_electrical_cabinet: "Tủ Điện",
    dev_type_air_compressor: "Máy Nén Khí 空气压缩机",
    dev_type_generator: "Máy phát điện 发电机",
    dev_type_pattern_printer: "Máy In Rập",
    dev_type_marker_printer: "Máy In Sơ Đồ 麦架机",
    dev_type_printer: "Máy in 打印机",
    dev_type_dot_matrix_printer: "Máy in kim 点阵打印机",
    dev_type_programmable_machine: "Máy lập trình 模版机",
    dev_type_auto_sewing_machine: "Máy chạy lập trình 模版机",
    dev_type_cnc_pattern_cutter: "Máy CNC cắt rập 数控花样切割机",
    dev_type_large_heat_press: "Máy ép tem khổ lớn 大幅面邮票印刷机",
    dev_type_fusing_machine: "Máy ép keo 胶压机",
    dev_type_industrial_ac: "Máy lạnh công nghiệp 水空调",
  },
  vanchuyen: {
    dev_type_hand_pallet_truck: "Xe nâng tay 手动叉车",
    dev_type_electric_pallet_truck: "Xe nâng điện 电动叉车",
    dev_type_cargo_hoist: "Tời Nâng Hàng",
    dev_type_electric_bicycle: "Xe đạp điện 电瓶车",
    dev_type_car: "Xe hơi 汽车",
  },
  quanly: {
    dev_type_inspection_table: "Bàn Kiểm Hàng",
    dev_type_mannequin: "Ma-nơ-canh 模特",
    dev_type_bed_mattress: "Giường + Nệm 床+床垫",
    dev_type_air_tank: "Bình chứa khí",
    dev_type_meeting_table: "Bàn họp 会议桌",
    dev_type_work_desk: "Bàn làm việc 办桌",
    dev_type_large_table: "Bàn lớn 大桌",
    dev_type_long_table: "Bàn dài 长桌",
    dev_type_office_chair: "Ghế văn phòng 办公椅",
    dev_type_folding_chair: "Ghế xếp 交椅",
    dev_type_guest_chair: "Ghế tiếp khách 接待椅",
    dev_type_ergonomic_chair: "Ghế Công thái học 人体工学椅",
    dev_type_sofa: "Sofa 沙发",
    dev_type_do_tank: "Thùng chứa dầu DO 柴油罐",
    dev_type_Gas_cylinder: "Bình chứa khí 气瓶",
    dev_type_safe_small: "Két sắt(Nhỏ) 保险柜(小）",
    dev_type_safe_medium: "Két sắt(Trung) 保险柜(中）",
    dev_type_file_cabinet: "Tủ đựng hồ sơ 文件柜",
    dev_type_personal_locker: "Tủ cá nhân 个人柜子",
    dev_type_safe_large: "Két sắt(Lớn) 保险柜(大）",
  },
  taisankhac: {
    dev_type_power_bank_gift: "Sạc dự phòng(Quà tặng)",
    dev_type_umbrella_gift: "Dù(Quà tặng)",
    dev_type_tumbler_gift: "Ly giữ nhiệt(Quà tặng)",
  },
  nhacua: {},
};
function getDeviceCategory(deviceType) {
  const norm = normalizeLoaiThietBi(deviceType);
  if (!norm) return null;

  const needle = normalizeLoaiThietBiCompact(norm);

  for (const category in deviceTypes) {
    for (const v of Object.values(deviceTypes[category] || {})) {
      if (normalizeLoaiThietBiCompact(v) === needle) return category;
    }
  }
  return null;
}

function handleCategoryChange(selectedValue = null) {
  const categoryContainer = document.getElementById("deviceCategoryContainer");
  const detailRow = document.getElementById("deviceDetailRow");
  const typeSelect = document.getElementById("LoaiThietBi");
  if (!categoryContainer || !detailRow || !typeSelect) return;

  const selectedRadio = categoryContainer.querySelector(
    'input[name="deviceCategoryRadio"]:checked',
  );
  const category = selectedRadio ? selectedRadio.value : null;

  typeSelect.innerHTML = `<option value="">${t(
    "selectDetailedDevice",
  )}</option>`;

  if (category && deviceTypes[category]) {
    detailRow.style.display = "block";
    const typesObject = deviceTypes[category];

    // Chuyển object thành mảng, dịch và sắp xếp
    const translatedTypes = Object.entries(typesObject)
      .map(([key, fallback]) => ({
        value: fallback, // Lưu giá trị gốc (tiếng Việt)
        text: t(key), // Lấy bản dịch
      }))
      .sort((a, b) => a.text.localeCompare(b.text, currentLang));

    const optgroup = document.createElement("optgroup");
    optgroup.label = t("detailedDevice");

    for (const type of translatedTypes) {
      const option = new Option(type.text, type.value);
      if (type.value === selectedValue) option.selected = true;
      optgroup.appendChild(option);
    }
    typeSelect.appendChild(optgroup);
  } else {
    detailRow.style.display = "none";
  }
}
function initDeviceCategoryLogic() {
  const categoryContainer = document.getElementById("deviceCategoryContainer");
  if (!categoryContainer) return;
  categoryContainer.addEventListener("change", (e) => {
    if (e.target.name === "deviceCategoryRadio") handleCategoryChange();
  });
}

initDeviceCategoryLogic();
applyTranslations();

if (addPurchaseBtn) {
  addPurchaseBtn.addEventListener("click", async () => {
    currentPurchaseId = null; // reset ID
    purchaseForm.reset(); // reset form

    // 👉 Gọi hàm lọc các thiết bị chưa có trong Purchase
    await populateDeviceDropdownForPurchase();

    // ✅ Cho phép chọn thiết bị khi tạo mới
    const select = document.getElementById("purchaseDevice");
    if (select) select.disabled = false;

    if (purchaseModal) {
      document.getElementById("purchaseModalTitle").textContent = t(
        "addPurchaseModalTitle",
      );
      purchaseModal.style.display = "flex";
    }
  });
}

/* =========================================
   LOGIC QUẢN LÝ TÀI KHOẢN (THÊM VÀO CUỐI FILE)
   ========================================= */

// 1. Hàm mở Modal thêm tài khoản
function openAddAccountModal() {
  const modal = document.getElementById("accountModal");
  const form = document.getElementById("accountForm");
  if (modal) {
    modal.style.display = "flex";
    if (form) form.reset(); // Xóa trắng form cũ
  }
}

// 2. Hàm đóng Modal
function closeAccountModal() {
  const modal = document.getElementById("accountModal");
  if (modal) modal.style.display = "none";
}

// 3. Xử lý sự kiện khi bấm nút "Tạo tài khoản" (Submit Form)
const accountFormElement = document.getElementById("accountForm");
if (accountFormElement) {
  accountFormElement.addEventListener("submit", async (e) => {
    e.preventDefault(); // Chặn load lại trang

    // Lấy dữ liệu từ các ô input
    const payload = {
      username: document.getElementById("accUsername").value.trim(),
      password: document.getElementById("accPassword").value,
      displayName: document.getElementById("accDisplayName").value.trim(),
      role: document.getElementById("accRole").value, // Lấy quyền (admin/user)
    };

    // Kiểm tra sơ bộ
    if (payload.username.length < 3) {
      return showAlert("Tên đăng nhập quá ngắn!", false);
    }

    // Gửi về Server
    const res = await fetchJson("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res) {
      showAlert("Tạo tài khoản thành công ✔️", true);
      closeAccountModal();
      loadAccounts(); // Tải lại bảng danh sách
    }
  });
}

// 4. Hàm tải danh sách tài khoản từ Server (ĐÃ SỬA: Thêm cột Mật khẩu + Con mắt ẩn hiện)
async function loadAccounts() {
  // Chỉ admin mới được tải
  if (window.currentRole !== "admin") return;

  const data = await fetchJson("/api/accounts");
  if (!data) return;

  const tbody = document.getElementById("accountsTableBody");
  if (!tbody) return;

  tbody.innerHTML = ""; // Xóa dữ liệu cũ

  data.forEach((acc, index) => {
    // Format ngày tạo
    const dateStr = acc.CreatedAt
      ? new Date(acc.CreatedAt).toLocaleDateString("vi-VN")
      : "-";

    // Logic nút xóa
    const isMe = acc.Username === window.currentUsername;
    const isSuperAdmin = acc.Username === "admin";

    let deleteBtn = "";
    if (!isMe && !isSuperAdmin) {
      deleteBtn = `<button class="btn btn-danger btn-sm" onclick="deleteAccount('${acc.Username}')" title="Xóa"><i class="fas fa-trash"></i></button>`;
    }

    let roleBadge =
      acc.Role === "admin"
        ? '<span class="status-badge status-broken">Admin</span>'
        : '<span class="status-badge status-available">User</span>';

    /* --- XỬ LÝ HIỂN THỊ MẬT KHẨU --- */
    let passwordHtml = "";
    if (acc.MatKhauGoc) {
      // Tạo ID riêng cho mỗi dòng để JS biết cần mở dòng nào
      const inputId = `pass-input-${index}`;

      // Dùng input type="password" để mặc định ẩn (hiện chấm tròn)
      // Thêm style trực tiếp (inline-css) để bạn không cần sửa file .css
      passwordHtml = `
        <div class="password-wrapper">
            <input type="password" 
                   value="${acc.MatKhauGoc}" 
                   id="${inputId}" 
                   readonly 
                   class="password-input-readonly"
            />
            <i class="fas fa-eye" 
               onclick="toggleTablePassword('${inputId}', this)"
               class="toggle-icon" 
               title="Xem mật khẩu"
               >
            </i>
        </div>
      `;
    } else {
      // Tài khoản cũ không có mật khẩu gốc
      passwordHtml =
        '<span style="color:#aaa; font-style:italic; font-size: 0.9em;">(Đã mã hóa)</span>';
    }

    /* --- RENDER HTML (Lưu ý: Đã chỉnh lại thứ tự cột cho khớp tiêu đề) --- */
    tbody.innerHTML += `
      <tr>
        <td>${acc.Username}</td>
        <td>${acc.DisplayName || ""}</td>
        <td style="text-align:center">${roleBadge}</td>
        
        <td style="text-align:center">${passwordHtml}</td>
        
        <td style="text-align:center">${dateStr}</td>
        
        <td style="text-align:center">
            <div class="action-btns" style="justify-content:center">
                ${deleteBtn}
            </div>
        </td>
      </tr>
    `;
  });
}

// 5. Hàm xử lý bật/tắt hiển thị mật khẩu (MỚI)
function toggleTablePassword(inputId, iconElement) {
  const input = document.getElementById(inputId);
  if (!input) return;

  if (input.type === "password") {
    input.type = "text"; // Hiện mật khẩu
    iconElement.classList.remove("fa-eye");
    iconElement.classList.add("fa-eye-slash"); // Đổi icon thành gạch chéo
  } else {
    input.type = "password"; // Ẩn mật khẩu (dạng chấm tròn)
    iconElement.classList.remove("fa-eye-slash");
    iconElement.classList.add("fa-eye"); // Đổi icon về bình thường
  }
}

// 6. Hàm xóa tài khoản
async function deleteAccount(username) {
  if (
    !confirm(
      `Bạn có chắc muốn xóa tài khoản [${username}]? Hành động này không thể hoàn tác.`,
    )
  )
    return;

  const res = await fetchJson(`/api/accounts/${username}`, {
    method: "DELETE",
  });
  if (res) {
    showAlert("Đã xóa tài khoản.", true);
    loadAccounts();
  }
}

// --- Đưa các hàm này ra ngoài để HTML gọi được ---
window.openAddAccountModal = openAddAccountModal;
window.closeAccountModal = closeAccountModal;
window.deleteAccount = deleteAccount;
window.loadAccounts = loadAccounts;
window.toggleTablePassword = toggleTablePassword; // Đừng quên dòng này
// ----------------------------------------------

/* =======================================================
   CÁC HÀM XỬ LÝ GIAO DIỆN TABS (THÊM VÀO CUỐI FILE)
   ======================================================= */

// 1. Hàm đếm số lượng thiết bị cho từng trạng thái
function updateDeviceStatusCounts() {
  if (!devices) return;

  // Đếm số lượng
  const allCount = devices.length;
  const availableCount = devices.filter(
    (d) => d.Trangthai === "Sẵn sàng",
  ).length;
  const inUseCount = devices.filter(
    (d) => d.Trangthai === "Đang sử dụng",
  ).length;
  const maintenanceCount = devices.filter(
    (d) => d.Trangthai === "Bảo Hành",
  ).length;
  const brokenCount = devices.filter((d) => d.Trangthai === "Hư Hỏng").length;

  // Cập nhật lên giao diện HTML
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt("count-all", allCount);
  setTxt("count-available", availableCount);
  setTxt("count-inuse", inUseCount);
  setTxt("count-maintenance", maintenanceCount);
  setTxt("count-broken", brokenCount);
}

// 2. Hàm xử lý sự kiện khi bấm vào Tab
function filterDeviceByTab(status) {
  // Cập nhật biến trạng thái toàn cục
  currentTabStatus = status;

  // --- Hiệu ứng chuyển đổi Tab Active ---
  const tabs = document.querySelectorAll("#deviceStatusTabs .status-tab");
  tabs.forEach((tab) => tab.classList.remove("active"));

  // Tìm tab vừa bấm để thêm class active
  // (Sử dụng event.currentTarget để lấy chính xác nút button được click)
  if (window.event && window.event.currentTarget) {
    window.event.currentTarget.classList.add("active");
  }

  // Reset về trang 1 và render lại bảng
  deviceCurrentPage = 1;
  applyFiltersAndRender();
}

// Đưa hàm ra phạm vi Window để HTML gọi được (quan trọng)
window.filterDeviceByTab = filterDeviceByTab;

/* =========================================
   LOGIC MỚI CHO TAB USER VÀ RENDER USER
   ========================================= */

// 1. Cập nhật số liệu trên Tabs User
function updateUserStats() {
  if (!users) return;
  const total = users.length;
  const inUse = users.filter((u) => u.Trangthai === "Đang sử dụng").length;
  const empty = users.filter(
    (u) => !u.Trangthai || u.Trangthai === "Chưa cấp",
  ).length;

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setTxt("count-user-all", total);
  setTxt("count-user-inuse", inUse);
  setTxt("count-user-empty", empty);
}

// 2. Xử lý click Tab User
function filterUserByTab(status) {
  currentUserTabStatus = status;

  // Update UI active class
  const tabs = document.querySelectorAll("#userStatusTabs .status-tab");
  tabs.forEach((tab) => tab.classList.remove("active"));
  if (window.event && window.event.currentTarget) {
    window.event.currentTarget.classList.add("active");
  }

  userCurrentPage = 1;
  applyUserFiltersAndRender();
}
// Đưa ra window để HTML gọi
window.filterUserByTab = filterUserByTab;

// 3. Hàm Lọc và Render User (Tương tự Device)
function applyUserFiltersAndRender() {
  let filtered = users;

  // Lọc theo Search
  const term = document
    .getElementById("userSearchInput")
    ?.value.toLowerCase()
    .trim();
  if (term) {
    filtered = filtered.filter(
      (u) =>
        (u.MaNV || "").toLowerCase().includes(term) ||
        (u.HoVaTen || "").toLowerCase().includes(term),
    );
  }

  // Lọc theo Phòng ban
  const dept = document.getElementById("userDepartmentFilter")?.value;
  if (dept) {
    filtered = filtered.filter((u) => u.Phongban === dept);
  }

  // Lọc theo Tab Trạng thái
  if (currentUserTabStatus) {
    if (currentUserTabStatus === "Chưa cấp") {
      filtered = filtered.filter(
        (u) => !u.Trangthai || u.Trangthai === "Chưa cấp",
      );
    } else {
      filtered = filtered.filter((u) => u.Trangthai === currentUserTabStatus);
    }
  }

  // Sắp xếp
  sortData(filtered, userSort);

  // Phân trang
  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / ROWS_PER_PAGE) || 1;
  if (userCurrentPage > totalPages) userCurrentPage = 1;

  const start = (userCurrentPage - 1) * ROWS_PER_PAGE;
  const end = start + ROWS_PER_PAGE;
  const dataOnPage = filtered.slice(start, end);

  renderUsersTable(dataOnPage);

  // Render Pagination (chú ý ID container)
  renderPagination(
    "usersPagination",
    userCurrentPage,
    totalItems,
    ROWS_PER_PAGE,
    (page) => {
      userCurrentPage = page;
      applyUserFiltersAndRender();
    },
  );
}
