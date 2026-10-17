# ESP8266 wiring and flashing

## Pin map

| Component | Signal | NodeMCU |
|---|---|---|
| RC522 | SDA/SS | D8 (GPIO15) |
| RC522 | SCK/MOSI/MISO | D5/D7/D6 |
| RC522 | RST | D0 (GPIO16) |
| SSD1306 | SDA/SCL | D2/D1 |
| Buzzer | signal | D4 (GPIO2) |

Power the RC522 and SSD1306 from 3.3 V. Do not connect RC522 signals or power to
5 V. Use a transistor/driver if the selected active buzzer exceeds the ESP8266
GPIO current recommendation. D8 and D4 are boot-sensitive pins: keep attached
circuits from forcing an invalid level during reset. Confirm the exact
NodeMCU board pinout before production assembly.

Install `MFRC522`, `Adafruit GFX`, `Adafruit SSD1306`, and `ArduinoJson` using
Arduino IDE Library Manager. Select an ESP8266 NodeMCU 1.0 board, configure
Wi-Fi/API/device values, and flash over USB.

The example intentionally does not disable TLS validation safely: replace the
placeholder trust anchor in production with the API certificate chain. Never
ship production credentials in source or commit them. Device credentials must
be provisioned per device and rotated/revoked by an administrator.
