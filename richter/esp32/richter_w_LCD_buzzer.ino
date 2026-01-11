#include <LiquidCrystal_I2C.h>

const int analogPin = 35;
const int buzzerPin = 25;

const float Vref = 3.3;
const int ADC_MAX = 4095;
const float ALERT_THRESHOLD = 2.0;   // <-- nguong canh bao (Volt)

LiquidCrystal_I2C lcd(0x27, 16, 4);

// bar graph
byte barFull[8]   = {0x1F,0x1F,0x1F,0x1F,0x1F,0x1F,0x1F,0x1F};
byte barEmpty[8]  = {0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00};

float peakVoltage = 0;
float filtered = 0;
bool alertState = false;

float smooth(float prev, float cur, float alpha = 0.25) {
  return prev + alpha * (cur - prev);
}

void setup() {
  Serial.begin(115200);

  pinMode(buzzerPin, OUTPUT);
  digitalWrite(buzzerPin, LOW);

  lcd.init();
  lcd.backlight();
  lcd.createChar(0, barFull);
  lcd.createChar(1, barEmpty);

  analogReadResolution(12);
  analogSetPinAttenuation(analogPin, ADC_11db);

  lcd.setCursor(0,0);
  lcd.print("MAY DO RUNG CHAN");
  delay(1200);
  lcd.clear();
}

void drawBar(float voltage) {
  int bars = map(voltage * 1000, 0, Vref * 1000, 0, 10);
  lcd.setCursor(0,2);
  lcd.print("Muc do: ");
  for (int i = 0; i < 10; i++) {
    if (i < bars) lcd.write(byte(0));
    else          lcd.write(byte(1));
  }
}

void loop() {

  int raw = analogRead(analogPin);
  float voltage = (raw * Vref) / ADC_MAX;

  filtered = smooth(filtered, voltage);
  if (filtered > peakVoltage) peakVoltage = filtered;

  // -------- ALERT LOGIC --------
  alertState = (filtered >= ALERT_THRESHOLD);

  if (alertState) {
    tone(buzzerPin, 2000);   // 2kHz
  } else {
    noTone(buzzerPin);
  }

  // -------- LCD --------
  lcd.setCursor(0,0);
  if (alertState) {
    lcd.print("!!! CANH BAO !!!");
  } else {
    lcd.print("MAY DO RUNG CHAN");
  }

  lcd.setCursor(0,1);
  lcd.print("Volt: ");
  lcd.print(filtered, 3);
  lcd.print("V   ");

  drawBar(filtered);

  lcd.setCursor(0,3);
  lcd.print("Peak : ");
  lcd.print(peakVoltage, 3);
  lcd.print("V   ");

  // -------- STREAM to jAmaSeis --------
  int centered = raw - (ADC_MAX / 2);
  Serial.println(centered);

  delay(31);
}