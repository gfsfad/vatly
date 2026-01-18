// ============================================
// Web BLE Configuration
// ============================================
const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_TX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // notify from device -> app
const NUS_RX_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // write from app -> device

// ============================================
// Global State
// ============================================
let bluetoothDevice = null;
let nusService = null;
let txCharacteristic = null;
let rxCharacteristic = null;

let vibrationChart = null;
let chartData = {
  labels: [],
  datasets: [{
    label: 'Biên độ',
    data: [],
    borderColor: '#6366f1',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderWidth: 2,
    tension: 0.4,
    fill: true
  }]
};

let deviceMap = null;
let deviceMarker = null;
let locationTrail = [];
let trailPolyline = null;

// Settings
let settings = {
  alertThreshold: 2.0,
  updateFrequency: 100,
  showTrail: true,
  maxDataPoints: 100
};

// Data logging
let dataLog = [];
let lastUpdateTime = Date.now();

// Current page
let currentPage = 'dashboard';

// Alert modal state
let earthquakeAlertShown = false;
let lastRichterValue = 0;

// ============================================
// Component Loading
// ============================================
async function loadComponent(id, path) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error('Không tải được ' + path);
    const html = await res.text();
    document.getElementById(id).innerHTML = html;
  } catch (err) {
    console.error(err);
    const isFileProtocol = window.location.protocol === 'file:';
    const errorMsg = isFileProtocol 
      ? `<div style="padding:20px;color:#ff6b6b;background:rgba(239,68,68,0.1);border-radius:8px;margin:10px;">
          <strong>⚠️ Lỗi tải thành phần: ${path}</strong><br><br>
          <strong>Nguyên nhân:</strong> File đang được mở trực tiếp (file://) không thể tải component.<br><br>
          <strong>Giải pháp:</strong> Chạy qua HTTP server:<br>
          <code style="background:rgba(0,0,0,0.3);padding:4px 8px;border-radius:4px;display:inline-block;margin-top:8px;">
            cd richter && python3 -m http.server 8000
          </code><br>
          Sau đó mở: <code style="background:rgba(0,0,0,0.3);padding:4px 8px;border-radius:4px;">http://localhost:8000/richter.html</code>
        </div>`
      : `<div style="padding:20px;color:#ff6b6b;">Lỗi tải thành phần: ${path}</div>`;
    document.getElementById(id).innerHTML = errorMsg;
  }
}

document.addEventListener('DOMContentLoaded', async function() {
  try {
    await Promise.all([
      loadComponent('header', 'components/header.html'),
      loadComponent('content', 'components/content.html'),
      loadComponent('footer', 'components/footer.html')
    ]);
    // Load pages after components are loaded
    setTimeout(() => {
      loadPages();
      showPage('dashboard');
    }, 100);
  } catch (e) {
    console.error('Lỗi khi tải components:', e);
  }
});

// ============================================
// Page Navigation
// ============================================
async function loadPages() {
  const contentEl = document.getElementById('content');
  if (!contentEl) return;
  
  try {
    // Load all pages
    const [dashboardHtml, settingsHtml, escapeHtml] = await Promise.all([
      fetch('components/pages/dashboard.html').then(r => r.text()),
      fetch('components/pages/settings.html').then(r => r.text()),
      fetch('components/pages/escape.html').then(r => r.text())
    ]);
    
    // Append all pages to content
    contentEl.innerHTML = dashboardHtml + settingsHtml + escapeHtml;
  } catch (e) {
    console.error('Lỗi khi tải pages:', e);
    contentEl.innerHTML = '<div style="padding:20px;color:#ff6b6b;">Lỗi tải pages: ' + e.message + '</div>';
  }
}

function showPage(pageName) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  
  // Show selected page
  const pageEl = document.getElementById(`page-${pageName}`);
  if (pageEl) {
    pageEl.classList.add('active');
  }
  
  // Update navigation buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    if (btn.dataset.page === pageName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  currentPage = pageName;
  
  // Initialize dashboard if needed
  if (pageName === 'dashboard') {
    setTimeout(() => {
      initDashboard();
    }, 100);
  }
  
  // Update settings status if on settings page
  if (pageName === 'settings') {
    setTimeout(updateSettingsStatus, 100);
  }
}

