# Troubleshooting - Không thể truy cập từ máy khác

## Vấn đề: Không thể truy cập từ máy khác mặc dù đã host

### Bước 1: Kiểm tra server có đang chạy không

```bash
# Kiểm tra port 8000
lsof -i :8000
# hoặc
netstat -tuln | grep :8000
# hoặc
ss -tuln | grep :8000
```

Nếu không có output, server chưa chạy. Chạy:
```bash
cd richter
./server.sh
```

### Bước 2: Kiểm tra server có bind đúng không

Server PHẢI bind vào `0.0.0.0`, không phải `localhost` hoặc `127.0.0.1`.

Kiểm tra:
```bash
netstat -tuln | grep :8000
```

Output đúng phải là:
```
tcp  0  0  0.0.0.0:8000  0.0.0.0:*  LISTEN
```

Nếu thấy `127.0.0.1:8000` hoặc `localhost:8000`, server đang chỉ chấp nhận kết nối từ local.

**Giải pháp:** Dừng server (Ctrl+C) và chạy lại:
```bash
cd richter
./server.sh
```

Hoặc nếu dùng Python trực tiếp:
```bash
python3 -m http.server 8000 --bind 0.0.0.0
```

### Bước 3: Kiểm tra IP address

Lấy IP address của máy chủ:
```bash
hostname -I
# hoặc
ip addr show | grep "inet " | grep -v "127.0.0.1"
```

Từ máy khác, thử ping IP này:
```bash
ping <IP_ADDRESS>
```

Nếu ping không được, có thể:
- Không cùng mạng LAN
- Firewall hoặc router block ICMP

### Bước 4: Kiểm tra firewall

Ngay cả khi firewall inactive, kiểm tra lại:
```bash
sudo ufw status
```

Nếu active, mở port:
```bash
sudo ufw allow 8000/tcp
```

Hoặc tạm thời disable để test:
```bash
sudo ufw disable
```

### Bước 5: Kiểm tra từ máy chủ

Từ máy chủ, thử truy cập bằng IP thay vì localhost:
```bash
curl http://<IP_ADDRESS>:8000/richter.html
```

Nếu không được, có thể server không bind đúng.

### Bước 6: Kiểm tra từ máy client

Từ máy client:
1. Thử ping IP của máy chủ
2. Thử telnet vào port 8000:
   ```bash
   telnet <IP_ADDRESS> 8000
   ```
   Nếu kết nối được, sẽ thấy message từ server.
   
3. Thử curl:
   ```bash
   curl http://<IP_ADDRESS>:8000/richter.html
   ```

### Bước 7: Kiểm tra network

Đảm bảo:
- Cả 2 máy cùng mạng LAN (cùng WiFi hoặc cùng switch)
- Không có VPN hoặc network isolation
- Router không block inter-device communication

### Bước 8: Thử port khác

Nếu vẫn không được, thử port khác:
```bash
./server.sh 8080
```

Và truy cập: `http://<IP>:8080/richter.html`

### Debug commands

Tất cả các lệnh debug:

```bash
# 1. Kiểm tra server đang chạy
ps aux | grep "[p]ython.*http.server"

# 2. Kiểm tra port binding
netstat -tuln | grep :8000
# Phải thấy 0.0.0.0:8000, không phải 127.0.0.1:8000

# 3. Lấy IP address
hostname -I

# 4. Test từ localhost
curl http://localhost:8000/richter.html

# 5. Test từ IP
curl http://$(hostname -I | awk '{print $1}'):8000/richter.html

# 6. Kill process cũ và restart
pkill -f "python.*http.server"
cd richter
./server.sh
```

### Giải pháp nhanh

1. **Kill tất cả server cũ:**
   ```bash
   pkill -f "python.*http.server"
   ```

2. **Chạy lại server:**
   ```bash
   cd richter
   ./server.sh
   ```

3. **Copy IP address hiển thị và truy cập từ máy khác**

4. **Nếu vẫn không được, kiểm tra firewall:**
   ```bash
   sudo ufw allow 8000/tcp
   sudo ufw status
   ```


