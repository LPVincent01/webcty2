/***********************
 * CẤU HÌNH API
 ***********************/
const API_BASE = (() => {
  // Nếu đang chạy chung port 3000 (mở web từ backend) -> xài origin hiện tại
  if (window.location.origin.includes(":3000")) return window.location.origin;

  // Mặc định khi dùng Live Server/Preview (5500…) -> ĐỔI IP dưới đây theo máy bạn nếu cần
  // Ví dụ LAN: http://192.168.11.86:3000, hoặc để localhost nếu front & back cùng máy.
  const FALLBACK = "http://192.168.11.86:3000";
  return window.__API_BASE__ || FALLBACK; // có thể override bằng window.__API_BASE__
})();

const api = (url) => (url.startsWith("http") ? url : `${API_BASE}${url}`);

async function fetchJson(url, options = {}) {
  try {
    const res = await fetch(api(url), options);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} ${res.statusText} — ${text}`);
    }
    if (res.status === 204) return null;
    const ct = res.headers.get("content-type") || "";
    return ct.includes("application/json") ? res.json() : res.text();
  } catch (err) {
    console.error("API Error:", err);
    showAlert(err.message || "Lỗi kết nối API", false);
    return null;
  }
}

/***********************
 * DOM ELEMENTS
 ***********************/
const loginPage = document.getElementById("loginPage");
const appContainer = document.getElementById("appContainer");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const menuItems = document.querySelectorAll(".sidebar-menu a");
const contentSections = document.querySelectorAll(".content-section");

// Bảng & Modal
const devicesTableBody = document.getElementById("devicesTableBody");
const usersTableBody = document.getElementById("usersTableBody");

const addDeviceBtn = document.getElementById("addDeviceBtn");
const addUserBtn = document.getElementById("addUserBtn");

const deviceModal = document.getElementById("deviceModal");
const userModal = document.getElementById("userModal");
const deleteModal = document.getElementById("deleteModal");

const closeDeviceModal = document.getElementById("closeDeviceModal");
const cancelDeviceBtn = document.getElementById("cancelDeviceBtn");
const saveDeviceBtn = document.getElementById("saveDeviceBtn");

const closeUserModal = document.getElementById("closeUserModal");
const cancelUserBtn = document.getElementById("cancelUserBtn");
const saveUserBtn = document.getElementById("saveUserBtn");

const closeDeleteModal = document.getElementById("closeDeleteModal");
const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

// Form
const deviceForm = document.getElementById("deviceForm");
const userForm = document.getElementById("userForm");

// Stats
const totalDevicesEl = document.getElementById("totalDevices");
const activeDevicesEl = document.getElementById("activeDevices");
const maintenanceDevicesEl = document.getElementById("maintenanceDevices");
const availableDevicesEl = document.getElementById("availableDevices");
const newDevicesTextEl = document.getElementById("newDevicesText");
const activePercentEl = document.getElementById("activePercent");
const maintenancePercentEl = document.getElementById("maintenancePercent");
const availablePercentEl = document.getElementById("availablePercent");

const yearlyPurchasedEl = document.getElementById("yearlyPurchased");
const yearlyActiveEl = document.getElementById("yearlyActive");
const yearlyMaintenanceEl = document.getElementById("yearlyMaintenance");
const yearlyActivePercentEl = document.getElementById("yearlyActivePercent");
const yearlyMaintenancePercentEl = document.getElementById(
  "yearlyMaintenancePercent"
);

// Charts
const monthlyChartCtx = document
  .getElementById("monthlyChart")
  .getContext("2d");
const yearlyChartCtx = document.getElementById("yearlyChart").getContext("2d");

/***********************
 * STATE
 ***********************/
let devices = [];
let users = [];
let monthlyChart, yearlyChart;
let currentDeviceId = null;
let currentUserId = null;
let deleteType = null;
let deleteId = null;

/***********************
 * LOAD DATA
 ***********************/
async function loadDevices() {
  const data = await fetchJson("/api/devices");
  if (!data) return;
  devices = data;
  renderDevicesTable();
}

async function loadUsers() {
  const data = await fetchJson("/api/users");
  if (!data) return;
  users = data;
  renderUsersTable();
}

async function loadAllData() {
  await Promise.all([loadDevices(), loadUsers()]);
  updateStats();
  initCharts();
}

/***********************
 * RENDER TABLES
 ***********************/
function renderDevicesTable() {
  devicesTableBody.innerHTML = "";
  devices.forEach((d) => {
    devicesTableBody.innerHTML += `
      <tr>
        <td>${d.MaThietBi}</td>
        <td>${d.TenThietBi}</td>
        <td>${d.LoaiThietBi}</td>
        <td>${d.SerialSN || "-"}</td>
        <td>${formatDate(d.NgayNhap)}</td>
        <td><span class="status-badge ${getStatusClass(d.Trangthai)}">${
      d.Trangthai
    }</span></td>
        <td>${d.Nguoisudung || "-"}</td>
        <td>
          <div class="action-btns">
            <button class="btn btn-primary btn-sm" onclick="editDevice('${
              d.MaThietBi
            }')"><i class="fas fa-edit"></i></button>
            <button class="btn btn-danger btn-sm" onclick="confirmDelete('device','${
              d.MaThietBi
            }')"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`;
  });
}