function updateSettingsStatus() {
  const statusEl = document.getElementById('device-status-settings');
  if (statusEl && bluetoothDevice && bluetoothDevice.gatt && bluetoothDevice.gatt.connected) {
    statusEl.textContent = 'Đã kết nối: ' + (bluetoothDevice.name || 'ESP32');
  } else if (statusEl) {
    statusEl.textContent = 'Chưa kết nối';
  }
}

// ============================================
// Dashboard Initialization
// ============================================
function initDashboard() {
  initChart();
  initMap();
  loadSettings();
  updateUI();
}

function initChart() {
  const ctx = document.getElementById('vibrationChart');
  if (!ctx) return;
  
  vibrationChart = new Chart(ctx, {
    type: 'line',
    data: chartData,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#6366f1',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          display: true,
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.7)',
            maxRotation: 45,
            minRotation: 0
          }
        },
        y: {
          display: true,
          beginAtZero: true,
          grid: {
            color: 'rgba(255, 255, 255, 0.1)'
          },
          ticks: {
            color: 'rgba(255, 255, 255, 0.7)'
          },
          title: {
            display: true,
            text: 'Biên độ',
            color: 'rgba(255, 255, 255, 0.7)'
          }
        }
      }
    }
  });
}

function initMap() {
  const el = document.getElementById('deviceMap');
  if (!el || deviceMap) return;
  
  // Check if element is visible and has dimensions
  const checkAndInit = () => {
    const container = document.getElementById('deviceMap');
    if (!container) return false;
    
    const rect = container.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return false; // Container not ready
    }
    
    // Initialize map centered on Hanoi, Vietnam
    deviceMap = L.map('deviceMap', {
      center: [21.0278, 105.8342],
      zoom: 13,
      zoomControl: true,
      attributionControl: true,
      minZoom: 3,
      maxZoom: 19,
      preferCanvas: false,
      worldCopyJump: false,
      crs: L.CRS.EPSG3857 // Ensure correct CRS
    });
    
    // Add satellite tile layer (Esri World Imagery) with correct format
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, Maxar, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, IGP, and the GIS User Community',
      maxZoom: 19,
      minZoom: 3,
      noWrap: false,
      updateWhenZooming: true,
      keepBuffer: 2,
      tileSize: 256,
      zoomOffset: 0
    });
    
    satelliteLayer.addTo(deviceMap);
    
    // Force map to recalculate size multiple times to ensure proper rendering
    const fixSize = () => {
      if (deviceMap) {
        deviceMap.invalidateSize(false); // false = don't animate
        // Trigger a small pan to force tile reload
        const center = deviceMap.getCenter();
        deviceMap.setView(center, deviceMap.getZoom(), { animate: false });
      }
    };
    
    // Fix size immediately and after delays
    fixSize();
    setTimeout(fixSize, 50);
    setTimeout(fixSize, 200);
    setTimeout(fixSize, 500);
    
    // Create marker with custom icon
    const deviceIcon = L.divIcon({
      className: 'device-marker',
      html: '<div style="background: #6366f1; width: 28px; height: 28px; border-radius: 50%; border: 3px solid white; box-shadow: 0 3px 10px rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center;"><div style="width: 12px; height: 12px; background: white; border-radius: 50%;"></div></div>',
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14]
    });
    
    // Create marker at default location
    deviceMarker = L.marker([21.0278, 105.8342], { 
      icon: deviceIcon,
      draggable: false,
      riseOnHover: true
    }).addTo(deviceMap);
    
    deviceMarker.bindPopup(`
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 4px;">
        <strong style="color: #6366f1;">Vị trí thiết bị</strong><br>
        <span style="font-size: 12px; color: #666;">Vĩ độ: 21.02780<br>Kinh độ: 105.83420</span>
      </div>
    `);
    
    // Add event listener for window resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (deviceMap) {
          deviceMap.invalidateSize(false);
        }
      }, 100);
    });
    
    // Fix size when map is moved/zoomed initially
    deviceMap.on('moveend', () => {
      setTimeout(() => {
        if (deviceMap) {
          deviceMap.invalidateSize(false);
        }
      }, 50);
    });
    
    return true;
  };
  
  // Try to initialize immediately
  if (!checkAndInit()) {
    // If not ready, try multiple times
    let attempts = 0;
    const tryInit = setInterval(() => {
      attempts++;
      if (checkAndInit() || attempts > 20) {
        clearInterval(tryInit);
      }
    }, 100);
  }
}

