/*********************************************************************
 * ESP32 SEISMOMETER – DSP + BLE + LCD 20x4
 *********************************************************************/

 #include <Arduino.h>
 #include <LiquidCrystal_I2C.h>
 #include <BLEDevice.h>
 #include <BLEServer.h>
 #include <BLEUtils.h>
 #include <BLE2902.h>
 
 /* ================= DSP FILTERS ================= */
 extern "C" {
   #include "denoise_filter.h"
   #include "biquad.h"
   #include "boost_filter.h"
   #include "detrend_filter.h"
 }
 
 /* ================= CONFIG ================= */
 #define ADC_PIN     34
 #define BUZZER_PIN  25
 #define LED_PIN     2
 
 #define LCD_ADDR 0x27
 #define LCD_COLS 20
 #define LCD_ROWS 4
 
 #define ALERT_THRESHOLD 2000   // amplitude threshold
 #define BLE_INTERVAL 500       // ms
 
 /* ================= LCD ================= */
 LiquidCrystal_I2C lcd(LCD_ADDR, LCD_COLS, LCD_ROWS);
 
 /* ================= BLE ================= */
 #define DEVICE_NAME "ESP32-Seismo"
 #define SERVICE_UUID           "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
 #define CHARACTERISTIC_UUID_RX "6e400002-b5a3-f393-e0a9-e50e24dcca9e"
 #define CHARACTERISTIC_UUID_TX "6e400003-b5a3-f393-e0a9-e50e24dcca9e"
 
BLECharacteristic* txChar;
BLECharacteristic* rxChar;
BLEServer* pServer = NULL;
bool deviceConnected = false;
 
 /* ================= FIR ================= */
 const unsigned int ncoeff = sizeof(coeff) / sizeof(coeff[0]);
 float lagarray[ncoeff];
 
 /* ================= BIQUADS ================= */
 biquad_z_t boost_z[BOOST_BIQUADS_SIZE];
 biquad_z_t detrend_z[DETREND_BIQUADS_SIZE];
 
 /* ================= TIMER ================= */
 hw_timer_t *adcTimer = NULL;
 portMUX_TYPE timerMux = portMUX_INITIALIZER_UNLOCKED;
 
 volatile uint32_t runningsum = 0;
 volatile uint16_t runningcount = 0;
 volatile uint32_t prev1=0, prev2=0, prev3=0;
 volatile uint32_t current_sum = 0;
 volatile uint16_t next_sample = 0;
 volatile bool next_ready = false;
 volatile uint8_t first_adc = 10;
 volatile uint8_t first_loop = 1;
 
/* ================= STATE ================= */
unsigned long lastBLE = 0;
unsigned int amplitude = 0;
bool alertState = false;

float deviceLat = 10.827584;
float deviceLon = 106.698985;
int batteryLevel = 100;

// AS-1 format: zero level và sample rate
#define AS1_ZERO_LEVEL 2048  // Zero level cho ADC 12-bit (0-4096 -> -2048 to +2048)
#define AS1_SAMPLE_RATE 18   // Samples per second (tương ứng với rate hiện tại)
#define AS1_FORMAT_MODE 1    // 1 = AS-1 format, 0 = 4C-ASCII format
 
/* ================= BLE CALLBACKS ================= */
class ServerCB : public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) { 
    deviceConnected = true;
    Serial.println("BLE Client connected");
  }
  
  void onDisconnect(BLEServer* pServer) { 
    deviceConnected = false;
    Serial.println("BLE Client disconnected - restarting advertising");
    
    // Restart advertising để cho phép kết nối lại
    delay(500); // Delay ngắn trước khi restart
    pServer->startAdvertising();
    Serial.println("BLE Advertising restarted");
  }
};

class RxCallback : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic* pChar) {
    std::string rxValue = pChar->getValue();
    if (rxValue.length() > 0) {
      Serial.print("Received: ");
      for (int i = 0; i < rxValue.length(); i++) {
        Serial.print((char)rxValue[i]);
      }
      Serial.println();
      // Handle commands from web app if needed
    }
  }
};
 
 /* ================= ADC ISR ================= */
 void IRAM_ATTR onAdcTimer() {
   portENTER_CRITICAL_ISR(&timerMux);
 
   uint16_t adc = analogRead(ADC_PIN);
   if (first_adc) { first_adc--; goto exit; }
 
   runningsum += adc;
 
   if (++runningcount == 512) {
     if (first_loop)
       prev1 = prev2 = prev3 = runningsum;
     else {
       prev3 = prev2;
       prev2 = prev1;
       prev1 = current_sum;
     }
 
     current_sum = runningsum;
     next_sample = (current_sum + prev1 + prev2 + prev3) >> 5;
     runningsum = 0;
     runningcount = 0;
     next_ready = true;
   }
 
 exit:
   portEXIT_CRITICAL_ISR(&timerMux);
 }
 
 /* ================= INIT ADC ================= */
 void initADC() {
   analogReadResolution(12);
   analogSetAttenuation(ADC_11db);
 
   adcTimer = timerBegin(9600);
   timerAttachInterrupt(adcTimer, &onAdcTimer);
   timerAlarm(adcTimer, 1, true, 0);
 }
 
 /* ================= DSP ================= */
 float process_sample(float y) {
   static float Bfmult = pow(10.0, 20.0/20.0);
   float z = 0, fL;
   int i;
 
   if (first_loop) {
     first_loop = 0;
     for (i=0;i<ncoeff;i++) lagarray[i]=y;
     biquad_clear(detrend_z, DETREND_BIQUADS_SIZE, y);
     biquad_clear(boost_z, BOOST_BIQUADS_SIZE, y);
   }
 
   for (i=ncoeff-1;i>0;i--) lagarray[i]=lagarray[i-1];
   lagarray[0]=y;
 
   for (i=0;i<ncoeff;i++) z += lagarray[i]*coeff[i];
 
   z = biquad_filter(z, detrend_biquads, detrend_z, DETREND_BIQUADS_SIZE) * detrend_biquads_g;
   fL = biquad_filter(z, boost_biquads, boost_z, BOOST_BIQUADS_SIZE) * boost_biquads_g;
 
   return z + Bfmult*fL;
 }
 
 /* ================= LCD ================= */
 void updateLCD() {
   lcd.setCursor(0,0);
   lcd.print("SEISMOMETER ");
   lcd.print(alertState ? "ALERT":" OK  ");
 
   lcd.setCursor(0,1);
   lcd.print("AMPLITUDE: ");
   lcd.print(amplitude);
   lcd.print("   ");
 
   lcd.setCursor(0,2);
   lcd.print("BLE: ");
   lcd.print(deviceConnected?"CONNECTED ":"WAITING  ");
 
   lcd.setCursor(0,3);
   lcd.print("LAT:");
   lcd.print(deviceLat,2);
   lcd.print(" LON:");
   lcd.print(deviceLon,2);
 }
 