function renderUsersTable() {
  usersTableBody.innerHTML = "";
  users.forEach((u) => {
    usersTableBody.innerHTML += `
      <tr>
        <td>${u.MaNV}</td>
        <td>${u.HoVaTen}</td>
        <td>${u.Phongban}</td>
        <td>${u.Thietbisudung || "-"}</td>
        <td>${u.Ngaycap ? formatDate(u.Ngaycap) : "-"}</td>
        <td>
          <span class="status-badge ${
            u.Trangthai === "Đang sử dụng" ? "status-active" : "status-inactive"
          }">${u.Trangthai || "Chưa cấp"}</span>
        </td>
        <td>
          <div class="action-btns">
            <button class="btn btn-primary btn-sm" onclick="editUser('${
              u.MaNV
            }')"><i class="fas fa-edit"></i></button>
            <button class="btn btn-danger btn-sm" onclick="confirmDelete('user','${
              u.MaNV
            }')"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`;
  });
}

/***********************
 * STATS & CHARTS
 ***********************/
function updateStats() {
  const total = devices.length;
  const active = devices.filter((d) => d.Trangthai === "Đang sử dụng").length;
  const maintenance = devices.filter((d) => d.Trangthai === "Bảo Hành").length;
  const available = devices.filter((d) => d.Trangthai === "Sẵn sàng").length;

  totalDevicesEl.textContent = total;
  activeDevicesEl.textContent = active;
  maintenanceDevicesEl.textContent = maintenance;
  availableDevicesEl.textContent = available;

  const newDevices = devices.filter((d) => {
    const diffDays =
      (new Date() - new Date(d.NgayNhap)) / (1000 * 60 * 60 * 24);
    return diffDays <= 30;
  }).length;

  newDevicesTextEl.textContent = `+${newDevices} thiết bị mới trong tháng`;
  activePercentEl.textContent = `${percent(active, total)}% tổng số thiết bị`;
  maintenancePercentEl.textContent = `${percent(
    maintenance,
    total
  )}% tổng số thiết bị`;
  availablePercentEl.textContent = `${percent(
    available,
    total
  )}% tổng số thiết bị`;
}

