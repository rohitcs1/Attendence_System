#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecureBearSSL.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <ArduinoJson.h>
#include <LittleFS.h>

// NodeMCU ESP-12E: RC522 SS=D8, RST=D0, SPI SCK=D5/MISO=D6/MOSI=D7.
// OLED I2C uses SDA=D2 and SCL=D1. All peripherals are 3.3V.
constexpr uint8_t RFID_SS = D8;
constexpr uint8_t RFID_RST = D0;
constexpr uint8_t BUZZER = D4;
constexpr uint32_t HEARTBEAT_MS = 60000;
constexpr uint32_t DEBOUNCE_MS = 2500;

const char* WIFI_SSID = "SET_WIFI_SSID";
const char* WIFI_PASSWORD = "SET_WIFI_PASSWORD";
// Local testing: use the computer's LAN IP, not localhost.
// Example: "http://192.168.1.10:4000/api/v1"
// Production: use the public HTTPS API URL.
const char* API_URL = "http://192.168.1.10:4000/api/v1";
const char* DEVICE_ID = "SET_DEVICE_ID";
const char* DEVICE_CREDENTIAL = "SET_DEVICE_CREDENTIAL";
const char* ROOM_NUMBER = "SET_ROOM";

MFRC522 rfid(RFID_SS, RFID_RST);
Adafruit_SSD1306 display(128, 64, &Wire, -1);
uint32_t lastHeartbeat = 0;
uint32_t lastScan = 0;

void screen(
    const String& line1,
    const String& line2 = "",
    const String& line3 = "") {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("SmartClass");
  display.print("Room: ");
  display.println(ROOM_NUMBER);
  display.println(line1);
  display.println(line2);
  display.println(line3);
  display.display();
}

void beep(uint8_t count, uint16_t duration) {
  for (uint8_t i = 0; i < count; ++i) {
    digitalWrite(BUZZER, HIGH);
    delay(duration);
    digitalWrite(BUZZER, LOW);

    if (i + 1 < count) {
      delay(100);
    }
  }
}

void wifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  screen("Wi-Fi: Connecting", "Please wait");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  uint32_t started = millis();
  while (WiFi.status() != WL_CONNECTED &&
         millis() - started < 15000) {
    delay(250);
  }

  if (WiFi.status() != WL_CONNECTED) {
    screen("Wi-Fi unavailable", "Retrying...");
  }
}

String uid() {
  String value;

  for (byte i = 0; i < rfid.uid.size; ++i) {
    if (i) {
      value += ":";
    }

    if (rfid.uid.uidByte[i] < 0x10) {
      value += "0";
    }

    value += String(rfid.uid.uidByte[i], HEX);
  }

  value.toUpperCase();
  return value;
}

String eventUuid() {
  char value[37];
  snprintf(
      value,
      sizeof(value),
      "%08lx-%04lx-4%03lx-%04lx-%08lx%04lx",
      ESP.getChipId(),
      millis() & 0xffff,
      micros() & 0xfff,
      (micros() >> 12) & 0x3fff | 0x8000,
      random(0, 0xffffffff),
      millis() & 0xffff);

  return String(value);
}

bool postJson(const String& path, const String& body, String& response) {
  if (WiFi.status() != WL_CONNECTED) {
    return false;
  }

  HTTPClient http;
  String url = String(API_URL) + path;
  bool secureApi = url.startsWith("https://");
  WiFiClient client;
  std::unique_ptr<BearSSL::WiFiClientSecure> secureClient;

  if (secureApi) {
    secureClient.reset(new BearSSL::WiFiClientSecure);
    // For production, replace this with the API CA certificate.
    secureClient->setInsecure();

    if (!http.begin(*secureClient, url)) {
      return false;
    }
  } else {
    if (!http.begin(client, url)) {
      return false;
    }
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Id", DEVICE_ID);
  http.addHeader("X-Device-Credential", DEVICE_CREDENTIAL);

  int code = http.POST(body);
  response = http.getString();
  Serial.print("HTTP ");
  Serial.print(code);
  Serial.print(" ");
  Serial.println(response);
  http.end();

  return code >= 200 && code < 300;
}

void heartbeat() {
  StaticJsonDocument<256> doc;
  doc["firmwareVersion"] = "1.0.0";
  doc["signalStrength"] = WiFi.RSSI();

  String body;
  String response;
  serializeJson(doc, body);
  postJson("/device/heartbeat", body, response);
}

void scan() {
  String card = uid();
  StaticJsonDocument<512> doc;
  String eventId = eventUuid();

  doc["eventId"] = eventId;
  doc["idempotencyKey"] = eventId;
  doc["cardUid"] = card;

  String body;
  String response;
  serializeJson(doc, body);
  screen("Sending card...", card);

  if (!postJson("/device/scans", body, response)) {
    screen("Server unavailable", "Scan not accepted", "Retry when online");
    beep(1, 700);
    return;
  }

  StaticJsonDocument<512> result;
  if (deserializeJson(result, response)) {
    screen("Invalid response");
    beep(1, 700);
    return;
  }

  const char* code = result["resultCode"] | "UNKNOWN";

  if (String(code) == "CHECK_IN_OK") {
    screen("Check-in confirmed", "Have a good lecture");
    beep(1, 100);
  } else if (String(code) == "CHECK_OUT_OK") {
    screen("Check-out confirmed", "Session completed");
    beep(2, 100);
  } else {
    screen("Card rejected", code);
    beep(1, 700);
  }

  delay(1800);
  screen("Wi-Fi: Connected", "Scan Your ID Card");
}

void setup() {
  pinMode(BUZZER, OUTPUT);
  digitalWrite(BUZZER, LOW);
  Serial.begin(115200);
  Wire.begin(D2, D1);

  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  SPI.begin();
  rfid.PCD_Init();
  randomSeed(ESP.getChipId() ^ micros());

  wifi();
  heartbeat();
  screen("Wi-Fi: Connected", "Scan Your ID Card");
}

void loop() {
  wifi();

  if (millis() - lastHeartbeat > HEARTBEAT_MS) {
    heartbeat();
    lastHeartbeat = millis();
  }

  if (millis() - lastScan < DEBOUNCE_MS ||
      !rfid.PICC_IsNewCardPresent() ||
      !rfid.PICC_ReadCardSerial()) {
    delay(25);
    return;
  }

  lastScan = millis();
  scan();
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
}