// ============================================
// Location Management
// ============================================
function updateDeviceLocation(lat, lon) {
  if (!deviceMap) initMap();
  if (!deviceMap) return;
  
  const now = new Date();
  
  // Update marker
  if (!deviceMarker) {
    const deviceIcon = L.divIcon({
      className: 'device-marker',
      html: '<div style="background: #6366f1; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.5);"></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    deviceMarker = L.marker([lat, lon], { icon: deviceIcon }).addTo(deviceMap);
  } else {
    deviceMarker.setLatLng([lat, lon]);
  }
  
  deviceMarker.bindPopup(`
    <strong>Vị trí thiết bị</strong><br>
    Vĩ độ: ${lat.toFixed(5)}<br>
    Kinh độ: ${lon.toFixed(5)}<br>
    Cập nhật: ${now.toLocaleTimeString()}
  `);
  
  // Add to trail
  locationTrail.push([lat, lon]);
  if (locationTrail.length > 100) {
    locationTrail.shift();
  }
  
  // Update trail polyline
  if (settings.showTrail && locationTrail.length > 1) {
    if (trailPolyline) {
      deviceMap.removeLayer(trailPolyline);
    }
    trailPolyline = L.polyline(locationTrail, {
      color: '#6366f1',
      weight: 3,
      opacity: 0.6
    }).addTo(deviceMap);
  }
  
  // Smooth fly to location with better zoom
  deviceMap.flyTo([lat, lon], 15, {
    animate: true,
    duration: 1.5,
    easeLinearity: 0.25
  });
  
  // Ensure map size is correct after animation
  setTimeout(() => {
    if (deviceMap) {
      deviceMap.invalidateSize();
    }
  }, 1600);
  
  // Update UI
  const latEl = document.getElementById('device-lat');
  const lonEl = document.getElementById('device-lon');
  const lastEl = document.getElementById('device-last');
  
  if (latEl) latEl.textContent = lat.toFixed(5);
  if (lonEl) lonEl.textContent = lon.toFixed(5);
  if (lastEl) lastEl.textContent = now.toLocaleString('vi-VN');
  
  appendEvent(`Vị trí cập nhật: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
  
  // Log data
  logData({ type: 'location', lat, lon, timestamp: now.toISOString() });
}

function centerMapOnDevice() {
  if (!deviceMap || !deviceMarker) {
    // If no marker, initialize map first
    if (!deviceMap) {
      initMap();
      setTimeout(() => {
        if (deviceMarker) {
          const latlng = deviceMarker.getLatLng();
          deviceMap.flyTo(latlng, 15, { animate: true, duration: 1.5 });
        }
      }, 300);
    }
    return;
  }
  const latlng = deviceMarker.getLatLng();
  deviceMap.flyTo(latlng, 15, { 
    animate: true, 
    duration: 1.5,
    easeLinearity: 0.25
  });
  
  // Open popup
  deviceMarker.openPopup();
}

// ============================================
// Chart Management
// ============================================
function addChartPoint(value) {
  const now = new Date();
  const label = now.toLocaleTimeString('vi-VN');
  
  chartData.labels.push(label);
  chartData.datasets[0].data.push(value);
  
  // Limit data points
  if (chartData.labels.length > settings.maxDataPoints) {
    chartData.labels.shift();
    chartData.datasets[0].data.shift();
  }
  
  if (vibrationChart) {
    vibrationChart.update('none');
  }
  
  // Update UI
  updateAccelerationCard(value);
  checkAlertThreshold(value);
  
  // Calculate intensity (Richter scale approximation)
  const intensity = calculateRichterScale(value);
  updateIntensityCard(intensity);
  
  // Check for Richter scale alert (> 2.0)
  const richterValue = parseFloat(intensity);
  if (richterValue > 2.0 && !earthquakeAlertShown) {
    showEarthquakeAlert(richterValue, value);
  }
  
  // Reset alert flag if Richter drops below 2.0
  if (richterValue <= 2.0 && earthquakeAlertShown) {
    earthquakeAlertShown = false;
  }
  
  lastRichterValue = richterValue;
  
  // Log data
  logData({ type: 'acceleration', value, intensity, timestamp: now.toISOString() });
}

function updateAccelerationCard(value) {
  const el = document.getElementById('card-acc');
  if (el) {
    el.textContent = value.toFixed(0);
  }
  
  const trendEl = document.getElementById('acc-trend');
  if (trendEl) {
    trendEl.textContent = `Cập nhật: ${new Date().toLocaleTimeString('vi-VN')}`;
  }
}

function calculateRichterScale(amplitude) {
  // Richter scale conversion directly from raw amplitude value
  // Calibration: amplitude 0 = 0 Richter, amplitude 1600 = 6 Richter
  // Simple proportional conversion: Richter = (amplitude / 1600) * 6
  
  if (amplitude <= 0) return 0;
  
  // Direct proportional conversion: Richter = (amplitude / 1600) * 6
  const richterValue = (amplitude / 1600) * 6;
  
  // Clamp to reasonable range
  if (richterValue < 0) return 0;
  if (richterValue > 10) return 10;
  
  return richterValue.toFixed(1);
}

function updateIntensityCard(intensity) {
  const el = document.getElementById('card-intensity');
  if (el) {
    el.textContent = intensity;
  }
  
  const trendEl = document.getElementById('intensity-trend');
  if (trendEl) {
    trendEl.textContent = `Cập nhật: ${new Date().toLocaleTimeString('vi-VN')}`;
  }
}

// ============================================
// Alert System
// ============================================
function checkAlertThreshold(value) {
  const indicator = document.getElementById('acc-indicator');
  const alertBanner = document.getElementById('alert-banner');
  
  if (value >= settings.alertThreshold) {
    // Show alert
    if (indicator) {
      indicator.textContent = 'Cảnh báo!';
      indicator.className = 'alert-indicator active';
    }
    if (alertBanner) {
      alertBanner.classList.remove('hidden');
    }
    
    // Change chart color to red
    if (chartData.datasets[0]) {
      chartData.datasets[0].borderColor = '#ef4444';
      chartData.datasets[0].backgroundColor = 'rgba(239, 68, 68, 0.2)';
    }
    
    appendEvent(`CẢNH BÁO: Biên độ ${value.toFixed(0)} vượt ngưỡng ${settings.alertThreshold}`);
  } else {
    // Hide alert
    if (indicator) {
      indicator.textContent = 'Bình thường';
      indicator.className = 'alert-indicator inactive';
    }
    if (alertBanner) {
      alertBanner.classList.add('hidden');
    }
    
    // Reset chart color
    if (chartData.datasets[0]) {
      chartData.datasets[0].borderColor = '#6366f1';
      chartData.datasets[0].backgroundColor = 'rgba(99, 102, 241, 0.1)';
    }
  }
  
  if (vibrationChart) {
    vibrationChart.update('none');
  }
}

// ============================================
// Earthquake Alert Modal
// ============================================
function showEarthquakeAlert(richterValue, acceleration) {
  // Mark as shown
  earthquakeAlertShown = true;
  
  // Request browser notification permission and show notification
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('CẢNH BÁO ĐỘNG ĐẤT!', {
      body: `Động đất lớn phát hiện! Cường độ Richter: ${richterValue.toFixed(1)}`,
      icon: '/favicon.ico',
      tag: 'earthquake-alert',
      requireInteraction: true,
      urgent: true
    });
  } else if ('Notification' in window && Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification('CẢNH BÁO ĐỘNG ĐẤT!', {
          body: `Động đất lớn phát hiện! Cường độ Richter: ${richterValue.toFixed(1)}`,
          icon: '/favicon.ico',
          tag: 'earthquake-alert',
          requireInteraction: true,
          urgent: true
        });
      }
    });
  }
  
  // Create and show modal
  const modal = document.getElementById('earthquake-alert-modal');
  if (modal) {
    modal.classList.remove('hidden');
    
    // Update modal content
    const richterEl = document.getElementById('modal-richter-value');
    const accEl = document.getElementById('modal-acc-value');
    const timeEl = document.getElementById('modal-time');
    
    if (richterEl) richterEl.textContent = richterValue.toFixed(1);
    if (accEl) accEl.textContent = acceleration.toFixed(0);
    if (timeEl) timeEl.textContent = new Date().toLocaleString('vi-VN');
    
    // Play alert sound (if supported)
    playAlertSound();
    
    // Focus modal
    modal.focus();
    
    // Auto scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    // Create modal if doesn't exist
    createEarthquakeModal(richterValue, acceleration);
  }
}

function createEarthquakeModal(richterValue, acceleration) {
  const modal = document.createElement('div');
  modal.id = 'earthquake-alert-modal';
  modal.className = 'earthquake-modal';
  modal.setAttribute('tabindex', '-1');
  modal.innerHTML = `
    <div class="earthquake-modal-overlay"></div>
    <div class="earthquake-modal-content">
      <div class="earthquake-modal-header">
        <h2>⚠️ CẢNH BÁO ĐỘNG ĐẤT LỚN!</h2>
      </div>
      <div class="earthquake-modal-body">
        <div class="earthquake-info">
          <div class="earthquake-stat">
            <div class="earthquake-stat-label">Cường độ Richter</div>
            <div class="earthquake-stat-value" id="modal-richter-value">${richterValue.toFixed(1)}</div>
          </div>
          <div class="earthquake-stat">
            <div class="earthquake-stat-label">Biên độ</div>
            <div class="earthquake-stat-value" id="modal-acc-value">${acceleration.toFixed(0)}</div>
          </div>
          <div class="earthquake-stat">
            <div class="earthquake-stat-label">Thời gian</div>
            <div class="earthquake-stat-value-small" id="modal-time">${new Date().toLocaleString('vi-VN')}</div>
          </div>
        </div>
        <div class="earthquake-message">
          <p><strong>Động đất lớn đang xảy ra!</strong></p>
          <p>Hãy giữ bình tĩnh và thực hiện ngay:</p>
          <ul>
            <li><strong>Nằm rạp xuống</strong> - Hạ thấp người xuống sàn</li>
            <li><strong>Che đầu</strong> - Dùng tay che đầu, trốn dưới bàn nếu có</li>
            <li><strong>Bám chặt</strong> - Bám vào vật cố định cho đến khi rung chấn dừng</li>
            <li><strong>Tránh xa</strong> cửa sổ, kính, đồ đạc lớn</li>
          </ul>
        </div>
      </div>
      <div class="earthquake-modal-footer">
        <button class="btn btn-primary btn-large" onclick="closeEarthquakeAlert()">Đã hiểu</button>
        <button class="btn btn-secondary btn-large" onclick="showPage('escape')">Xem hướng dẫn</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Show modal
  setTimeout(() => {
    modal.classList.remove('hidden');
    modal.focus();
  }, 10);
  
  // Play alert sound
  playAlertSound();
  
  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function closeEarthquakeAlert() {
  const modal = document.getElementById('earthquake-alert-modal');
  if (modal) {
    modal.classList.add('hidden');
    // Reset alert flag after closing
    setTimeout(() => {
      earthquakeAlertShown = false;
    }, 1000);
  }
}

function playAlertSound() {
  // Create audio context for alert sound
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800; // 800 Hz
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
    
    // Repeat 3 times
    setTimeout(() => {
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();
      osc2.connect(gain2);
      gain2.connect(audioContext.destination);
      osc2.frequency.value = 800;
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      osc2.start(audioContext.currentTime);
      osc2.stop(audioContext.currentTime + 0.5);
    }, 600);
    
    setTimeout(() => {
      const osc3 = audioContext.createOscillator();
      const gain3 = audioContext.createGain();
      osc3.connect(gain3);
      gain3.connect(audioContext.destination);
      osc3.frequency.value = 800;
      osc3.type = 'sine';
      gain3.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain3.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      osc3.start(audioContext.currentTime);
      osc3.stop(audioContext.currentTime + 0.5);
    }, 1200);
  } catch (e) {
    console.log('Audio not supported:', e);
  }
}

// ============================================
// Data Logging
// ============================================
function logData(data) {
  dataLog.push(data);
  
  // Limit log size
  if (dataLog.length > 10000) {
    dataLog = dataLog.slice(-5000);
  }
}

function exportData() {
  if (dataLog.length === 0) {
    alert('Chưa có dữ liệu để xuất');
    return;
  }
  
  const csv = convertToCSV(dataLog);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `vibration_data_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  appendEvent(`Dữ liệu đã xuất: ${dataLog.length} bản ghi`);
}

function convertToCSV(data) {
  if (data.length === 0) return '';
  
  const headers = ['Timestamp', 'Type', 'Value', 'Latitude', 'Longitude', 'Intensity'];
  const rows = data.map(item => {
    return [
      item.timestamp || '',
      item.type || '',
      item.value !== undefined ? item.value : '',
      item.lat !== undefined ? item.lat : '',
      item.lon !== undefined ? item.lon : '',
      item.intensity !== undefined ? item.intensity : ''
    ].join(',');
  });
  
  return [headers.join(','), ...rows].join('\n');
}

// ============================================
// Settings Management
// ============================================
function loadSettings() {
  const saved = localStorage.getItem('vibrationSettings');
  if (saved) {
    try {
      settings = { ...settings, ...JSON.parse(saved) };
    } catch (e) {
      console.error('Error loading settings:', e);
    }
  }
  
  // Apply to UI
  const thresholdEl = document.getElementById('alert-threshold');
  const frequencyEl = document.getElementById('update-frequency');
  const trailEl = document.getElementById('show-trail');
  
  if (thresholdEl) thresholdEl.value = settings.alertThreshold;
  if (frequencyEl) frequencyEl.value = settings.updateFrequency;
  if (trailEl) trailEl.checked = settings.showTrail;
}

function saveSettings() {
  localStorage.setItem('vibrationSettings', JSON.stringify(settings));
}

function updateAlertThreshold() {
  const el = document.getElementById('alert-threshold');
  if (el) {
    settings.alertThreshold = parseFloat(el.value) || 2.0;
    saveSettings();
    appendEvent(`Ngưỡng cảnh báo đã cập nhật: ${settings.alertThreshold}g`);
  }
}

function updateFrequency() {
  const el = document.getElementById('update-frequency');
  if (el) {
    settings.updateFrequency = parseInt(el.value) || 100;
    saveSettings();
    appendEvent(`Tần số cập nhật đã cập nhật: ${settings.updateFrequency}ms`);
  }
}

function toggleTrail() {
  const el = document.getElementById('show-trail');
  if (el) {
    settings.showTrail = el.checked;
    saveSettings();
    
    if (settings.showTrail && locationTrail.length > 1) {
      if (trailPolyline) {
        deviceMap.removeLayer(trailPolyline);
      }
      trailPolyline = L.polyline(locationTrail, {
        color: '#6366f1',
        weight: 3,
        opacity: 0.6
      }).addTo(deviceMap);
    } else {
      if (trailPolyline) {
        deviceMap.removeLayer(trailPolyline);
        trailPolyline = null;
      }
    }
    
    appendEvent(`Hiển thị trail: ${settings.showTrail ? 'Bật' : 'Tắt'}`);
  }
}

function updateMaxDataPoints() {
  const el = document.getElementById('max-data-points');
  if (el) {
    settings.maxDataPoints = parseInt(el.value) || 100;
    saveSettings();
    appendEvent(`Số điểm dữ liệu tối đa đã cập nhật: ${settings.maxDataPoints}`);
  }
}

function toggleSettings() {
  showPage('settings');
}

// ============================================
// Event Logging
// ============================================
function appendEvent(msg) {
  const el = document.getElementById('event-log');
  if (!el) return;
  
  const timestamp = new Date().toLocaleTimeString('vi-VN');
  el.value = (el.value ? el.value + '\n' : '') + `[${timestamp}] ${msg}`;
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

function updateUI() {
  // Initialize UI elements
  const statusEl = document.getElementById('card-status');
  if (statusEl) statusEl.textContent = 'Chưa kết nối';
}

// ============================================
// Bluetooth Functions
// ============================================
async function connectBluetooth() {
  if (!navigator.bluetooth) {
    alert('Trình duyệt không hỗ trợ Web Bluetooth API.\n\nSử dụng Chrome/Edge trên desktop hoặc Chrome trên Android.');
    return;
  }

  try {
    updateStatus('Đang tìm thiết bị...');
    appendToLog('[CONNECT] Đang tìm thiết bị ESP32...');
    
    bluetoothDevice = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: 'ESP32' }],
      optionalServices: [NUS_SERVICE_UUID]
    });

    bluetoothDevice.addEventListener('gattserverdisconnected', onDisconnected);
    updateStatus('Kết nối tới ' + (bluetoothDevice.name || 'thiết bị') + '...');
    appendToLog(`[CONNECT] Đã tìm thấy: ${bluetoothDevice.name || 'ESP32'}`);

    const server = await bluetoothDevice.gatt.connect();
    updateStatus('Đang kết nối service...');
    
    nusService = await server.getPrimaryService(NUS_SERVICE_UUID);
    txCharacteristic = await nusService.getCharacteristic(NUS_TX_CHAR_UUID);
    rxCharacteristic = await nusService.getCharacteristic(NUS_RX_CHAR_UUID);

    await txCharacteristic.startNotifications();
    txCharacteristic.addEventListener('characteristicvaluechanged', handleNotifications);

    updateStatus('Đã kết nối: ' + (bluetoothDevice.name || 'ESP32'));
    appendToLog('[CONNECTED] Kết nối thành công!');
    appendEvent('Kết nối Bluetooth thành công');
    
    // Update UI
    const nameEl = document.getElementById('device-name');
    const card = document.getElementById('card-status');
    const statusBadge = document.getElementById('device-status');
    
    if (nameEl) nameEl.textContent = bluetoothDevice.name || 'ESP32';
    if (card) card.textContent = 'Đã kết nối';
    if (statusBadge) {
      statusBadge.textContent = 'Online';
      statusBadge.classList.remove('off');
    }
    updateSettingsStatus();
    
    // Initialize dashboard if needed
    setTimeout(initDashboard, 200);
  } catch (err) {
    console.error('Bluetooth connection error:', err);
    updateStatus('Lỗi kết nối');
    appendToLog('[ERROR] ' + (err.message || err));
    appendEvent('Lỗi kết nối Bluetooth: ' + (err.message || err));
    
    if (err.name !== 'NotFoundError') {
      alert('Lỗi kết nối Bluetooth:\n' + (err.message || err));
    }
  }
}

function onDisconnected(event) {
  appendToLog('[DISCONNECTED] Thiết bị đã ngắt kết nối');
  appendEvent('Thiết bị đã ngắt kết nối');
  updateStatus('Đã ngắt kết nối');
  
  const statusBadge = document.getElementById('device-status');
  const card = document.getElementById('card-status');
  
  if (statusBadge) {
    statusBadge.textContent = 'Offline';
    statusBadge.classList.add('off');
  }
  updateSettingsStatus();
  if (card) card.textContent = 'Đã ngắt kết nối';
}

function handleNotifications(event) {
  const value = event.target.value;
  const decoder = new TextDecoder('utf-8');
  const text = decoder.decode(value).trim();
  
  if (!text) return;
  
  appendToLog('RX ← ' + text);
  
  // Try to parse JSON first
  try {
    const obj = JSON.parse(text);
    if (obj) {
      if (obj.lat !== undefined && obj.lon !== undefined) {
        updateDeviceLocation(parseFloat(obj.lat), parseFloat(obj.lon));
      }
      if (obj.acc !== undefined) {
        const n = parseFloat(obj.acc);
        if (!isNaN(n)) addChartPoint(n);
      }
      if (obj.sr !== undefined) {
        const el = document.getElementById('card-sr');
        if (el) el.textContent = obj.sr + ' Hz';
      }
      if (obj.batt !== undefined) {
        const el = document.getElementById('device-batt');
        if (el) el.textContent = obj.batt + '%';
      }
      return;
    }
  } catch (e) {
    // Not JSON, continue with other parsers
  }

  // Try to parse coordinate pair
  const coord = text.match(/(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
  if (coord) {
    const lat = parseFloat(coord[1]);
    const lon = parseFloat(coord[2]);
    if (!isNaN(lat) && !isNaN(lon)) {
      updateDeviceLocation(lat, lon);
      return;
    }
  }

  // Try to parse numeric acceleration value
  const m = text.match(/(-?\d+\.?\d*)/);
  if (m) {
    const num = parseFloat(m[1]);
    if (!isNaN(num)) {
      addChartPoint(num);
      return;
    }
  }
  
  // If no pattern matched, just log it
  appendEvent('RX ← ' + text);
}

async function sendToDevice() {
  const input = document.getElementById('ble-input');
  if (!input) return;
  
  const text = input.value.trim();
  if (!text) return;
  
  if (!rxCharacteristic) {
    alert('Chưa có kết nối BLE. Bấm "Kết nối Bluetooth" trước.');
    return;
  }
  
  try {
    const data = new TextEncoder().encode(text + '\n');
    await rxCharacteristic.writeValue(data);
    appendToLog('TX → ' + text);
    appendEvent('TX → ' + text);
    input.value = '';
  } catch (err) {
    console.error('Send error:', err);
    appendToLog('[ERROR] Gửi lỗi: ' + (err.message || err));
    appendEvent('Lỗi gửi dữ liệu: ' + (err.message || err));
    alert('Không gửi được: ' + (err.message || err));
  }
}

function disconnectBluetooth() {
  if (!bluetoothDevice) return;
  
  if (bluetoothDevice.gatt && bluetoothDevice.gatt.connected) {
    bluetoothDevice.gatt.disconnect();
    appendToLog('[DISCONNECT] Ngắt kết nối thủ công');
    appendEvent('Đã ngắt kết nối thủ công');
    updateStatus('Đã ngắt kết nối');
    
    const nameEl = document.getElementById('device-name');
    const card = document.getElementById('card-status');
    const statusBadge = document.getElementById('device-status');
    
    if (nameEl) nameEl.textContent = '(chưa có thiết bị)';
    if (card) card.textContent = 'Chưa kết nối';
    if (statusBadge) {
      statusBadge.textContent = 'Offline';
      statusBadge.classList.add('off');
    }
  }
}

// ============================================
// Location Functions
// ============================================
function getLocation() {
  if (!navigator.geolocation) {
    alert('Trình duyệt của bạn không hỗ trợ định vị GPS.');
    return;
  }
  
  navigator.geolocation.getCurrentPosition(showPosition, showError, {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 0
  });
}

function showPosition(position) {
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  
  appendEvent(`Vị trí của bạn: ${lat.toFixed(5)}, ${lon.toFixed(5)}`);
  
  window.open(`https://www.google.com/maps?q=${lat},${lon}`, '_blank');
}

function showError(error) {
  let message = 'Không thể lấy vị trí.';
  switch (error.code) {
    case error.PERMISSION_DENIED:
      message = 'Bạn đã từ chối chia sẻ vị trí.';
      break;
    case error.POSITION_UNAVAILABLE:
      message = 'Không thể lấy thông tin vị trí.';
      break;
    case error.TIMEOUT:
      message = 'Yêu cầu định vị hết thời gian.';
      break;
  }
  alert(message);
  appendEvent('Lỗi định vị: ' + message);
}

function openEscapeGuide() {
  const canvaUrl = 'https://www.canva.com/design/DAG8aIzD1PY/_kruFygy91cJfloI8xMFSg/view';
  window.open(canvaUrl, '_blank');
  appendEvent('Đã mở hướng dẫn thoát hiểm');
}
