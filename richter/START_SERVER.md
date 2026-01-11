# Cách Chạy Webapp

## Vấn đề: Lỗi tải component

Nếu bạn gặp lỗi "Lỗi tải thành phần: components/header.html", đây là do **CORS policy** của trình duyệt. 

Khi mở file HTML trực tiếp (double-click hoặc `file://`), trình duyệt không cho phép JavaScript tải các file local khác vì lý do bảo mật.

## Giải pháp: Chạy qua HTTP Server

### Cách 1: Sử dụng Python (Khuyên dùng)

```bash
cd richter
python3 -m http.server 8000
```

Sau đó mở trình duyệt và truy cập:
```
http://localhost:8000/richter.html
```

### Cách 2: Sử dụng script đã tạo

```bash
cd richter
./server.sh
```

Hoặc chỉ định port khác:
```bash
./server.sh 8080
```

### Cách 3: Sử dụng Node.js (nếu có)

```bash
cd richter
npx http-server -p 8000
```

### Cách 4: Sử dụng PHP (nếu có)

```bash
cd richter
php -S localhost:8000
```

## Lưu ý

- **Phải chạy qua HTTP server** để webapp hoạt động đúng
- Port mặc định là 8000, có thể đổi sang port khác
- Dừng server bằng `Ctrl+C`
- Đảm bảo đang ở thư mục `richter` khi chạy server

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

**Giải pháp 3:** Script sẽ tự động tìm port trống (nếu có thể)
```bash
./server.sh
```
Script sẽ tự động tìm port trống nếu port 8000 đã được sử dụng.

## Kiểm tra

Sau khi chạy server, bạn sẽ thấy:
- Không còn lỗi "Lỗi tải thành phần"
- Các component (header, content, footer) được load đúng
- Webapp hiển thị đầy đủ giao diện

