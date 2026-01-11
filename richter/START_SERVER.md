# Cách Chạy Webapp

## Vấn đề: Lỗi tải component

Nếu bạn gặp lỗi "Lỗi tải thành phần: components/header.html", đây là do **CORS policy** của trình duyệt. 

Khi mở file HTML trực tiếp (double-click hoặc `file://`), trình duyệt không cho phép JavaScript tải các file local khác vì lý do bảo mật.

## Giải pháp: Chạy qua HTTP Server

### Cách 1: Sử dụng script (Khuyên dùng - Hỗ trợ truy cập từ máy khác)

Script này tự động bind vào `0.0.0.0` để có thể truy cập từ máy khác trong mạng LAN:

```bash
cd richter
./server.sh
```

Hoặc chỉ định port khác:
```bash
./server.sh 8080
```

Script sẽ hiển thị:
- Địa chỉ local: `http://localhost:8000/richter.html`
- Địa chỉ network: `http://<IP>:8000/richter.html` (để truy cập từ máy khác)

### Cách 2: Sử dụng Python trực tiếp

**Chỉ truy cập từ máy local:**
```bash
cd richter
python3 -m http.server 8000
```

**Truy cập từ máy khác trong mạng LAN:**
```bash
cd richter
python3 -m http.server 8000 --bind 0.0.0.0
```

Sau đó mở trình duyệt và truy cập:
- **Từ máy local:** `http://localhost:8000/richter.html`
- **Từ máy khác:** `http://<IP_MÁY_CHỦ>:8000/richter.html`

### Cách 3: Sử dụng Node.js (nếu có)

```bash
cd richter
npx http-server -p 8000 -a 0.0.0.0
```

### Cách 4: Sử dụng PHP (nếu có)

```bash
cd richter
php -S 0.0.0.0:8000
```

## Truy cập từ máy khác trong mạng LAN

Sau khi chạy server với `--bind 0.0.0.0` hoặc dùng script `./server.sh`, bạn có thể truy cập từ máy khác:

1. **Tìm IP address của máy chủ:**
   ```bash
   hostname -I
   # Hoặc
   ip addr show | grep "inet " | grep -v "127.0.0.1"
   ```
   
   Script `./server.sh` sẽ tự động hiển thị IP address khi khởi động.

2. **Từ máy khác, mở trình duyệt và truy cập:**
   ```
   http://<IP_MÁY_CHỦ>:8000/richter.html
   ```
   Ví dụ: `http://192.168.1.100:8000/richter.html` hoặc `http://10.217.19.128:8000/richter.html`

3. **Lưu ý quan trọng:**
   - ✅ Đảm bảo cả 2 máy cùng mạng LAN (cùng WiFi hoặc cùng switch/router)
   - ✅ Kiểm tra firewall có chặn port 8000 không
   - ✅ Nếu không truy cập được, thử mở firewall:
     ```bash
     # Ubuntu/Debian
     sudo ufw allow 8000/tcp
     
     # CentOS/RHEL/Fedora
     sudo firewall-cmd --add-port=8000/tcp --permanent
     sudo firewall-cmd --reload
     
     # Hoặc tắt firewall tạm thời để test
     sudo ufw disable  # Ubuntu/Debian
     ```
   - ⚠️ **Bảo mật:** Server này chỉ dùng cho mạng LAN, không nên expose ra internet công cộng

## Lưu ý

- **Phải chạy qua HTTP server** để webapp hoạt động đúng
- Port mặc định là 8000, có thể đổi sang port khác
- Dừng server bằng `Ctrl+C`
- Đảm bảo đang ở thư mục `richter` khi chạy server
- **Web Bluetooth chỉ hoạt động trên HTTPS hoặc localhost**, nên khi truy cập từ máy khác qua IP, tính năng Bluetooth có thể không hoạt động (cần HTTPS)

## Xử lý lỗi "Address already in use"

Nếu gặp lỗi `OSError: [Errno 98] Address already in use`, có nghĩa là port 8000 đã được sử dụng:

**Giải pháp 1:** Dùng port khác
```bash
./server.sh 8080
```

**Giải pháp 2:** Kill process đang dùng port 8000
```bash
# Tìm process
lsof -ti:8000
# Hoặc
netstat -tuln | grep :8000

# Kill process (thay PID bằng số tìm được)
kill <PID>
```

## Kiểm tra

Sau khi chạy server, bạn sẽ thấy:
- Không còn lỗi "Lỗi tải thành phần"
- Các component (header, content, footer) được load đúng
- Webapp hiển thị đầy đủ giao diện
- Có thể truy cập từ máy khác trong mạng LAN (nếu dùng `--bind 0.0.0.0`)

## Lưu ý về Web Bluetooth

⚠️ **Quan trọng:** Web Bluetooth API chỉ hoạt động trên:
- `localhost` hoặc `127.0.0.1`
- HTTPS (https://)
- **KHÔNG hoạt động** trên HTTP với IP address (http://192.168.x.x)

Nếu bạn cần truy cập từ máy khác VÀ sử dụng Bluetooth:
1. Dùng HTTPS (cần SSL certificate)
2. Hoặc chỉ dùng Bluetooth từ máy chạy server (localhost)
3. Máy khác chỉ xem dữ liệu, không thể kết nối Bluetooth
