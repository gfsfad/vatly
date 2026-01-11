const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_TX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // notify from device -> app
const NUS_RX_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // write from app -> device

let bluetoothDevice = null;
let nusService = null;
let txCharacteristic = null; // notify
let rxCharacteristic = null; // write

async function loadComponent(id, path) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error('Không tải được ' + path);
    const html = await res.text();
    document.getElementById(id).innerHTML = html;
  } catch (err) {
    console.error(err);
    document.getElementById(id).innerHTML = '<div style="padding:20px;color:#fff;">Lỗi tải thành phần: '+path+'</div>';
  }
}

// ensure dashboard initializes after components are loaded
document.addEventListener('DOMContentLoaded', async function(){
  // Load header, content, footer components, then initialize dashboard
  try {
    await Promise.all([
      loadComponent('header', 'components/header.html'),
      loadComponent('content', 'components/content.html'),
      loadComponent('footer', 'components/footer.html')
    ]);
  } catch (e) {
    console.error('Lỗi khi tải components:', e);
  }

  // allow a short time for DOM insertion then initialize
  setTimeout(initDashboard, 200);
});

// Dashboard / Chart.js setup
let vibrationChart = null;
let chartData = { labels: [], datasets: [{ label: 'Acceleration', data: [], borderColor: '#ff6b6b', backgroundColor: 'rgba(255,107,107,0.15)', tension: 0.25 }] };
// Map (Leaflet)
let deviceMap = null;
let deviceMarker = null;

function initDashboard(){
  const ctx = document.getElementById('vibrationChart');
  if (!ctx) return;
  vibrationChart = new Chart(ctx, {
    type: 'line',
    data: chartData,
    options: {
      animation:false,
      scales: { x: { display:true }, y: { beginAtZero:true } },
      plugins: { legend: { display:false } }
    }
  });

  // initialize map (if present)
  try { initMap(); } catch(e){ console.warn('Map init failed:', e); }

  // also pipe logs to event-log textarea
}

