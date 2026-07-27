// File này chứa các bộ từ vựng dùng riêng để dịch tự động các dòng thông số/cấu hình (CauHinh) của thiết bị.
// Mục đích: Tách biệt cấu hình riêng, dễ nhìn, dễ bảo trì và thêm mới.

const specsDictionary = {
  zh: {
    // Thuộc tính (Bên trái dấu hai chấm)
    "Nguồn điện sử dụng": "使用电源",
    "Kích thước mặt bàn chính": "主台面尺寸",
    "Trọng lượng máy": "机器重量",
    "Kết nối ngoại vi": "外围连接",
    "Ổ cứng": "硬盘",
    "Ổ Cứng": "硬盘",
    "Màn hình": "屏幕",
    "Màn hình hiển thị": "显示器",
    "Độ phân giải": "分辨率",
    "Độ phân giải (DPI)": "分辨率 (DPI)",
    "Công nghệ tấm nền": "面板技术",
    "Tần số quét (Refresh Rate)": "刷新率",
    "Thời gian phản hồi": "响应时间",
    "Độ sáng & Màu sắc": "亮度与颜色",
    "Cổng tín hiệu": "信号接口",
    "Loa tích hợp": "内置扬声器",
    "Số lượng nút bấm": "按键数量",
    "Loại cảm biến": "传感器类型",
    "Cổng kết nối": "连接端口",
    "Chiều dài dây kết nối": "连接线长度",
    "Tần số phản hồi": "回报率",
    "CPU": "处理器",
    "Ram": "内存",
    "Lisence OS": "操作系统授权",
    "Trọng lượng": "重量",
    "Kích thước": "尺寸",
    "Bảo hành": "保修期",
    
    // Giá trị (Bên phải dấu hai chấm, hoặc đoạn text tự do)
    "bàn ủi hơi nước": "蒸汽熨斗",
    "kg đến": "kg 至",
    "WARNING": "警告",
    "NO": "无"
  },
  en: {
    "Nguồn điện sử dụng": "Power Supply",
    "Kích thước mặt bàn chính": "Main Table Size",
    "Trọng lượng máy": "Machine Weight",
    "Kết nối ngoại vi": "Peripheral Connection",
    "Ổ cứng": "Hard Drive",
    "Ổ Cứng": "Hard Drive",
    "Màn hình": "Screen",
    "Màn hình hiển thị": "Display Screen",
    "Độ phân giải": "Resolution",
    "Độ phân giải (DPI)": "Resolution (DPI)",
    "Công nghệ tấm nền": "Panel Technology",
    "Tần số quét (Refresh Rate)": "Refresh Rate",
    "Thời gian phản hồi": "Response Time",
    "Độ sáng & Màu sắc": "Brightness & Color",
    "Cổng tín hiệu": "Signal Ports",
    "Loa tích hợp": "Built-in Speaker",
    "Số lượng nút bấm": "Number of Buttons",
    "Loại cảm biến": "Sensor Type",
    "Cổng kết nối": "Connection Port",
    "Chiều dài dây kết nối": "Cable Length",
    "Tần số phản hồi": "Polling Rate",
    "CPU": "CPU",
    "Ram": "RAM",
    "Lisence OS": "OS License",
    "Trọng lượng": "Weight",
    "Kích thước": "Dimensions",
    "Bảo hành": "Warranty",
    
    "bàn ủi hơi nước": "Steam Iron",
    "kg đến": "kg to",
    "WARNING": "WARNING",
    "NO": "NO"
  }
};

/**
 * Hàm dịch tự động 1 dòng cấu hình.
 * @param {string} line - Dòng cấu hình gốc (VD: "Nguồn điện sử dụng: 220V")
 * @param {string} targetLang - Ngôn ngữ đích ("zh", "en", "vi")
 * @returns {string} - Dòng cấu hình đã được dịch
 */
function translateSpecLine(line, targetLang) {
  // Tiếng Việt là ngôn ngữ gốc trong DB, không cần dịch
  if (targetLang === 'vi' || !specsDictionary[targetLang]) {
    return line;
  }

  const dict = specsDictionary[targetLang];
  let resultLine = line;

  // 1. Phân tách theo dấu ":" để dịch chính xác Tên thuộc tính (Key)
  const colonIndex = resultLine.indexOf(':');
  if (colonIndex !== -1) {
    const key = resultLine.substring(0, colonIndex).trim();
    const value = resultLine.substring(colonIndex + 1).trim();
    
    // Dịch Key nếu có trong từ điển
    const translatedKey = dict[key] || key;
    
    // Gắn lại
    resultLine = `${translatedKey}: ${value}`;
  }

  // 2. Thay thế các cụm từ thông dụng bên trong chuỗi (ví dụ: "bàn ủi hơi nước")
  // Quét toàn bộ từ điển để replace (Lưu ý: cách này đơn giản nhưng hiệu quả với các từ nhỏ)
  for (const [vietnameseWord, translatedWord] of Object.entries(dict)) {
    // Tránh việc replace lại chính Key đã dịch ở trên (chỉ replace trong phần Value nếu cần, 
    // nhưng để đơn giản ta cứ replaceAll nguyên dòng)
    if (resultLine.includes(vietnameseWord)) {
      resultLine = resultLine.split(vietnameseWord).join(translatedWord);
    }
  }

  return resultLine;
}
