/*
 * ESP32 Seismic Monitor with BLE
 * Gửi dữ liệu rung chấn qua Bluetooth Low Energy (BLE)
 * Data format: JSON {"acc": float, "lat": float, "lon": float, "sr": int, "batt": int}
 * 
 * Hardware:
 * - ESP32 DevKit
 * - Analog sensor on pin 35 (ADC)
 * - Buzzer on pin 25
 * - LCD I2C (optional)
 * - GPS module (optional, for lat/lon)
 */

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <LiquidCrystal_I2C.h>

// ============================================
// Hardware Configuration
// ============================================
const int analogPin = 35;
const int buzzerPin = 25;

const float Vref = 3.3;
const int ADC_MAX = 4095;
const float ALERT_THRESHOLD = 2.0;  // Ngưỡng cảnh báo (Volt)

// LCD (optional, comment out if not used)
LiquidCrystal_I2C lcd(0x27, 16, 4);

// ============================================
// BLE Configuration
// ============================================
BLEServer* pServer = NULL;
BLECharacteristic* pTxCharacteristic = NULL;
BLECharacteristic* pRxCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// Nordic UART Service (NUS) UUIDs
#define SERVICE_UUID           "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define CHARACTERISTIC_UUID_RX "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
#define CHARACTERISTIC_UUID_TX "6e400003-b5a3-f393-e0a9-e50e24dcca9e"

// Device name (will appear in BLE scan)
#define DEVICE_NAME "ESP32-Richter"

// ============================================
// BLE Callbacks
// ============================================
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("Device connected");
    };

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("Device disconnected");
    }
};

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      std::string rxValue = pCharacteristic->getValue();

      if (rxValue.length() > 0) {
        Serial.print("RX ← ");
        for (int i = 0; i < rxValue.length(); i++) {
          Serial.print(rxValue[i]);
        }
        Serial.println();

        // Handle commands
        String cmd = String(rxValue.c_str());
        cmd.trim();
        
        if (cmd == "PING" || cmd == "ping") {
          sendData("{\"status\":\"pong\"}");
        } else if (cmd == "GET_STATUS" || cmd == "get_status") {
          sendStatus();
        }
        // Add more commands here
      }
    }
};

// ============================================
// Variables
// ============================================
float peakVoltage = 0;
float filtered = 0;
bool alertState = false;
unsigned long lastUpdate = 0;
unsigned long lastBLEUpdate = 0;
const unsigned long UPDATE_INTERVAL = 31;  // ~32Hz sampling rate
const unsigned long BLE_INTERVAL = 100;    // 100ms between BLE updates (10Hz)

// GPS (if available - set to device location or 0 if not available)
float deviceLat = 21.0278;  // Default: Hanoi, Vietnam
float deviceLon = 105.8342;
int batteryLevel = 100;  // Battery percentage (if monitoring available)

// ============================================
// Helper Functions
// ============================================
float smooth(float prev, float cur, float alpha = 0.25) {
  return prev + alpha * (cur - prev);
}

void sendData(const char* data) {
  if (deviceConnected && pTxCharacteristic) {
    pTxCharacteristic->setValue(data);
    pTxCharacteristic->notify();
  }
}

void sendStatus() {
  char buffer[200];
  snprintf(buffer, sizeof(buffer),
    "{\"acc\":%.3f,\"lat\":%.5f,\"lon\":%.5f,\"sr\":%d,\"batt\":%d,\"alert\":%s}",
    filtered, deviceLat, deviceLon, (int)(1000.0/BLE_INTERVAL), batteryLevel,
    alertState ? "true" : "false"
  );
  sendData(buffer);
}

