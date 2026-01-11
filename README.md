# Giám Sát Rung Chấn Vật Lý - Webapp với ESP32

Dự án webapp giám sát rung chấn vật lý kết nối với thiết bị đo ESP32 qua Web Bluetooth (BLE).

## Tính năng

### 🎨 UI/UX Hiện Đại
- Thiết kế dark theme với gradient và animations
- Responsive design cho mobile và desktop
- Real-time data visualization với Chart.js
- Interactive map với Leaflet (dark theme)

### 📡 Kết nối Bluetooth
- Web Bluetooth API integration
- Tự động kết nối và xử lý ngắt kết nối
- Gửi/nhận dữ liệu theo thời gian thực
- Log chi tiết quá trình kết nối

### 📊 Giám sát dữ liệu
- **Gia tốc (g)**: Hiển thị real-time trên biểu đồ
- **Cường độ Richter**: Tính toán và hiển thị
- **Vị trí thiết bị**: GPS coordinates trên bản đồ
- **Tần số mẫu**: Sample rate từ thiết bị
- **Trạng thái pin**: Battery level (nếu có)

### 🚨 Hệ thống cảnh báo
- Ngưỡng cảnh báo tùy chỉnh
- Visual alerts với banner động
- Audio alerts (qua ESP32 buzzer)
- Status indicator real-time

### 🗺️ Bản đồ
- Hiển thị vị trí thiết bị
- History trail (đường đi của thiết bị)
- Tự động center và zoom
- Custom markers

### 💾 Data Logging & Export
- Lưu trữ dữ liệu real-time
- Export CSV để phân tích
- Event log với timestamp

### ⚙️ Settings
- Tùy chỉnh ngưỡng cảnh báo
- Tần số cập nhật
- Bật/tắt history trail
- Settings được lưu trong localStorage

## Cấu trúc dự án

```
richter/
├── richter.html              # File HTML chính
├── styles.css                # CSS với design system
├── components/
│   ├── header.html           # Header component
│   ├── content.html          # Main content/dashboard
│   ├── footer.html           # Footer component
│   └── scripts.js            # JavaScript chính
└── esp32/
    ├── richter_w_LCD_buzzer.ino    # Code ESP32 cũ (Serial)
    └── richter_w_BLE.ino            # Code ESP32 mới (BLE)
```

## Cài đặt

### Webapp

⚠️ **QUAN TRỌNG**: Bạn **PHẢI** chạy qua HTTP server, không thể mở file trực tiếp (double-click) vì CORS policy!

1. Clone repository hoặc download files
2. Chạy HTTP server (chọn một trong các cách):
   ```bash
   cd richter
   
   # Cách 1: Sử dụng script (khuyên dùng)
   ./server.sh
   
   # Cách 2: Python 3
   python3 -m http.server 8000
   
   # Cách 3: Node.js
   npx http-server -p 8000
   
   # Cách 4: PHP
   php -S localhost:8000
   ```
3. Mở trình duyệt hỗ trợ Web Bluetooth:
   - **Desktop**: Chrome, Edge, Opera
   - **Mobile**: Chrome (Android), Edge (iOS 13+)
4. Truy cập: `http://localhost:8000/richter.html`

> 📖 Xem thêm chi tiết trong [START_SERVER.md](richter/START_SERVER.md) nếu gặp lỗi "Lỗi tải thành phần"

### ESP32

1. Cài đặt Arduino IDE hoặc PlatformIO
2. Cài đặt ESP32 board support:
   - Board: ESP32 Dev Module
   - Library: BLE (built-in)
3. Mở `esp32/richter_w_BLE.ino`
4. Cấu hình:
   - Đổi `deviceLat` và `deviceLon` nếu có GPS
   - Đổi `DEVICE_NAME` nếu muốn
   - Đổi `ALERT_THRESHOLD` nếu cần
5. Upload code lên ESP32
6. Kết nối sensor vào pin 35 (ADC)
7. Kết nối buzzer vào pin 25

## Sử dụng

### Kết nối Bluetooth

1. Bấm nút **"Kết nối Bluetooth"** trên webapp
2. Chọn thiết bị **"ESP32-Richter"** (hoặc tên bạn đã đặt)
3. Đợi kết nối thành công
4. Dữ liệu sẽ tự động hiển thị

### Đọc dữ liệu

- **Gia tốc**: Hiển thị trên card và biểu đồ
- **Vị trí**: Xem trên bản đồ
- **Status**: Badge màu xanh = Online, đỏ = Offline
- **Events**: Xem log ở panel bên trái

### Cài đặt

1. Bấm nút **"Cài đặt"** để mở panel
2. Điều chỉnh:
   - **Ngưỡng cảnh báo**: Khi nào trigger alert (mặc định 2.0g)
   - **Tần số cập nhật**: Khoảng thời gian giữa các update
   - **Hiển thị trail**: Bật/tắt đường đi trên bản đồ

### Xuất dữ liệu

1. Bấm nút **"Xuất dữ liệu"**
2. File CSV sẽ được download
3. Mở bằng Excel hoặc Google Sheets để phân tích

## Format dữ liệu

### ESP32 → Webapp (JSON)

```json
{
  "acc": 0.123,
  "lat": 21.02780,
  "lon": 105.83420,
  "sr": 10,
  "batt": 100
}
```

- `acc`: Gia tốc (g)
- `lat`: Vĩ độ
- `lon`: Kinh độ
- `sr`: Sample rate (Hz)
- `batt`: Battery level (%)

### Webapp → ESP32 (Commands)

- `PING`: Test connection (trả về `{"status":"pong"}`)
- `GET_STATUS`: Lấy status hiện tại

## Troubleshooting

### Không kết nối được Bluetooth

- Đảm bảo ESP32 đã được flash code BLE
- Kiểm tra ESP32 đang advertising (LED blink)
- Thử reset ESP32
- Kiểm tra browser support (Chrome/Edge)
- Đảm bảo HTTPS hoặc localhost (Web Bluetooth yêu cầu)

### Dữ liệu không hiển thị

- Kiểm tra log ở panel Bluetooth
- Kiểm tra format JSON từ ESP32
- Xem console browser (F12)

### Map không hiển thị

- Kiểm tra kết nối internet (cần load tiles)
- Xem console để check lỗi Leaflet

## Tương lai

- [ ] Thêm GPS module thật vào ESP32
- [ ] Multi-device support
- [ ] Data sync với cloud
- [ ] Notification/Push alerts
- [ ] Advanced analytics
- [ ] Mobile app (React Native)

## Tác giả

Nhóm 1 - Dự án giám sát động đất

## License

MIT License
