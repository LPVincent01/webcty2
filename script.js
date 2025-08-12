let devices = [
  {
    id: 1,
    code: "TB001",
    name: "Laptop Dell XPS 15",
    type: "Laptop",
    serial: "20250801",
    purchaseDate: "2023-03-15",
    status: "active",
    userId: 1,
  },
  {
    id: 2,
    code: "TB002",
    name: "MacBook Pro M1",
    type: "Laptop",
    serial: "20250802",
    purchaseDate: "2023-03-20",
    status: "active",
    userId: 2,
  },
  {
    id: 3,
    code: "TB003",
    name: "PC Workstation",
    type: "Máy bàn",
    serial: "20250803",
    purchaseDate: "2023-04-05",
    status: "maintenance",
    userId: null,
  },
  {
    id: 4,
    code: "TB004",
    name: 'iPad Pro 12.9"',
    type: "Tablet",
    serial: "20250804",
    purchaseDate: "2023-04-10",
    status: "active",
    userId: 3,
  },
  {
    id: 5,
    code: "TB005",
    name: 'Monitor Dell 27"',
    type: "Màn hình",
    serial: "20250805",
    purchaseDate: "2023-04-15",
    status: "inactive",
    userId: null,
  },
];

let users = [
  {
    id: 1,
    code: "NV001",
    name: "Nguyễn Văn A",
    department: "Kế toán",
    deviceId: 1,
    assignDate: "2023-03-20",
  },
  {
    id: 2,
    code: "NV002",
    name: "Trần Thị B",
    department: "Nhân sự",
    deviceId: 2,
    assignDate: "2023-03-25",
  },
  {
    id: 3,
    code: "NV003",
    name: "Lê Văn C",
    department: "Theo đơn",
    deviceId: 4,
    assignDate: "2023-04-12",
  },
  {
    id: 4,
    code: "NV004",
    name: "Phạm Thị D",
    department: "IT",
    deviceId: 3,
    assignDate: "2023-04-10",
  },
  {
    id: 5,
    code: "NV005",
    name: "Hoàng Văn E",
    department: "Xuất nhập khẩu",
    deviceId: null,
    assignDate: null,
  },
];

// Chart Data
const monthlyData = {
  labels: ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6"],
  purchased: [5, 8, 12, 15, 3, 2],
  active: [3, 6, 10, 12, 10, 8],
  maintenance: [1, 2, 2, 3, 2, 1],
};

const yearlyData = {
  labels: ["2019", "2020", "2021", "2022", "2023"],
  purchased: [25, 30, 35, 40, 45],
  active: [20, 25, 28, 32, 38],
  maintenance: [5, 5, 7, 8, 7],
};

// DOM Elements
const loginPage = document.getElementById("loginPage");
const appContainer = document.getElementById("appContainer");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const menuItems = document.querySelectorAll(".sidebar-menu a");
const contentSections = document.querySelectorAll(".content-section");

// Device Elements
const devicesTableBody = document.getElementById("devicesTableBody");
const addDeviceBtn = document.getElementById("addDeviceBtn");
const deviceModal = document.getElementById("deviceModal");
const deviceModalTitle = document.getElementById("deviceModalTitle");
const closeDeviceModal = document.getElementById("closeDeviceModal");
const cancelDeviceBtn = document.getElementById("cancelDeviceBtn");
const saveDeviceBtn = document.getElementById("saveDeviceBtn");
const deviceForm = document.getElementById("deviceForm");

// User Elements
const usersTableBody = document.getElementById("usersTableBody");
const addUserBtn = document.getElementById("addUserBtn");
const userModal = document.getElementById("userModal");
const userModalTitle = document.getElementById("userModalTitle");
const closeUserModal = document.getElementById("closeUserModal");
const cancelUserBtn = document.getElementById("cancelUserBtn");
const saveUserBtn = document.getElementById("saveUserBtn");
const userForm = document.getElementById("userForm");

// Delete Elements
const deleteModal = document.getElementById("deleteModal");
const closeDeleteModal = document.getElementById("closeDeleteModal");
const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
const deleteMessage = document.getElementById("deleteMessage");

// Chart Elements
const monthlyChartCtx = document
  .getElementById("monthlyChart")
  .getContext("2d");
const yearlyChartCtx = document.getElementById("yearlyChart").getContext("2d");