function initMap(){
  const el = document.getElementById('deviceMap');
  if(!el) return;
  // create map only once
  if(deviceMap) return;
  deviceMap = L.map('deviceMap', { zoomControl:true }).setView([21.0278,105.8342], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(deviceMap);
  deviceMarker = L.marker([21.0278,105.8342]).addTo(deviceMap).bindPopup('Vị trí thiết bị');
}

function updateDeviceLocation(lat, lon){
  if(!deviceMap) initMap();
  if(!deviceMap) return;
  if(!deviceMarker) deviceMarker = L.marker([lat,lon]).addTo(deviceMap).bindPopup('Vị trí thiết bị');
  else deviceMarker.setLatLng([lat,lon]);
  deviceMarker.bindPopup(`Thiết bị: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
  deviceMap.flyTo([lat,lon], 14, { animate:true, duration: 1.0 });
  appendEvent('Vị trí thiết bị cập nhật: ' + lat.toFixed(5) + ', ' + lon.toFixed(5));
  // update UI fields if present
  const latEl = document.getElementById('device-lat'); if(latEl) latEl.textContent = lat.toFixed(5);
  const lonEl = document.getElementById('device-lon'); if(lonEl) lonEl.textContent = lon.toFixed(5);
  const lastEl = document.getElementById('device-last'); if(lastEl) lastEl.textContent = new Date().toLocaleString();
}

function addChartPoint(value){
  const t = new Date();
  const label = t.toLocaleTimeString();
  chartData.labels.push(label);
  chartData.datasets[0].data.push(value);
  if (chartData.labels.length > 60){ chartData.labels.shift(); chartData.datasets[0].data.shift(); }
  if (vibrationChart) vibrationChart.update('none');
  // update small card
  const el = document.getElementById('card-acc'); if (el) el.textContent = value.toFixed(3);
}

function appendEvent(msg){
  const el = document.getElementById('event-log');
  if(!el) return;
  el.value = (el.value?el.value+'\n':'') + '[' + new Date().toLocaleTimeString() + '] ' + msg;
  el.scrollTop = el.scrollHeight;
}

function appendToLog(msg) {
  const log = document.getElementById('ble-log');
  if (!log) return;
  log.value = (log.value ? log.value + '\n' : '') + msg;
  log.scrollTop = log.scrollHeight;
}

function updateStatus(text) {
  const el = document.getElementById('ble-status');
  if (el) el.textContent = text;
}

async function connectBluetooth() {
  if (!navigator.bluetooth) {
    alert('Trình duyệt không hỗ trợ Web Bluetooth API. Dùng Chrome/Edge trên desktop hoặc Chrome trên Android.');
    return;
  }

  try {
    updateStatus('Đang tìm thiết bị...');
    // Yêu cầu thiết bị ESP32 có tên bắt đầu 'ESP32' (thay đổi nếu cần)
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'ESP32' }],
      optionalServices: [NUS_SERVICE_UUID]
    });

    bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);
    updateStatus('Kết nối tới ' + (bluetoothDevice.name || 'thiết bị') + '...');

    const server = await bluetoothDevice.gatt.connect();
    nusService = await server.getPrimaryService(NUS_SERVICE_UUID);

    txCharacteristic = await nusService.getCharacteristic(NUS_TX_CHAR_UUID);
    rxCharacteristic = await nusService.getCharacteristic(NUS_RX_CHAR_UUID);

    await txCharacteristic.startNotifications();
    txCharacteristic.addEventListener('characteristicvaluechanged', handleNotifications);

    updateStatus('Đã kết nối: ' + (bluetoothDevice.name || 'ESP'));
    appendToLog('CONNECTED: ' + (bluetoothDevice.name || 'ESP'));
    const nameEl = document.getElementById('device-name'); if(nameEl) nameEl.textContent = bluetoothDevice.name || 'ESP';
    const card = document.getElementById('card-status'); if(card) card.textContent = 'Đã kết nối';
    const statusBadge = document.getElementById('device-status'); if(statusBadge){ statusBadge.textContent='Online'; statusBadge.classList.remove('off'); }
    // init dashboard after components loaded
    setTimeout(initDashboard, 200);
  } catch (err) {
    console.error(err);
    updateStatus('Lỗi kết nối');
    appendToLog('ERROR: ' + (err.message || err));
    alert('Lỗi kết nối Bluetooth: ' + (err.message || err));
  }
}

function onDisconnected(event) {
  appendToLog('Thiết bị đã ngắt kết nối');
  updateStatus('Đã ngắt kết nối');
  const statusBadge = document.getElementById('device-status'); if(statusBadge){ statusBadge.textContent='Offline'; statusBadge.classList.add('off'); }
}

function handleNotifications(event) {
  const value = event.target.value;
  // decode UTF-8 string
  const decoder = new TextDecoder('utf-8');
  const text = decoder.decode(value);
  appendToLog('RX ← ' + text);
  appendEvent('RX ← ' + text);

  // Try parse JSON payload first (e.g., {"lat":...,"lon":...,"acc":...})
  try {
    const obj = JSON.parse(text);
    if (obj) {
      if (obj.lat && obj.lon) updateDeviceLocation(parseFloat(obj.lat), parseFloat(obj.lon));
      if (obj.acc) { const n = parseFloat(obj.acc); if(!isNaN(n)) addChartPoint(n); }
      if (obj.sr) { const el = document.getElementById('card-sr'); if(el) el.textContent = obj.sr; }
      return;
    }
  } catch(e){ /* not JSON */ }

  // Try parse coordinate pair like "lat,lon"
  const coord = text.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
  if(coord){
    const lat = parseFloat(coord[1]);
    const lon = parseFloat(coord[2]);
    if(!isNaN(lat) && !isNaN(lon)) updateDeviceLocation(lat, lon);
  }

  // Try parse numeric acceleration value (examples supported: "0.123", "ACC:0.123", "A=0.123")
  const m = text.match(/(-?\d+\.?\d*)/);
  if (m){
    const num = parseFloat(m[1]);
    if (!isNaN(num)) addChartPoint(num);
  }
}

async function sendToDevice() {
  const input = document.getElementById('ble-input');
  if (!input) return;
  const text = input.value || '';
  if (!rxCharacteristic) {
    alert('Chưa có kết nối BLE. Bấm "Kết nối Bluetooth" trước.');
    return;
  }
  try {
    const data = new TextEncoder().encode(text + '\n');
    await rxCharacteristic.writeValue(data);
    appendToLog('TX → ' + text);
    input.value = '';
  } catch (err) {
    console.error(err);
    appendToLog('GỬI LỖI: ' + (err.message || err));
    alert('Không gửi được: ' + (err.message || err));
  }
}

function disconnectBluetooth() {
  if (!bluetoothDevice) return;
  if (bluetoothDevice.gatt && bluetoothDevice.gatt.connected) {
    bluetoothDevice.gatt.disconnect();
    appendToLog('Ngắt kết nối thủ công');
    updateStatus('Đã ngắt kết nối');
    const nameEl = document.getElementById('device-name'); if(nameEl) nameEl.textContent = '(chưa có thiết bị)';
    const card = document.getElementById('card-status'); if(card) card.textContent = 'Chưa kết nối';
  }
}

function getLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(showPosition, showError);
  } else {
    alert("Trình duyệt của bạn không hỗ trợ định vị GPS.");
  }
}
function showPosition(position) {
  var lat = position.coords.latitude;
  var lon = position.coords.longitude;
  alert("Vị trí hiện tại của bạn:\nVĩ độ: " + lat.toFixed(4) + "\nKinh độ: " + lon.toFixed(4) + "\n\nBấm 'Chỉ đường thoát hiểm' để xem đường đi đến nơi trú ẩn gần nhất!");
  window.open("https://www.google.com/maps?q=" + lat + "," + lon, "_blank");
}
function showError(error) {
  switch(error.code) {
    case error.PERMISSION_DENIED:
      alert("Bạn đã từ chối chia sẻ vị trí.");
      break;
    case error.POSITION_UNAVAILABLE:
      alert("Không thể lấy thông tin vị trí.");
      break;
    case error.TIMEOUT:
      alert("Yêu cầu định vị hết thời gian.");
      break;
    case error.UNKNOWN_ERROR:
      alert("Lỗi không xác định.");
      break;
  }
}
function showDirectionsMap() {
  if (!navigator.geolocation) {
    alert("Trình duyệt không hỗ trợ định vị. Hãy mở Google Maps thủ công và tìm 'nơi trú ẩn động đất gần tôi'.");
    window.open("https://www.google.com/maps/search/nơi+trú+ẩn+động+đất+gần+tôi", "_blank");
    return;
  }
  navigator.geolocation.getCurrentPosition(function(position) {
    var lat = position.coords.latitude;
    var lon = position.coords.longitude;
    var directionsUrl = "https://www.google.com/maps/dir/" + lat + "," + lon + "/nơi+trú+ẩn+động+đất+gần+tôi/@" + lat + "," + lon + ",14z/data=!3m1!4b1!4m2!4m1!3e0";
    var win = window.open('', '_blank', 'width=1000,height=700,resizable=yes');
    win.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Chỉ đường đến nơi trú ẩn an toàn</title>
        <style>
          body, html { margin:0; padding:0; height:100%; }
          iframe { width:100%; height:100%; border:none; }
        </style>
      </head>
      <body>
        <iframe src="${directionsUrl}"></iframe>
      </body>
      </html>
    `);
    win.document.close();
  }, function() {
    alert("Không lấy được vị trí. Hãy mở Google Maps và tìm 'nơi trú ẩn động đất gần tôi'.");
    window.open("https://www.google.com/maps/search/nơi+trú+ẩn+động+đất+gần+tôi", "_blank");
  });
}

// Mở hướng dẫn thoát hiểm
function openEscapeGuide() {
  var canvaUrl = "https://www.canva.com/design/DAG8aIzD1PY/_kruFygy91cJfloI8xMFSg/view";
  window.open(canvaUrl, '_blank');
}