void updateLCD() {
  #ifdef LCD_ENABLED
  lcd.setCursor(0, 0);
  if (alertState) {
    lcd.print("!!! CANH BAO !!!");
  } else {
    lcd.print("MAY DO RUNG CHAN");
  }

  lcd.setCursor(0, 1);
  lcd.print("Volt: ");
  lcd.print(filtered, 3);
  lcd.print("V   ");

  lcd.setCursor(0, 2);
  lcd.print("Peak: ");
  lcd.print(peakVoltage, 3);
  lcd.print("V   ");

  lcd.setCursor(0, 3);
  if (deviceConnected) {
    lcd.print("BLE: Connected   ");
  } else {
    lcd.print("BLE: Disconnected");
  }
  #endif
}

// ============================================
// Setup
// ============================================
void setup() {
  Serial.begin(115200);
  Serial.println("\n\nESP32 Seismic Monitor with BLE");
  Serial.println("================================");

  // Pin configuration
  pinMode(buzzerPin, OUTPUT);
  digitalWrite(buzzerPin, LOW);
  analogReadResolution(12);
  analogSetPinAttenuation(analogPin, ADC_11db);

  // Initialize LCD (if available)
  #ifdef LCD_ENABLED
  lcd.init();
  lcd.backlight();
  lcd.setCursor(0, 0);
  lcd.print("MAY DO RUNG CHAN");
  delay(1000);
  lcd.clear();
  #endif

  // Initialize BLE
  BLEDevice::init(DEVICE_NAME);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  // TX Characteristic (notify)
  pTxCharacteristic = pService->createCharacteristic(
                         CHARACTERISTIC_UUID_TX,
                         BLECharacteristic::PROPERTY_NOTIFY
                       );
  pTxCharacteristic->addDescriptor(new BLE2902());

  // RX Characteristic (write)
  pRxCharacteristic = pService->createCharacteristic(
                         CHARACTERISTIC_UUID_RX,
                         BLECharacteristic::PROPERTY_WRITE
                       );
  pRxCharacteristic->setCallbacks(new MyCallbacks());

  pService->start();

  // Start advertising
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(false);
  pAdvertising->setMinPreferred(0x0);
  BLEDevice::startAdvertising();
  
  Serial.println("BLE initialized. Waiting for connection...");
  Serial.println("Device name: " + String(DEVICE_NAME));
  Serial.println("Service UUID: " + String(SERVICE_UUID));
  
  #ifdef LCD_ENABLED
  lcd.setCursor(0, 0);
  lcd.print("BLE: Advertising ");
  #endif
}

// ============================================
// Main Loop
// ============================================
void loop() {
  unsigned long currentTime = millis();

  // Handle BLE connection state
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->startAdvertising();
    Serial.println("Restarting advertising...");
    oldDeviceConnected = deviceConnected;
  }

  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
    Serial.println("Device reconnected");
  }

  // Read sensor data
  if (currentTime - lastUpdate >= UPDATE_INTERVAL) {
    lastUpdate = currentTime;

    int raw = analogRead(analogPin);
    float voltage = (raw * Vref) / ADC_MAX;
    filtered = smooth(filtered, voltage);
    
    if (filtered > peakVoltage) {
      peakVoltage = filtered;
    }

    // Alert logic
    alertState = (filtered >= ALERT_THRESHOLD);

    if (alertState) {
      tone(buzzerPin, 2000, 100);  // 2kHz, 100ms beep
    }

    // Update LCD
    updateLCD();
  }

  // Send data via BLE
  if (deviceConnected && (currentTime - lastBLEUpdate >= BLE_INTERVAL)) {
    lastBLEUpdate = currentTime;

    // Create JSON data
    char jsonBuffer[200];
    snprintf(jsonBuffer, sizeof(jsonBuffer),
      "{\"acc\":%.3f,\"lat\":%.5f,\"lon\":%.5f,\"sr\":%d,\"batt\":%d}",
      filtered, deviceLat, deviceLon, (int)(1000.0/BLE_INTERVAL), batteryLevel
    );

    sendData(jsonBuffer);
    
    // Also send to Serial for debugging
    Serial.println(jsonBuffer);
  }

  delay(10);
}