// Stats Elements
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

// Current Year
const currentYear = 2025;
document.getElementById("currentYear").textContent = currentYear;
document.getElementById("currentYear2").textContent = currentYear;

// Variables
let currentDeviceId = null;
let currentUserId = null;
let deleteType = null;
let deleteId = null;

// Charts
let monthlyChart, yearlyChart;

// Thêm các hàm này ngay trước hàm initApp
function getMonthlyStats() {
  const currentYear = new Date().getFullYear();
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

  devices.forEach((device) => {
    const date = new Date(device.purchaseDate);
    if (date.getFullYear() === currentYear) {
      const month = date.getMonth();
      if (month >= 0 && month < 6) {
        purchased[month]++;

        if (device.status === "active") {
          active[month]++;
        } else if (device.status === "maintenance") {
          maintenance[month]++;
        }
      }
    }
  });

  return {
    labels: months,
    purchased,
    active,
    maintenance,
  };
}

function getYearlyStats() {
  const years = ["2019", "2020", "2021", "2022", "2023"];

  const purchased = Array(5).fill(0);
  const active = Array(5).fill(0);
  const maintenance = Array(5).fill(0);

  devices.forEach((device) => {
    const date = new Date(device.purchaseDate);
    const year = date.getFullYear();
    const yearIndex = years.indexOf(year.toString());

    if (yearIndex !== -1) {
      purchased[yearIndex]++;

      if (device.status === "active") {
        active[yearIndex]++;
      } else if (device.status === "maintenance") {
        maintenance[yearIndex]++;
      }
    }
  });

  return {
    labels: years,
    purchased,
    active,
    maintenance,
  };
}
// Initialize App
function initApp() {
  const dateInputs = document.querySelectorAll('input[type="date"]');
  dateInputs.forEach((input) => {
    if (!input.value) input.setAttribute("placeholder", "YYYY-MM-DD");
    input.addEventListener("change", formatDateInput);
  });
  loadDevices();
  loadUsers();
  updateStats();
  initCharts();
}
function formatDateInput() {
  if (this.value) {
    const parts = this.value.split("-");
    if (parts.length === 3) {
      this.value = `${parts[0]}-${parts[1]}-${parts[2]}`;
    }
  }
}
// Load Devices
function loadDevices() {
  devicesTableBody.innerHTML = "";

  devices.forEach((device) => {
    const user = users.find((u) => u.id === device.userId);
    const statusText = getStatusText(device.status);
    const statusClass = getStatusClass(device.status);

    const row = document.createElement("tr");
    row.innerHTML = `
                    <td>${device.code}</td>
                    <td>${device.name}</td>
                    <td>${device.type}</td>
                    <td>${device.serial || "-"}</td>
                    <td>${formatDate(device.purchaseDate)}</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>${user ? user.name : "-"}</td>
                    <td>
                        <div class="action-btns">
                            <button class="btn btn-primary btn-sm edit-device" data-id="${
                              device.id
                            }">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-danger btn-sm delete-device" data-id="${
                              device.id
                            }">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;

    devicesTableBody.appendChild(row);
  });

  // Add event listeners to edit/delete buttons
  document.querySelectorAll(".edit-device").forEach((btn) => {
    btn.addEventListener("click", () => editDevice(btn.dataset.id));
  });

  document.querySelectorAll(".delete-device").forEach((btn) => {
    btn.addEventListener("click", () =>
      confirmDelete("device", btn.dataset.id)
    );
  });
}

// Load Users
function loadUsers() {
  usersTableBody.innerHTML = "";

  users.forEach((user) => {
    const device = devices.find((d) => d.id === user.deviceId);
    const statusText = user.deviceId ? "Đang sử dụng" : "Chưa cấp";
    const statusClass = user.deviceId ? "status-active" : "status-inactive";

    const row = document.createElement("tr");
    row.innerHTML = `
                    <td>${user.code}</td>
                    <td>${user.name}</td>
                    <td>${user.department}</td>
                    <td>${device ? `${device.name} (${device.code})` : "-"}</td>
                    <td>${
                      user.assignDate ? formatDate(user.assignDate) : "-"
                    }</td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>
                        <div class="action-btns">
                            <button class="btn btn-primary btn-sm edit-user" data-id="${
                              user.id
                            }">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-danger btn-sm delete-user" data-id="${
                              user.id
                            }">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </td>
                `;

    usersTableBody.appendChild(row);
  });

  // Add event listeners to edit/delete buttons
  document.querySelectorAll(".edit-user").forEach((btn) => {
    btn.addEventListener("click", () => editUser(btn.dataset.id));
  });

  document.querySelectorAll(".delete-user").forEach((btn) => {
    btn.addEventListener("click", () => confirmDelete("user", btn.dataset.id));
  });
}

// Update Statistics
function updateStats() {
  const total = devices.length;
  const active = devices.filter((d) => d.status === "active").length;
  const maintenance = devices.filter((d) => d.status === "maintenance").length;
  const available = devices.filter((d) => d.status === "inactive").length;

  totalDevicesEl.textContent = total;
  activeDevicesEl.textContent = active;
  maintenanceDevicesEl.textContent = maintenance;
  availableDevicesEl.textContent = available;

  const newDevices = devices.filter((d) => {
    const purchaseDate = new Date(d.purchaseDate);
    const currentDate = new Date();
    const diffTime = currentDate - purchaseDate;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return diffDays <= 30;
  }).length;

  newDevicesTextEl.textContent = `+${newDevices} thiết bị mới trong tháng`;
  activePercentEl.textContent = `${Math.round(
    (active / total) * 100
  )}% tổng số thiết bị`;
  maintenancePercentEl.textContent = `${Math.round(
    (maintenance / total) * 100
  )}% tổng số thiết bị`;
  availablePercentEl.textContent = `${Math.round(
    (available / total) * 100
  )}% tổng số thiết bị`;
}

// Lấy dữ liệu năm hiện tại từ biểu đồ
const yearlyStats = getYearlyStats();
const currentYearIndex = yearlyStats.labels.indexOf(currentYear.toString());

if (currentYearIndex !== -1) {
  const yearlyPurchased = yearlyStats.purchased[currentYearIndex];
  const yearlyActive = yearlyStats.active[currentYearIndex];
  const yearlyMaintenance = yearlyStats.maintenance[currentYearIndex];

  yearlyPurchasedEl.textContent = yearlyPurchased;
  yearlyActiveEl.textContent = yearlyActive;
  yearlyMaintenanceEl.textContent = yearlyMaintenance;

  yearlyActivePercentEl.textContent = `${Math.round(
    (yearlyActive / yearlyPurchased) * 100
  )}% tổng mua mới`;
  yearlyMaintenancePercentEl.textContent = `${Math.round(
    (yearlyMaintenance / yearlyPurchased) * 100
  )}% tổng mua mới`;
}
// Cập nhật biểu đồ nếu đang hiển thị
if (monthlyChart) {
  const monthlyStats = getMonthlyStats();
  monthlyChart.data.datasets[0].data = monthlyStats.purchased;
  monthlyChart.data.datasets[1].data = monthlyStats.active;
  monthlyChart.data.datasets[2].data = monthlyStats.maintenance;
  monthlyChart.update();
}

if (yearlyChart) {
  const yearlyStats = getYearlyStats();
  yearlyChart.data.datasets[0].data = yearlyStats.purchased;
  yearlyChart.data.datasets[1].data = yearlyStats.active;
  yearlyChart.data.datasets[2].data = yearlyStats.maintenance;
  yearlyChart.update();
}

// Initialize Charts
// Thay thế toàn bộ hàm initCharts hiện có bằng hàm này
function initCharts() {
  const monthlyStats = getMonthlyStats();
  const yearlyStats = getYearlyStats();

  // Monthly Chart
  monthlyChart = new Chart(monthlyChartCtx, {
    type: "bar",
    data: {
      labels: monthlyStats.labels,
      datasets: [
        {
          label: "Mua mới",
          data: monthlyStats.purchased,
          backgroundColor: "rgba(52, 152, 219, 0.7)",
          borderColor: "rgba(52, 152, 219, 1)",
          borderWidth: 1,
        },
        {
          label: "Đang sử dụng",
          data: monthlyStats.active,
          backgroundColor: "rgba(46, 204, 113, 0.7)",
          borderColor: "rgba(46, 204, 113, 1)",
          borderWidth: 1,
        },
        {
          label: "Bảo Hành",
          data: monthlyStats.maintenance,
          backgroundColor: "rgba(243, 156, 18, 0.7)",
          borderColor: "rgba(243, 156, 18, 1)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
        },
      },
    },
  });

  // Yearly Chart
  yearlyChart = new Chart(yearlyChartCtx, {
    type: "bar",
    data: {
      labels: yearlyStats.labels,
      datasets: [
        {
          label: "Mua mới",
          data: yearlyStats.purchased,
          backgroundColor: "rgba(52, 152, 219, 0.7)",
          borderColor: "rgba(52, 152, 219, 1)",
          borderWidth: 1,
        },
        {
          label: "Đang sử dụng",
          data: yearlyStats.active,
          backgroundColor: "rgba(46, 204, 113, 0.7)",
          borderColor: "rgba(46, 204, 113, 1)",
          borderWidth: 1,
        },
        {
          label: "Bảo Hành",
          data: yearlyStats.maintenance,
          backgroundColor: "rgba(243, 156, 18, 0.7)",
          borderColor: "rgba(243, 156, 18, 1)",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
        },
      },
    },
  });
}
// Add/Edit Device
function addDevice() {
  currentDeviceId = null;
  deviceModalTitle.textContent = "Thêm thiết bị mới";
  deviceForm.reset();
  document.getElementById("deviceId").value = "";

  // Load users dropdown
  const userSelect = document.getElementById("deviceUser");
  userSelect.innerHTML = '<option value="">Không có</option>';

  users.forEach((user) => {
    const option = document.createElement("option");
    option.value = user.id;
    option.textContent = user.name;
    userSelect.appendChild(option);
  });

  deviceModal.style.display = "flex";
}

function editDevice(id) {
  currentDeviceId = parseInt(id);
  const device = devices.find((d) => d.id === currentDeviceId);

  if (device) {
    deviceModalTitle.textContent = "Chỉnh sửa thiết bị";
    document.getElementById("deviceId").value = device.id;
    document.getElementById("deviceCode").value = device.code;
    document.getElementById("deviceName").value = device.name;
    document.getElementById("deviceType").value = device.type;
    document.getElementById("deviceSerial").value = device.serial || "";
    document.getElementById("purchaseDate").value = device.purchaseDate;
    document.getElementById("deviceStatus").value = device.status;

    // Load users dropdown
    const userSelect = document.getElementById("deviceUser");
    userSelect.innerHTML = '<option value="">Không có</option>';

    users.forEach((user) => {
      const option = document.createElement("option");
      option.value = user.id;
      option.textContent = user.name;
      option.selected = user.id === device.userId;
      userSelect.appendChild(option);
    });

    deviceModal.style.display = "flex";
  }
}

function saveDevice() {
  const id = document.getElementById("deviceId").value;
  const code = document.getElementById("deviceCode").value;
  const name = document.getElementById("deviceName").value;
  const type = document.getElementById("deviceType").value;
  const serial = document.getElementById("deviceSerial").value; // Thêm dòng này
  const purchaseDate = document.getElementById("purchaseDate").value;
  const status = document.getElementById("deviceStatus").value;
  const userId = document.getElementById("deviceUser").value || null;

  if (!code || !name || !type || !purchaseDate || !status) {
    alert("Vui lòng điền đầy đủ thông tin!");
    return;
  }
  if (!serial) {
    alert("Vui lòng nhập số serial!");
    return;
  }

  if (currentDeviceId) {
    // Update existing device
    const index = devices.findIndex((d) => d.id === currentDeviceId);
    if (index !== -1) {
      devices[index] = {
        id: currentDeviceId,
        code,
        name,
        type,
        serial,
        purchaseDate,
        status,
        userId: userId ? parseInt(userId) : null,
      };

      // Update user's device if changed
      if (userId) {
        const userIndex = users.findIndex((u) => u.id === parseInt(userId));
        if (userIndex !== -1) {
          users[userIndex].deviceId = currentDeviceId;
          users[userIndex].assignDate = purchaseDate;
        }
      }
    }
  } else {
    // Add new device
    const newId =
      devices.length > 0 ? Math.max(...devices.map((d) => d.id)) + 1 : 1;
    devices.push({
      id: newId,
      code,
      name,
      type,
      serial,
      purchaseDate,
      status,
      userId: userId ? parseInt(userId) : null,
    });

    // Update user's device if assigned
    if (userId) {
      const userIndex = users.findIndex((u) => u.id === parseInt(userId));
      if (userIndex !== -1) {
        users[userIndex].deviceId = newId;
        users[userIndex].assignDate = purchaseDate;
      }
    }
  }

  loadDevices();
  loadUsers();
  updateStats();
  deviceModal.style.display = "none";
}

// Add/Edit User
function addUser() {
  currentUserId = null;
  userModalTitle.textContent = "Thêm người dùng mới";
  userForm.reset();
  document.getElementById("userId").value = "";

  // Load available devices dropdown
  const deviceSelect = document.getElementById("userDevice");
  deviceSelect.innerHTML = '<option value="">Không có</option>';

  devices
    .filter((d) => d.status === "inactive")
    .forEach((device) => {
      const option = document.createElement("option");
      option.value = device.id;
      option.textContent = `${device.name} (${device.code})`;
      deviceSelect.appendChild(option);
    });

  userModal.style.display = "flex";
}

function editUser(id) {
  currentUserId = parseInt(id);
  const user = users.find((u) => u.id === currentUserId);

  if (user) {
    userModalTitle.textContent = "Chỉnh sửa người dùng";
    document.getElementById("userId").value = user.id;
    document.getElementById("userCode").value = user.code;
    document.getElementById("userName").value = user.name;
    document.getElementById("userDepartment").value = user.department;

    // Load available devices dropdown
    const deviceSelect = document.getElementById("userDevice");
    deviceSelect.innerHTML = '<option value="">Không có</option>';

    devices
      .filter((d) => d.status === "inactive" || d.id === user.deviceId)
      .forEach((device) => {
        const option = document.createElement("option");
        option.value = device.id;
        option.textContent = `${device.name} (${device.code})`;
        option.selected = device.id === user.deviceId;
        deviceSelect.appendChild(option);
      });

    document.getElementById("assignDate").value = user.assignDate || "";

    userModal.style.display = "flex";
  }
}

function saveUser() {
  const id = document.getElementById("userId").value;
  const code = document.getElementById("userCode").value;
  const name = document.getElementById("userName").value;
  const department = document.getElementById("userDepartment").value;
  const deviceId = document.getElementById("userDevice").value || null;
  const assignDate = document.getElementById("assignDate").value || null;

  if (!code || !name || !department) {
    alert("Vui lòng điền đầy đủ thông tin!");
    return;
  }

  if (currentUserId) {
    // Update existing user
    const index = users.findIndex((u) => u.id === currentUserId);
    if (index !== -1) {
      const oldDeviceId = users[index].deviceId;

      // Update user
      users[index] = {
        id: currentUserId,
        code,
        name,
        department,
        deviceId: deviceId ? parseInt(deviceId) : null,
        assignDate,
      };

      // Update old device if changed
      if (oldDeviceId && oldDeviceId !== parseInt(deviceId)) {
        const oldDeviceIndex = devices.findIndex((d) => d.id === oldDeviceId);
        if (oldDeviceIndex !== -1) {
          devices[oldDeviceIndex].userId = null;
          devices[oldDeviceIndex].status = "inactive";
        }
      }

      // Update new device if assigned
      if (deviceId) {
        const newDeviceIndex = devices.findIndex(
          (d) => d.id === parseInt(deviceId)
        );
        if (newDeviceIndex !== -1) {
          devices[newDeviceIndex].userId = currentUserId;
          devices[newDeviceIndex].status = "active";
        }
      }
    }
  } else {
    // Add new user
    const newId =
      users.length > 0 ? Math.max(...users.map((u) => u.id)) + 1 : 1;
    users.push({
      id: newId,
      code,
      name,
      department,
      deviceId: deviceId ? parseInt(deviceId) : null,
      assignDate,
    });

    // Update device if assigned
    if (deviceId) {
      const deviceIndex = devices.findIndex((d) => d.id === parseInt(deviceId));
      if (deviceIndex !== -1) {
        devices[deviceIndex].userId = newId;
        devices[deviceIndex].status = "active";
      }
    }
  }

  loadDevices();
  loadUsers();
  updateStats();
  userModal.style.display = "none";
}

// Delete Confirmation
function confirmDelete(type, id) {
  deleteType = type;
  deleteId = parseInt(id);

  if (type === "device") {
    const device = devices.find((d) => d.id === deleteId);
    deleteMessage.textContent = `Bạn có chắc chắn muốn xóa thiết bị ${device.name} (${device.code})?`;
  } else {
    const user = users.find((u) => u.id === deleteId);
    deleteMessage.textContent = `Bạn có chắc chắn muốn xóa người dùng ${user.name} (${user.code})?`;
  }

  deleteModal.style.display = "flex";
}

function deleteItem() {
  if (deleteType === "device") {
    // Check if device is assigned to any user
    const assignedUser = users.find((u) => u.deviceId === deleteId);
    if (assignedUser) {
      alert("Không thể xóa thiết bị đang được sử dụng!");
      deleteModal.style.display = "none";
      return;
    }

    // Remove device
    devices = devices.filter((d) => d.id !== deleteId);
  } else {
    // Check if user has any device assigned
    const user = users.find((u) => u.id === deleteId);
    if (user && user.deviceId) {
      // Free the device
      const deviceIndex = devices.findIndex((d) => d.id === user.deviceId);
      if (deviceIndex !== -1) {
        devices[deviceIndex].userId = null;
        devices[deviceIndex].status = "inactive";
      }
    }

    // Remove user
    users = users.filter((u) => u.id !== deleteId);
  }

  loadDevices();
  loadUsers();
  updateStats();
  deleteModal.style.display = "none";
}

// Helper Functions
function getStatusText(status) {
  switch (status) {
    case "active":
      return "Đang sử dụng";
    case "maintenance":
      return "Bảo Hành";
    case "inactive":
      return "Sẵn sàng";
    default:
      return "Không xác định";
  }
}

function getStatusClass(status) {
  switch (status) {
    case "active":
      return "status-active";
    case "maintenance":
      return "status-maintenance";
    case "inactive":
      return "status-inactive";
    default:
      return "";
  }
}

function formatDate(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Event Listeners
loginBtn.addEventListener("click", function () {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;

  if (username && password) {
    loginPage.style.display = "none";
    appContainer.style.display = "block";
    initApp();
  } else {
    alert("Vui lòng nhập tài khoản và mật khẩu!");
  }
});

logoutBtn.addEventListener("click", function () {
  appContainer.style.display = "none";
  loginPage.style.display = "flex";
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
});

// Menu Navigation
menuItems.forEach((item) => {
  item.addEventListener("click", function (e) {
    e.preventDefault();

    // Remove active class from all menu items
    menuItems.forEach((i) => i.classList.remove("active"));

    // Add active class to clicked item
    this.classList.add("active");

    // Hide all content sections
    contentSections.forEach((section) => {
      section.style.display = "none";
    });

    // Show the selected section
    const sectionId = this.getAttribute("data-section") + "Section";
    document.getElementById(sectionId).style.display = "block";

    // Update charts when switching to chart section
    if (sectionId === "chartSection") {
      monthlyChart.update();
      yearlyChart.update();
    }
  });
});

// Device Modal Events
addDeviceBtn.addEventListener("click", addDevice);
closeDeviceModal.addEventListener(
  "click",
  () => (deviceModal.style.display = "none")
);
cancelDeviceBtn.addEventListener(
  "click",
  () => (deviceModal.style.display = "none")
);
saveDeviceBtn.addEventListener("click", saveDevice);

// User Modal Events
addUserBtn.addEventListener("click", addUser);
closeUserModal.addEventListener(
  "click",
  () => (userModal.style.display = "none")
);
cancelUserBtn.addEventListener(
  "click",
  () => (userModal.style.display = "none")
);
saveUserBtn.addEventListener("click", saveUser);

// Delete Modal Events
closeDeleteModal.addEventListener(
  "click",
  () => (deleteModal.style.display = "none")
);
cancelDeleteBtn.addEventListener(
  "click",
  () => (deleteModal.style.display = "none")
);
confirmDeleteBtn.addEventListener("click", deleteItem);

// Close modals when clicking outside
window.addEventListener("click", (e) => {
  if (e.target === deviceModal) deviceModal.style.display = "none";
  if (e.target === userModal) userModal.style.display = "none";
  if (e.target === deleteModal) deleteModal.style.display = "none";
});
