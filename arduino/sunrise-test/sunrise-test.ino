// NeoPixel Ring simple sketch (c) 2013 Shae Erisson
// Released under the GPLv3 license to match the rest of the
// Adafruit NeoPixel library

#include <Adafruit_NeoPixel.h>
#ifdef __AVR__
 #include <avr/power.h> // Required for 16 MHz Adafruit Trinket
#endif

#define PIN        6 
#define NUMPIXELS  3

// When setting up the NeoPixel library, we tell it how many pixels,
// and which pin to use to send signals. Note that for older NeoPixel
// strips you might need to change the third parameter -- see the
// strandtest example for more information on possible values.
Adafruit_NeoPixel pixels(NUMPIXELS, PIN, NEO_GRBW + NEO_KHZ800);

#define DELAYVAL 500 // Time (in milliseconds) to pause between pixels

struct RGB {
    int r, g, b;
    RGB(int red, int green, int blue) : r(red), g(green), b(blue) {}
};

void setup() {
  // These lines are specifically to support the Adafruit Trinket 5V 16 MHz.
  // Any other board, you can remove this part (but no harm leaving it):
#if defined(__AVR_ATtiny85__) && (F_CPU == 16000000)
  clock_prescale_set(clock_div_1);
#endif
  // END of Trinket-specific code.

  pixels.begin(); // INITIALIZE NeoPixel strip object (REQUIRED)
  pixels.clear(); // Set all pixel colors to 'off'
  pixels.show();  // Turn OFF all pixels ASAP
  pixels.setBrightness(0);

  // setPixelHue(2, 300, 0);
  // setPixelHue(1, 35, 200);
  // setPixelHue(0, 300, 200);
  // setPixelHue(1, 160, 100);
  // pixels.setPixelColor(1, 0, 50, 255, 250);
  // pixels.setPixelColor(0, 0, 255, 0, 250);
  pixels.setPixelColor(2, 50, 200, 0, 120);

  pixels.show();
}

void loop() {
}



RGB hueToRGB(float hue) {
    float c = 1.0f; // Assume maximum saturation and value (chroma)
    float x = c * (1 - abs(fmod(hue / 60.0f, 2) - 1));
    float m = 0.0f; // Adjust brightness

    float r, g, b;

    if (hue >= 0 && hue < 60) {
        r = c; g = x; b = 0;
    } else if (hue >= 60 && hue < 120) {
        r = x; g = c; b = 0;
    } else if (hue >= 120 && hue < 180) {
        r = 0; g = c; b = x;
    } else if (hue >= 180 && hue < 240) {
        r = 0; g = x; b = c;
    } else if (hue >= 240 && hue < 300) {
        r = x; g = 0; b = c;
    } else {
        r = c; g = 0; b = x;
    }

    // Convert to 0-255 range
    int red = (int)((r + m) * 255);
    int green = (int)((g + m) * 255);
    int blue = (int)((b + m) * 255);

    return RGB(red, green, blue);
}

void setPixelHue(int i, float hue, int w) {
  RGB color = hueToRGB(hue);
  pixels.setPixelColor(i, pixels.Color(color.g, color.r, color.b, w));
}
