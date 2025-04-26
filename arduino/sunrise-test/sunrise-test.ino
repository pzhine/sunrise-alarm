// NeoPixel Ring simple sketch (c) 2013 Shae Erisson
// Released under the GPLv3 license to match the rest of the
// Adafruit NeoPixel library

#include <Adafruit_NeoPixel.h>
#ifdef __AVR__
 #include <avr/power.h> // Required for 16 MHz Adafruit Trinket
#endif

// Which pin on the Arduino is connected to the NeoPixels?
#define CENTER_PIN   6
#define RING_PIN     5

// How many NeoPixels are attached to the Arduino?
#define CENTER_PIXELS  2
#define RING_PIXELS    12 

// When setting up the NeoPixel library, we tell it how many pixels,
// and which pin to use to send signals. Note that for older NeoPixel
// strips you might need to change the third parameter -- see the
// strandtest example for more information on possible values.
Adafruit_NeoPixel center_pixels(CENTER_PIXELS, CENTER_PIN, NEO_RGBW + NEO_KHZ800);
Adafruit_NeoPixel ring_pixels(RING_PIXELS, RING_PIN, NEO_GRB + NEO_KHZ800);

#define CENTER_BRIGHTNESS 255
#define RING_BRIGHTNESS   255

void setup() {
  ring_pixels.begin();
  ring_pixels.setBrightness(RING_BRIGHTNESS);
  center_pixels.begin(); 
  center_pixels.setBrightness(CENTER_BRIGHTNESS);
  
  ring_pixels.clear(); 
  center_pixels.clear();

  center_pixels.setPixelColor(1, 0, 0, 255, 0);
  center_pixels.show();
}

int sunbright = 0;
unsigned long lastIncrementTime = 0;

float center0bright = 1;
float center1bright = 0;

float r, g, b, w;

void loop() {
  incrementEveryNms(sunbright, 50); 

  if (sunbright > 750) {
    sunbright = 0;
    center0bright = 1;
    center1bright = 0;
  }

  if (sunbright > 300) {
    center0bright = max(0, 1 - ((float)sunbright - 300)/100);
  }

  r = max(0, (sunbright > 200 ? 200 - (sunbright - 200) : sunbright)) * center0bright;
  g = 0;
  b = max(0, (sunbright > 200 ? 200 - (sunbright - 200) : sunbright)) * center0bright;
  w = min(255, (sunbright > 100 ? sunbright - 100 : 0)) * center0bright;

  center_pixels.setPixelColor(0, center_pixels.Color((int)r,0,(int)b,(int)w));

  if (sunbright > 10) {
    center1bright = min(1, ((float)sunbright - 10)/100);
  }

  Serial.print(sunbright);
  Serial.print(" ");
  Serial.println(center1bright);

  r = min(255, (sunbright > 50 ? sunbright - 50 : 0)) * center1bright;
  g = 0;
  b = max(100, (sunbright < 300 ? 255 : 255 - (sunbright - 300))) * center1bright;
  w = min(255, (sunbright > 180 ? sunbright - 180 : 0)) * center1bright;

  float r2 = max(0, 200 - (sunbright - 250));

  center_pixels.setPixelColor(1, center_pixels.Color(
    sunbright < 250 ? (int)r : int(r2),
    0,
    (int)b,
    (int)w
  ));


  center_pixels.show();

  runTheaterChaseWithDissolve(
    ring_pixels,
    12,                    // numLeds
    3000,                   // stepInterval (ms)
    50,                    // fadeSteps
    ring_pixels.Color(255, 0, 0),// active color (red)
    ring_pixels.Color(0, 0, 255)   // background color (black)
  );
}

void incrementEveryNms(int &value, unsigned long interval) {
  unsigned long now = millis();
  if (now - lastIncrementTime >= interval) {
    lastIncrementTime = now;
    value++;
  }
}

void runTheaterChaseWithDissolve(
  Adafruit_NeoPixel &strip,
  uint16_t numLeds,
  unsigned long stepInterval,
  uint8_t fadeSteps,
  uint32_t activeColor,
  uint32_t bgColor
) {
  static uint8_t chaseOffset = 0;
  static unsigned long lastStepTime = 0;
  static bool running = false;
  static uint8_t nextOffset;
  static uint8_t fadeStep = 0;

  unsigned long now = millis();

  if (!running && (now - lastStepTime >= stepInterval)) {
    lastStepTime = now;
    nextOffset = (chaseOffset + 1) % 3;
    fadeStep = 0;
    running = true;
  }

  if (running) {
    float blend = (float)fadeStep / fadeSteps;

    for (int i = 0; i < numLeds; i++) {
      bool isLitCurrent = ((i + chaseOffset) % 3 == 0);
      bool isLitNext = ((i + nextOffset) % 3 == 0);

      uint32_t blended = blendColors(
        isLitCurrent ? activeColor : bgColor,
        isLitNext ? activeColor : bgColor,
        blend
      );

      strip.setPixelColor(i, blended);
    }

    strip.show();

    fadeStep++;
    delay(stepInterval / fadeSteps);

    if (fadeStep > fadeSteps) {
      chaseOffset = nextOffset;
      running = false;
    }
  }
}

uint32_t blendColors(uint32_t color1, uint32_t color2, float t) {
  uint8_t r1 = (color1 >> 16) & 0xFF;
  uint8_t g1 = (color1 >> 8) & 0xFF;
  uint8_t b1 = color1 & 0xFF;

  uint8_t r2 = (color2 >> 16) & 0xFF;
  uint8_t g2 = (color2 >> 8) & 0xFF;
  uint8_t b2 = color2 & 0xFF;

  uint8_t r = r1 + (r2 - r1) * t;
  uint8_t g = g1 + (g2 - g1) * t;
  uint8_t b = b1 + (b2 - b1) * t;

  return ring_pixels.Color(r, g, b);
}