/* ================= AS-1 FORMAT ================= */
// Chuyển đổi raw ADC value sang AS-1 format (integer -2048 to +2048)
// AS-1 seismometer format: raw ADC value (12-bit, 0-4095) trừ zero level (2048)
int convertToAS1(uint16_t rawADC) {
  // ADC 12-bit: range 0-4095, zero level ở ~2048
  // AS-1 format: giá trị integer trong range -2048 to +2048
  int as1Value = (int)rawADC - AS1_ZERO_LEVEL;
  
  // Clamp vào range AS-1 (-2048 to +2048)
  if (as1Value > 2048) as1Value = 2048;
  if (as1Value < -2048) as1Value = -2048;
  
  return as1Value;
}

/* ================= SERIAL SEND (AS-1 Format) ================= */
void sendAS1Serial(uint16_t rawSample, float processedValue) {
  if (AS1_FORMAT_MODE) {
    // AS-1 format: gửi raw ADC value dạng integer (-2048 to +2048)
    // Format AS-1: mỗi dòng một giá trị số nguyên
    int as1Value = convertToAS1(rawSample);
    Serial.println(as1Value);
  } else {
    // 4C-ASCII format: gửi processed float value
    Serial.println(processedValue);
  }
}

/* ================= BLE SEND ================= */
void sendBLE() {
  if (!deviceConnected) return;

  char buf[200];
  snprintf(buf,sizeof(buf),
    "{\"acc\":%u,\"lat\":%.5f,\"lon\":%.5f,\"sr\":18,\"batt\":%d,\"alert\":%s}",
    amplitude, deviceLat, deviceLon, batteryLevel,
    alertState?"true":"false"
  );

  txChar->setValue(buf);
  
  // Kiểm tra notify thành công, nếu fail thì có thể connection đã bị ngắt
  if (!txChar->notify()) {
    Serial.println("BLE notify failed - connection may be lost");
    deviceConnected = false;
  }
}
 
 /* ================= SETUP ================= */
 void setup() {
   Serial.begin(9600);
   pinMode(BUZZER_PIN, OUTPUT);
   pinMode(LED_PIN, OUTPUT);
 
   lcd.init();
   lcd.backlight();
   lcd.print("SEISMOMETER");
   delay(3000);
   lcd.clear();
 
   BLEDevice::init(DEVICE_NAME);
   pServer = BLEDevice::createServer();
   pServer->setCallbacks(new ServerCB());
 
  BLEService* service = pServer->createService(SERVICE_UUID);
  
  // TX Characteristic (notify - device -> web app)
  txChar = service->createCharacteristic(
    CHARACTERISTIC_UUID_TX,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  txChar->addDescriptor(new BLE2902());
  
  // RX Characteristic (write - web app -> device)
  rxChar = service->createCharacteristic(
    CHARACTERISTIC_UUID_RX,
    BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR
  );
  rxChar->setCallbacks(new RxCallback());

  service->start();
  BLEDevice::startAdvertising();
 
   initADC();
 }
 
 /* ================= LOOP ================= */
 void loop() {
   if (!next_ready) return;
 
  portENTER_CRITICAL(&timerMux);
  uint16_t s = next_sample;
  next_ready = false;
  portEXIT_CRITICAL(&timerMux);

  float v = process_sample((float)s - 32768.0);
  amplitude = abs((int)v);
  float realValue = v + 32768.0;   


  alertState = amplitude > ALERT_THRESHOLD;
  digitalWrite(BUZZER_PIN, alertState);

  updateLCD();

 if (millis() - lastBLE > BLE_INTERVAL) {
   lastBLE = millis();
   sendBLE();
 }
 
 // Gửi dữ liệu qua Serial theo format AS-1 (hoặc 4C-ASCII)
 // AS-1: dùng raw ADC value (s); 4C-ASCII: dùng processed value (realValue)
 sendAS1Serial(s, realValue);
}