function initCharts() {
  const monthlyStats = getMonthlyStats();
  const yearlyStats = getYearlyStats();

  if (monthlyChart) monthlyChart.destroy();
  if (yearlyChart) yearlyChart.destroy();

  monthlyChart = new Chart(monthlyChartCtx, {
    type: "bar",
    data: {
      labels: monthlyStats.labels,
      datasets: [
        {
          label: "Mua mới",
          data: monthlyStats.purchased,
          backgroundColor: "rgba(52,152,219,0.7)",
        },
        {
          label: "Đang sử dụng",
          data: monthlyStats.active,
          backgroundColor: "rgba(46,204,113,0.7)",
        },
        {
          label: "Bảo Hành",
          data: monthlyStats.maintenance,
          backgroundColor: "rgba(243,156,18,0.7)",
        },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });

  yearlyChart = new Chart(yearlyChartCtx, {
    type: "bar",
    data: {
      labels: yearlyStats.labels,
      datasets: [
        {
          label: "Mua mới",
          data: yearlyStats.purchased,
          backgroundColor: "rgba(52,152,219,0.7)",
        },
        {
          label: "Đang sử dụng",
          data: yearlyStats.active,
          backgroundColor: "rgba(46,204,113,0.7)",
        },
        {
          label: "Bảo Hành",
          data: yearlyStats.maintenance,
          backgroundColor: "rgba(243,156,18,0.7)",
        },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false },
  });

  const currentYearStr = String(new Date().getFullYear());
  const idx = yearlyStats.labels.indexOf(currentYearStr);
  if (idx !== -1) {
    yearlyPurchasedEl.textContent = yearlyStats.purchased[idx];
    yearlyActiveEl.textContent = yearlyStats.active[idx];
    yearlyMaintenanceEl.textContent = yearlyStats.maintenance[idx];
    yearlyActivePercentEl.textContent = `${percent(
      yearlyStats.active[idx],
      yearlyStats.purchased[idx]
    )}% tổng mua mới`;
    yearlyMaintenancePercentEl.textContent = `${percent(
      yearlyStats.maintenance[idx],
      yearlyStats.purchased[idx]
    )}% tổng mua mới`;
  }
}

function getMonthlyStats() {
  const months = [
    "Tháng 1",
    "Tháng 2",
    "Tháng 3",
    "Tháng 4",
    "Tháng 5",
    "Tháng 6",
  ];
  const purchased = Array(6).fill(0);
  const active = Array(6).fill(0);
  const maintenance = Array(6).fill(0);

  devices.forEach((d) => {
    const m = new Date(d.NgayNhap).getMonth();
    if (m >= 0 && m < 6) {
      purchased[m]++;
      if (d.Trangthai === "Đang sử dụng") active[m]++;
      if (d.Trangthai === "Bảo Hành") maintenance[m]++;
    }
  });

  return { labels: months, purchased, active, maintenance };
}

function getYearlyStats() {
  const years = ["2019", "2020", "2021", "2022", "2023", "2024", "2025"];
  const purchased = Array(years.length).fill(0);
  const active = Array(years.length).fill(0);
  const maintenance = Array(years.length).fill(0);

  devices.forEach((d) => {
    const y = String(new Date(d.NgayNhap).getFullYear());
    const i = years.indexOf(y);
    if (i !== -1) {
      purchased[i]++;
      if (d.Trangthai === "Đang sử dụng") active[i]++;
      if (d.Trangthai === "Bảo Hành") maintenance[i]++;
    }
  });

  return { labels: years, purchased, active, maintenance };
}

/***********************
 * CRUD THIẾT BỊ
 ***********************/
function addDevice() {
  currentDeviceId = null;
  deviceForm.reset();
  loadUsersForDeviceSelect();
  deviceModal.style.display = "flex";
}

function editDevice(id) {
  const d = devices.find((x) => x.MaThietBi === id);
  if (!d) return;

  currentDeviceId = id;
  document.getElementById("MaThietBi").value = d.MaThietBi;
  document.getElementById("TenThietBi").value = d.TenThietBi;
  document.getElementById("LoaiThietBi").value = d.LoaiThietBi;
  document.getElementById("SerialSN").value = d.SerialSN || "";
  document.getElementById("NgayNhap").value = formatDate(d.NgayNhap);
  document.getElementById("Trangthai").value = d.Trangthai;
  loadUsersForDeviceSelect(d.Nguoisudung);

  deviceModal.style.display = "flex";
}

async function saveDevice() {
  const payload = {
    MaThietBi: document.getElementById("MaThietBi").value.trim(),
    TenThietBi: document.getElementById("TenThietBi").value.trim(),
    LoaiThietBi: document.getElementById("LoaiThietBi").value,
    SerialSN: document.getElementById("SerialSN").value.trim(),
    NgayNhap: document.getElementById("NgayNhap").value,
    Trangthai: document.getElementById("Trangthai").value,
    Nguoisudung: document.getElementById("Nguoisudung").value || null,
  };

  if (!payload.MaThietBi || !payload.TenThietBi) {
    showAlert("Vui lòng nhập Mã thiết bị và Tên thiết bị", false);
    return;
  }

  const url = currentDeviceId
    ? `/api/devices/${currentDeviceId}`
    : "/api/devices";
  const method = currentDeviceId ? "PUT" : "POST";

  const ok = await fetchJson(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (ok !== null) {
    deviceModal.style.display = "none";
    await loadDevices();
    updateStats();
    showAlert("Lưu thiết bị thành công", true);
  }
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
  document.getElementById("assignDate").value = u.Ngaycap || "";

  userModal.style.display = "flex";
}

async function saveUser() {
  const payload = {
    MaNV: document.getElementById("userCode").value.trim(),
    HoVaTen: document.getElementById("userName").value.trim(),
    Phongban: document.getElementById("userDepartment").value,
    Thietbisudung: document.getElementById("userDevice").value || null,
    Ngaycap: document.getElementById("assignDate").value || null,
    Trangthai: document.getElementById("userDevice").value
      ? "Đang sử dụng"
      : "Chưa cấp",
  };

  if (!payload.MaNV || !payload.HoVaTen) {
    showAlert("Vui lòng nhập Mã NV và Họ tên", false);
    return;
  }

  const url = currentUserId ? `/api/users/${currentUserId}` : "/api/users";
  const method = currentUserId ? "PUT" : "POST";

  const ok = await fetchJson(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (ok !== null) {
    userModal.style.display = "none";
    await loadUsers();
    updateStats();
    showAlert("Lưu người dùng thành công", true);
  }
}

/***********************
 * XOÁ
 ***********************/
function confirmDelete(type, id) {
  deleteType = type;
  deleteId = id;
  deleteModal.style.display = "flex";
}

async function deleteItem() {
  const url =
    deleteType === "device"
      ? `/api/devices/${deleteId}`
      : `/api/users/${deleteId}`;
  const ok = await fetchJson(url, { method: "DELETE" });
  if (ok !== null) {
    deleteModal.style.display = "none";
    await loadAllData();
    showAlert("Xóa thành công", true);
  }
}

/***********************
 * HELPERS
 ***********************/
function getStatusClass(status) {
  if (status === "Đang sử dụng") return "status-active";
  if (status === "Bảo Hành") return "status-maintenance";
  // CSS hiện có: active / maintenance / inactive → map "Sẵn sàng" thành inactive để hiển thị khác màu
  if (status === "Sẵn sàng") return "status-inactive";
  return "";
}

function percent(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
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

function loadUsersForDeviceSelect(selected = null) {
  const sel = document.getElementById("Nguoisudung");
  sel.innerHTML = '<option value="">Không có</option>';
  users.forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u.HoVaTen; // cột Nguoisudung trong THIETBI là NVARCHAR
    opt.textContent = u.HoVaTen;
    if (selected && u.HoVaTen === selected) opt.selected = true;
    sel.appendChild(opt);
  });
}

function loadDevicesForUserSelect(selectedId = null) {
  const sel = document.getElementById("userDevice");
  sel.innerHTML = '<option value="">Không có</option>';
  devices
    .filter((d) => d.Trangthai === "Sẵn sàng" || d.MaThietBi === selectedId)
    .forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d.MaThietBi; // cột Thietbisudung trong NHANVIEN lưu Mã thiết bị
      opt.textContent = `${d.TenThietBi} (${d.MaThietBi})`;
      if (selectedId && d.MaThietBi === selectedId) opt.selected = true;
      sel.appendChild(opt);
    });
}

/***********************
 * SỰ KIỆN
 ***********************/
loginBtn.addEventListener("click", () => {
  const u = document.getElementById("username").value.trim();
  const p = document.getElementById("password").value.trim();
  if (!u || !p) return alert("Vui lòng nhập tài khoản và mật khẩu!");
  loginPage.style.display = "none";
  appContainer.style.display = "block";
  loadAllData();
});

logoutBtn.addEventListener("click", () => {
  appContainer.style.display = "none";
  loginPage.style.display = "flex";
});

addDeviceBtn.addEventListener("click", addDevice);
addUserBtn.addEventListener("click", addUser);

deviceForm.addEventListener("submit", (e) => {
  e.preventDefault();
  saveDevice();
});
userForm.addEventListener("submit", (e) => {
  e.preventDefault();
  saveUser();
});

saveDeviceBtn.addEventListener("click", (e) => {
  e.preventDefault();
  deviceForm.requestSubmit();
});
saveUserBtn.addEventListener("click", (e) => {
  e.preventDefault();
  userForm.requestSubmit();
});

confirmDeleteBtn.addEventListener("click", deleteItem);
cancelDeleteBtn.addEventListener(
  "click",
  () => (deleteModal.style.display = "none")
);
closeDeleteModal.addEventListener(
  "click",
  () => (deleteModal.style.display = "none")
);

cancelDeviceBtn.addEventListener(
  "click",
  () => (deviceModal.style.display = "none")
);
closeDeviceModal.addEventListener(
  "click",
  () => (deviceModal.style.display = "none")
);

cancelUserBtn.addEventListener(
  "click",
  () => (userModal.style.display = "none")
);
closeUserModal.addEventListener(
  "click",
  () => (userModal.style.display = "none")
);

// Đóng modal khi click ra ngoài
window.addEventListener("click", (e) => {
  if (e.target === deviceModal) deviceModal.style.display = "none";
  if (e.target === userModal) userModal.style.display = "none";
  if (e.target === deleteModal) deleteModal.style.display = "none";
});

// Menu
menuItems.forEach((item) => {
  item.addEventListener("click", (e) => {
    e.preventDefault();
    menuItems.forEach((i) => i.classList.remove("active"));
    item.classList.add("active");

    contentSections.forEach((sec) => (sec.style.display = "none"));
    const sectionId = item.dataset.section + "Section";
    document.getElementById(sectionId).style.display = "block";

    if (sectionId === "chartSection") {
      monthlyChart && monthlyChart.update();
      yearlyChart && yearlyChart.update();
    }
  });
});

/***********************
 * KHỞI TẠO NHỎ
 ***********************/
(function initSmall() {
  const y = new Date().getFullYear();
  const el1 = document.getElementById("currentYear");
  const el2 = document.getElementById("currentYear2");
  if (el1) el1.textContent = y;
  if (el2) el2.textContent = y;

  document.querySelectorAll('input[type="date"]').forEach((inp) => {
    if (!inp.value) inp.setAttribute("placeholder", "YYYY-MM-DD");
  });
})();
