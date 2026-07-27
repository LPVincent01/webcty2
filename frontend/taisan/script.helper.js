// Cache để lưu map đảo ngược (Value -> Key) của tiếng Việt
let viValueToKeyMap = null;

/**
 * Dịch một giá trị dữ liệu (ví dụ: "Tổ Cắt") sang ngôn ngữ hiện tại.
 * Nó hoạt động bằng cách tìm key dịch thuật tương ứng với giá trị tiếng Việt,
 * sau đó sử dụng key đó để lấy bản dịch.
 *
 * @param {string} valueToTranslate - Giá trị cần dịch (mặc định là tiếng Việt).
 * @returns {string} - Giá trị đã dịch hoặc giá trị gốc nếu không tìm thấy bản dịch.
 */
function translateValue(valueToTranslate) {
  if (!valueToTranslate) {
    return "";
  }

  const currentLang = getCurrentLanguage(); // Giả sử bạn có hàm này để lấy ngôn ngữ hiện tại (vi, zh)
  const viTranslations = translations.vi;
  const targetTranslations = translations[currentLang];

  if (!targetTranslations || currentLang === "vi") {
    return valueToTranslate; // Trả về giá trị gốc nếu không có bản dịch hoặc đang ở tiếng Việt
  }

  // Khởi tạo cache nếu chưa có
  if (!viValueToKeyMap) {
    viValueToKeyMap = new Map();
    Object.keys(viTranslations).forEach((key) => {
      viValueToKeyMap.set(viTranslations[key], key);
    });
  }

  // Tìm key dịch thuật dựa trên giá trị tiếng Việt (O(1))
  const translationKey = viValueToKeyMap.get(valueToTranslate);

  if (translationKey && targetTranslations[translationKey]) {
    return targetTranslations[translationKey]; // Trả về bản dịch
  }

  return valueToTranslate; // Trả về giá trị gốc nếu không tìm thấy key
}

/**
 * Ví dụ cách áp dụng hàm translateValue vào việc render bảng.
 * Bạn cần cập nhật các hàm render table tương ứng trong file script.js của bạn.
 */

/*
// TRONG HÀM renderDevicesTable(devices) của bạn:

const tableBody = devices
  .map((device) => {
    // ... các phần khác của row
    const translatedDeviceType = translateValue(device.LoaiTaiSan); // Dịch giá trị
    return `
      <tr>
        ...
        <td>${translatedDeviceType}</td>
        ...
      </tr>
    `;
  })
  .join("");
devicesTableBody.innerHTML = tableBody;

// TRONG HÀM renderUsersTable(users) của bạn:

const tableBody = users
  .map((user) => {
    // ... các phần khác của row
    const translatedDepartment = translateValue(user.Phongban); // Dịch giá trị
    return `
      <tr>
        ...
        <td>${translatedDepartment}</td>
        ...
      </tr>
    `;
  })
  .join("");
usersTableBody.innerHTML = tableBody;
*/
