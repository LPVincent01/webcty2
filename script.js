/***********************
 * CẤU HÌNH API
 ***********************/
const API_BASE = (() => {
  // Nếu đang chạy chung port 3000 (mở web từ backend) -> xài origin hiện tại
  if (window.location.origin.includes(":3000")) return window.location.origin;

  // Mặc định khi dùng Live Server/Preview (5500…) -> ĐỔI IP dưới đây theo máy bạn nếu cần
  // Ví dụ LAN: http://192.168.11.51:3000, hoặc để localhost nếu front & back cùng máy.
  const FALLBACK = "http://192.168.11.51:3000";
  return window.__API_BASE__ || FALLBACK; // có thể override bằng window.__API_BASE__
})();

const api = (url) => (url.startsWith("http") ? url : `${API_BASE}${url}`);

async function fetchJson(url, options = {}) {
  try {
    const headers = { ...(options.headers || {}) };
    if (window.authToken)
      headers["Authorization"] = `Bearer ${window.authToken}`;
    const res = await fetch(api(url), { ...options, headers });
    if (!res.ok) {
      const text = await res.text();
      if (res.status === 401 || res.status === 403) {
        handleUnauthorized();
      }
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

function handleUnauthorized() {
  window.authToken = null;
  window.currentRole = null;
  window.currentUsername = null;
  try {
    appContainer.style.display = "none";
    loginPage.style.display = "flex";
  } catch (_) {}
  showAlert("Phiên đăng nhập hết hạn hoặc không hợp lệ", false);
}

function applyRoleUI() {
  // Hiện tại các nút hành động được render theo role trong render*Table.
  // Hàm này để mở rộng nếu muốn ẩn/hiện phần khác theo role.
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

// Stats (tổng quan)
const totalDevicesEl = document.getElementById("totalDevices");
const activeDevicesEl = document.getElementById("activeDevices");
const maintenanceDevicesEl = document.getElementById("maintenanceDevices");
const availableDevicesEl = document.getElementById("availableDevices");
const newDevicesTextEl = document.getElementById("newDevicesText");
const activePercentEl = document.getElementById("activePercent");
const maintenancePercentEl = document.getElementById("maintenancePercent");
const availablePercentEl = document.getElementById("availablePercent");

// Thêm phần Hư Hỏng (tổng quan)
const brokenDevicesEl = document.getElementById("brokenDevices");
const brokenPercentEl = document.getElementById("brokenPercent");

// Stats phần năm
const yearlyPurchasedEl = document.getElementById("yearlyPurchased");
const yearlyActiveEl = document.getElementById("yearlyActive");
const yearlyMaintenanceEl = document.getElementById("yearlyMaintenance");
const yearlyActivePercentEl = document.getElementById("yearlyActivePercent");
const yearlyMaintenancePercentEl = document.getElementById(
  "yearlyMaintenancePercent"
);

// Thêm phần Hư Hỏng theo năm
const yearlyBrokenEl = document.getElementById("yearlyBroken");
const yearlyBrokenPercentEl = document.getElementById("yearlyBrokenPercent");

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
// AUTH STATE
window.authToken = null;
window.currentRole = null;
window.currentUsername = null;

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
    const actions =
      window.currentRole === "admin"
        ? `<div class="action-btns">
           <button class="btn btn-primary btn-sm" onclick="editDevice('${d.MaThietBi}')"><i class="fas fa-edit"></i></button>
           <button class="btn btn-danger btn-sm" onclick="confirmDelete('device','${d.MaThietBi}')"><i class="fas fa-trash"></i></button>
         </div>`
        : `<div class="action-btns">
           <button class="btn btn-primary btn-sm" onclick="editDevice('${d.MaThietBi}')"><i class="fas fa-edit"></i></button>
         </div>`;
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
        <td>${actions}</td>
      </tr>`;
  });
}

function renderUsersTable() {
  usersTableBody.innerHTML = "";
  users.forEach((u) => {
    let badgeClass = getStatusClass(u.Trangthai);
    if (!badgeClass) badgeClass = "status-available"; // fallback
    const actions =
      window.currentRole === "admin"
        ? `<div class="action-btns">
           <button class="btn btn-primary btn-sm" onclick="editUser('${u.MaNV}')"><i class="fas fa-edit"></i></button>
           <button class="btn btn-danger btn-sm" onclick="confirmDelete('user','${u.MaNV}')"><i class="fas fa-trash"></i></button>
         </div>`
        : ``; // user role: không được sửa/xóa người dùng
    usersTableBody.innerHTML += `
      <tr>
        <td>${u.MaNV}</td>
        <td>${u.HoVaTen}</td>
        <td>${u.Phongban}</td>
        <td>${u.Thietbisudung || "-"}</td>
        <td>${u.Ngaycap ? formatDate(u.Ngaycap) : "-"}</td>
        <td>
          <span class="status-badge ${badgeClass}">${
      u.Trangthai || "Chưa cấp"
    }</span>
        </td>
        <td>${actions}</td>
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
  const broken = devices.filter((d) => d.Trangthai === "Hư Hỏng").length;
  const available = devices.filter((d) => d.Trangthai === "Sẵn sàng").length;

  totalDevicesEl.textContent = total;
  activeDevicesEl.textContent = active;
  maintenanceDevicesEl.textContent = maintenance;
  availableDevicesEl.textContent = available;
  if (brokenDevicesEl) brokenDevicesEl.textContent = broken;

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
  if (brokenPercentEl)
    brokenPercentEl.textContent = `${percent(broken, total)}% tổng số thiết bị`;
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
          backgroundColor: "rgba(52,152,219,0.7)", // xanh dương
        },
        {
          label: "Đang sử dụng",
          data: monthlyStats.active,
          backgroundColor: "rgba(46,204,113,0.7)", // xanh lá
        },
        {
          label: "Bảo Hành",
          data: monthlyStats.maintenance,
          backgroundColor: "rgba(243,156,18,0.7)", // vàng
        },
        {
          label: "Hư Hỏng",
          data: monthlyStats.broken,
          backgroundColor: "rgba(231,76,60,0.7)", // đỏ
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
        {
          label: "Hư Hỏng",
          data: yearlyStats.broken,
          backgroundColor: "rgba(231,76,60,0.7)",
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
    if (yearlyBrokenEl) yearlyBrokenEl.textContent = yearlyStats.broken[idx];

    yearlyActivePercentEl.textContent = `${percent(
      yearlyStats.active[idx],
      yearlyStats.purchased[idx]
    )}% tổng mua mới`;
    yearlyMaintenancePercentEl.textContent = `${percent(
      yearlyStats.maintenance[idx],
      yearlyStats.purchased[idx]
    )}% tổng mua mới`;
    if (yearlyBrokenPercentEl)
      yearlyBrokenPercentEl.textContent = `${percent(
        yearlyStats.broken[idx],
        yearlyStats.purchased[idx]
      )}% tổng mua mới`;
  }
}

function getMonthlyStats() {
  const months = Array.from({ length: 12 }, (_, i) => `Tháng ${i + 1}`);
  const purchased = Array(12).fill(0);
  const active = Array(12).fill(0);
  const maintenance = Array(12).fill(0);
  const broken = Array(12).fill(0);

  devices.forEach((d) => {
    const m = new Date(d.NgayNhap).getMonth(); // 0..11
    if (m >= 0 && m < 12) {
      purchased[m]++;
      if (d.Trangthai === "Đang sử dụng") active[m]++;
      if (d.Trangthai === "Bảo Hành") maintenance[m]++;
      if (d.Trangthai === "Hư Hỏng") broken[m]++;
    }
  });

  return { labels: months, purchased, active, maintenance, broken };
}

function getYearlyStats() {
  const start = 2025;
  let maxYear = new Date().getFullYear();
  // Bảo đảm bao quát năm tối đa có trong dữ liệu nếu lớn hơn hiện tại
  devices.forEach((d) => {
    const t = new Date(d.NgayNhap);
    const y = t.getFullYear();
    if (!Number.isNaN(y) && y > maxYear) maxYear = y;
  });
  const years = [];
  for (let y = start; y <= maxYear; y++) years.push(String(y));

  const purchased = Array(years.length).fill(0);
  const active = Array(years.length).fill(0);
  const maintenance = Array(years.length).fill(0);
  const broken = Array(years.length).fill(0);

  devices.forEach((d) => {
    const y = String(new Date(d.NgayNhap).getFullYear());
    const i = years.indexOf(y);
    if (i !== -1) {
      purchased[i]++;
      if (d.Trangthai === "Đang sử dụng") active[i]++;
      if (d.Trangthai === "Bảo Hành") maintenance[i]++;
      if (d.Trangthai === "Hư Hỏng") broken[i]++;
    }
  });

  return { labels: years, purchased, active, maintenance, broken };
}

/***********************
 * CRUD THIẾT BỊ
 ***********************/
function addDevice() {
  currentDeviceId = null;
  deviceForm.reset();
  loadUsersForDeviceSelect();
  ensureQrUI();
  resetQrUI();
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

  ensureQrUI();
  resetQrUI();
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

  // Kiểm tra Serial(S/N) duy nhất trên client (bỏ qua rỗng)
  if (payload.SerialSN) {
    const serialNorm = payload.SerialSN.trim().toLowerCase();
    const dup = devices.some(
      (d) =>
        (d.SerialSN || "").trim().toLowerCase() === serialNorm &&
        (currentDeviceId ? d.MaThietBi !== currentDeviceId : true)
    );
    if (dup) {
      showAlert("Serial(S/N) đã tồn tại. Vui lòng nhập Serial khác.", false);
      document.getElementById("SerialSN").focus();
      return;
    }
  }

  // Sử dụng trạng thái người dùng chọn; nếu chọn "Sẵn sàng" thì bỏ gán người dùng
  const chosenStatus = document.getElementById("Trangthai").value;
  payload.Trangthai =
    chosenStatus || (payload.Nguoisudung ? "Đang sử dụng" : "Sẵn sàng");
  // Không tự xóa Nguoisudung ở client; để backend quyết định đồng bộ phù hợp
  // Lưu ý: trạng thái "Hư Hỏng" giữ nguyên người dùng nếu có; backend sẽ xử lý đồng bộ tùy logic API.

  const prevDev = currentDeviceId
    ? devices.find((x) => x.MaThietBi === currentDeviceId)
    : null;
  const prevUserName = prevDev?.Nguoisudung || null;

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
    // Đồng bộ người dùng liên quan (best-effort ở client; backend vẫn là nguồn chân lý)
    if (window.currentRole === "admin") {
      try {
        // Nếu gỡ người dùng cũ
        if (!payload.Nguoisudung && prevUserName) {
          const userPrev = users.find(
            (u) =>
              u.HoVaTen === prevUserName &&
              u.Thietbisudung === (prevDev?.MaThietBi || payload.MaThietBi)
          );
          if (userPrev) {
            await updateUserFull(userPrev, {
              Thietbisudung: null,
              Ngaycap: null,
              Trangthai: "Chưa cấp",
            });
          }
        }
        // Nếu đổi người dùng
        if (payload.Nguoisudung && payload.Nguoisudung !== prevUserName) {
          // Hủy gán người dùng cũ nếu có
          if (prevUserName) {
            const userOld = users.find(
              (u) =>
                u.HoVaTen === prevUserName &&
                u.Thietbisudung === (prevDev?.MaThietBi || payload.MaThietBi)
            );
            if (userOld) {
              await updateUserFull(userOld, {
                Thietbisudung: null,
                Ngaycap: null,
                Trangthai: "Chưa cấp",
              });
            }
          }
          // Gán cho người dùng mới
          const userNew = users.find((u) => u.MaNV === payload.Nguoisudung);
          if (userNew) {
            await updateUserFull(userNew, {
              Thietbisudung: payload.MaThietBi,
              Trangthai: "Đang sử dụng",
            });
          }
        }
      } catch (e) {
        console.error("Lỗi đồng bộ người dùng cho thiết bị:", e);
      }
    }

    deviceModal.style.display = "none";
    await loadAllData();
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
  document.getElementById("assignDate").value = u.Ngaycap
    ? formatDate(u.Ngaycap)
    : "";

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

  if (ok !== null) {
    // Đồng bộ trạng thái thiết bị
    try {
      // 1) Nếu gỡ thiết bị cũ
      if (prevDeviceId && prevDeviceId !== payload.Thietbisudung) {
        const prevDev = devices.find((d) => d.MaThietBi === prevDeviceId);
        await updateDeviceFull(prevDev, {
          Trangthai: "Sẵn sàng",
          Nguoisudung: null,
        });
      }
      // 2) Nếu gán thiết bị mới
      if (payload.Thietbisudung) {
        const newDev = devices.find(
          (d) => d.MaThietBi === payload.Thietbisudung
        );
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
    showAlert("Lưu người dùng thành công", true);
  }
}

/***********************
 * XOÁ
 ***********************/
function confirmDelete(type, id) {
  if (window.currentRole !== "admin") {
    showAlert("Bạn không có quyền xóa", false);
    return;
  }
  deleteType = type;
  deleteId = id;
  deleteModal.style.display = "flex";
}

async function deleteItem() {
  // Lưu thông tin trước khi xóa để đồng bộ
  let prevDeviceForUser = null;
  let usersUsingDevice = [];

  if (deleteType === "user") {
    const u = users.find((x) => x.MaNV === deleteId);
    prevDeviceForUser = u?.Thietbisudung || null;
  } else if (deleteType === "device") {
    usersUsingDevice = users.filter((u) => u.Thietbisudung === deleteId);
  }

  const url =
    deleteType === "device"
      ? `/api/devices/${deleteId}`
      : `/api/users/${deleteId}`;
  const ok = await fetchJson(url, { method: "DELETE" });
  if (ok !== null) {
    try {
      if (deleteType === "user" && prevDeviceForUser) {
        const dev = devices.find((d) => d.MaThietBi === prevDeviceForUser);
        await updateDeviceFull(dev, {
          Trangthai: "Sẵn sàng",
          Nguoisudung: null,
        });
      }
      if (deleteType === "device" && usersUsingDevice.length) {
        for (const u of usersUsingDevice) {
          await updateUserFull(u, {
            Thietbisudung: null,
            Ngaycap: null,
            Trangthai: "Chưa cấp",
          });
        }
      }
    } catch (e) {
      console.error("Lỗi đồng bộ sau khi xóa:", e);
    }

    deleteModal.style.display = "none";
    await loadAllData();
    showAlert("Xóa thành công", true);
  }
}

/***********************
 * HELPERS
 ***********************/
function getStatusClass(status) {
  if (!status) return "";
  // Chuẩn hóa: bỏ khoảng trắng, viết thường, bỏ dấu
  const norm = status
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  // Các map chấp nhận cả có/không dấu
  if (norm === "dang su dung") return "status-active";
  if (norm === "bao hanh") return "status-maintenance";
  if (norm === "san sang") return "status-available";
  if (norm === "chua cap") return "status-available";
  if (norm === "hu hong") return "status-broken";
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

// Cập nhật thiết bị đầy đủ trường (do API PUT ghi đè các cột)
async function updateDeviceFull(dev, overrides = {}) {
  if (!dev) return null;
  const body = {
    TenThietBi: dev.TenThietBi || "",
    LoaiThietBi: dev.LoaiThietBi || "",
    SerialSN: dev.SerialSN || "",
    NgayNhap: dev.NgayNhap ? formatDate(dev.NgayNhap) : null,
    Trangthai: dev.Trangthai || "Sẵn sàng",
    Nguoisudung: dev.Nguoisudung || null,
    ...overrides,
  };
  return fetchJson(`/api/devices/${dev.MaThietBi}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Cập nhật người dùng đầy đủ trường (do API PUT ghi đè các cột)
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
  sel.innerHTML = '<option value="">Không có</option>';
  users.forEach((u) => {
    const opt = document.createElement("option");
    // Gửi Mã NV làm giá trị để tránh nhập nhằng khi trùng tên
    opt.value = u.MaNV;
    opt.textContent = `${u.HoVaTen} (${u.MaNV})`;
    // Hỗ trợ cả trường hợp "selected" là tên (từ d.Nguoisudung) hoặc là MaNV
    if (selected && (u.MaNV === selected || u.HoVaTen === selected))
      opt.selected = true;
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
loginBtn.addEventListener("click", async () => {
  const u = document.getElementById("username").value.trim();
  const p = document.getElementById("password").value.trim();
  if (!u || !p) return alert("Vui lòng nhập tài khoản và mật khẩu!");
  const data = await fetchJson("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: u, password: p }),
  });
  if (!data) return; // lỗi đã hiển thị bởi fetchJson
  window.authToken = data.token;
  window.currentRole = data.role;
  window.currentUsername = data.username;

  // Cập nhật hiển thị tên user và avatar
  try {
    const role = data.role === "admin" ? "admin" : "user";
    const display = role === "admin" ? "A admin" : "U user";
    const initial = role === "admin" ? "A" : "U";
    const userText = document.getElementById("currentUserText");
    const userAvatar = document.getElementById("userAvatar");
    if (userText) userText.textContent = display;
    if (userAvatar)
      userAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
        initial
      )}&background=3498db&color=fff`;
  } catch (_) {}

  loginPage.style.display = "none";
  appContainer.style.display = "block";
  applyRoleUI();
  loadAllData();
});

logoutBtn.addEventListener("click", () => {
  window.authToken = null;
  window.currentRole = null;
  window.currentUsername = null;
  try {
    const userText = document.getElementById("currentUserText");
    const userAvatar = document.getElementById("userAvatar");
    if (userText) userText.textContent = "Chưa đăng nhập";
    if (userAvatar)
      userAvatar.src =
        "https://ui-avatars.com/api/?name=User&background=3498db&color=fff";
  } catch (_) {}
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

// ====== QR CODE: UI + TẠO + TẢI ======
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
      <label>QR cho thiết bị</label>
      <div id="qrContainer" class="center" style="min-height:150px;border:1px dashed #ccc;border-radius:6px;padding:8px;"></div>
      <div class="row" style="margin-top:8px;gap:8px;">
        <button type="button" class="btn btn-primary" id="generateQrBtn">Tạo QR</button>
        <button type="button" class="btn btn-primary" id="downloadQrBtn" disabled>Tải QR</button>
      </div>
      <div class="muted">QR sẽ mở trang thông tin thiết bị (display.html).</div>
    </div>
  `;
  modalBody.appendChild(wrap);
  const genBtn = document.getElementById("generateQrBtn");
  const dlBtn = document.getElementById("downloadQrBtn");
  genBtn.addEventListener("click", generateDeviceQR);
  dlBtn.addEventListener("click", downloadDeviceQR);
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

let lastQrCanvas = null;
let lastQrImg = null;
let lastQrUrl = null;
async function generateDeviceQR() {
  let useRemote = false;
  try {
    await loadQrLib();
  } catch (e) {
    useRemote = true; // fallback sang ảnh QR từ dịch vụ nếu CDN bị chặn/không tải được
  }
  const id = document.getElementById("MaThietBi").value.trim();
  if (!id) {
    showAlert("Vui lòng nhập Mã thiết bị trước khi tạo QR", false);
    return;
  }
  const url = `${API_BASE}/display.html?id=${encodeURIComponent(id)}`;
  const cont = document.getElementById("qrContainer");
  if (!cont) return;
  cont.innerHTML = "";

  if (!useRemote && window.QRCode && window.QRCode.toCanvas) {
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
      showAlert("Tạo QR thất bại", false);
    }
  } else {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
      url
    )}`;
    img.onload = () => {
      cont.innerHTML = "";
      cont.appendChild(img);
      lastQrCanvas = null;
      lastQrImg = img;
      lastQrUrl = url;
      const dlBtn = document.getElementById("downloadQrBtn");
      if (dlBtn) dlBtn.disabled = false;
    };
    img.onerror = () => {
      showAlert("Không thể tải ảnh QR", false);
    };
    img.src = qrSrc;
  }
}

function downloadDeviceQR() {
  const id = document.getElementById("MaThietBi").value.trim() || "device";
  let canvas = lastQrCanvas;
  if (!canvas) {
    if (!lastQrImg) {
      showAlert("Chưa có QR để tải", false);
      return;
    }
    // Chuyển ảnh QR thành canvas để tải
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

// Đồng bộ tự động giữa chọn Người sử dụng và Trạng thái trong form thiết bị
(function linkUserStatusFields() {
  const userSel = document.getElementById("Nguoisudung");
  const statusSel = document.getElementById("Trangthai");
  if (!userSel || !statusSel) return;
  userSel.addEventListener("change", () => {
    if (userSel.value) {
      // Có người sử dụng => ưu tiên chuyển sang "Đang sử dụng"
      if (!statusSel.value || statusSel.value === "Sẵn sàng") {
        statusSel.value = "Đang sử dụng";
      }
    } else {
      // Không có người sử dụng => chuyển về "Sẵn sàng"
      if (!statusSel.value || statusSel.value === "Đang sử dụng") {
        statusSel.value = "Sẵn sàng";
      }
    }
  });
})();
