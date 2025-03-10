#include <Adafruit_NeoPixel.h>
#ifdef __AVR__
 #include <avr/power.h> // Required for 16 MHz Adafruit Trinket
#endif

#define LED_PIN    6
#define LED2_PIN   3

// matrix setup
#define ROWS       8
#define COLS       8
#define CENTER     4

// Define a structure to represent RGB values
struct RGB {
    int r, g, b;
    RGB(int red, int green, int blue) : r(red), g(green), b(blue) {}
};

// Declare our NeoPixel strip object:
Adafruit_NeoPixel strip(ROWS * COLS, LED_PIN, NEO_GRB + NEO_KHZ800);
Adafruit_NeoPixel strip2(CENTER, LED2_PIN, NEO_GRBW + NEO_KHZ800);
// Adafruit_NeoPixel strip = strip2;

// setup() function -- runs once at startup --------------------------------

void setup() {
  // These lines are specifically to support the Adafruit Trinket 5V 16 MHz.
  // Any other board, you can remove this part (but no harm leaving it):
#if defined(__AVR_ATtiny85__) && (F_CPU == 16000000)
  clock_prescale_set(clock_div_1);
#endif
  // END of Trinket-specific code.

  strip.begin();           // INITIALIZE NeoPixel strip object (REQUIRED)
  strip2.begin();           // INITIALIZE NeoPixel strip object (REQUIRED)
  strip.show();            // Turn OFF all pixels ASAP
  strip2.show();            // Turn OFF all pixels ASAP
  strip.setBrightness(255); // Set BRIGHTNESS to about 1/5 (max = 255)
  strip2.setBrightness(0); // Set BRIGHTNESS to about 1/5 (max = 255)
  // strip.fill(strip.Color(255, 255, 255));
  // strip2.fill(strip.Color(0, 0, 0, 255));
  // strip.show(); 
  // strip2.show(); 

  Serial.begin(9600);
  linearGradient(hueToRGB(155), hueToRGB(15), 2, 0.5f);
  // radialGradient(hueToRGB(30), hueToRGB(30), 0.3f, 0.8f);
  centerPixelsFill(hueToRGB(30));
  strip.show();
  strip2.show();
}

// loop() function -- runs repeatedly as long as board is on ---------------

void loop() {
}

void centerPixelsFill(const RGB& color) {
  for (int i = 0; i < CENTER; i++) {
    strip2.setPixelColor(i, color.r, color.g, color.b, 255);
  }
}

void linearGradient(const RGB& start, const RGB& end, int steps, float center) {
  for (int i = 0; i < ROWS; i++) {
    // Calculate normalized position with center adjustment
    float t = (float)(i) / steps;
    if (center != 0.5f) {
        if (t < center) {
          t = 0.5f * pow(t / center, 2);
        } else {
          t = 1.0f - 0.5f * pow((1.0f - t) / (1.0f - center), 2);
        }
    }

    // Interpolate RGB values
    RGB color = interpolateRGB(start, end, t);

    // scale to 8-bit and set the pixel
    for (int j = 0; j < COLS; j++) {
      strip.setPixelColor(i * COLS + j, color.r, color.g, color.b);
    }
  }
}

// startHue int, 0 - 359
// endHue int, 0 - 359
void hsvGradient(int startHue, int endHue) {
  int d = abs(endHue - startHue);
  float y;
  int hue, s;
  uint32_t color; 

  for (int i = 0; i < ROWS; i++) {
    y = 1.0 * i / (ROWS - 1);
    s = (uint8_t)(d * y);
    hue = ((float)(startHue + s) / 360) * 65536L;
    color = strip.gamma32(strip.ColorHSV(hue)); // hue -> RGB

    // scale to 8-bit and set the pixel
    for (int j = 0; j < COLS; j++) {
      strip.setPixelColor(i * COLS + j, color);
    }
  }
}

// Function to convert a hue (0-359) to an RGB value
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

// Function to generate a radial gradient
void radialGradient(const RGB& centerColor, const RGB& edgeColor, double clampStart, double hardness) {
  // Center of the gradient
  double centerX = ROWS / 2.0;
  double centerY = COLS / 2.0;

  // Maximum distance from the center to the edge of the matrix
  double maxDistance = sqrt(centerX * centerX + centerY * centerY);

  for (int row = 0; row < ROWS; ++row) {
    for (int col = 0; col < COLS; ++col) {
      // Calculate the distance from the center
      double distance = sqrt((row - centerX) * (row - centerX) + (col - centerY) * (col - centerY));

      // Calculate the interpolation ratio based on the number of steps
      double ratio = min(distance / maxDistance, 1.0);

      // Apply clampStart to shift the gradient transition
      if (ratio < clampStart) {
        ratio = 0.0;
      } else {
        ratio = (ratio - clampStart) / (1.0 - clampStart);
      }

      // Apply hardness to make the transition sharper
      ratio = pow(ratio, 1.0 / (1.0 + hardness * 9.0));

      // Interpolate the RGB values
      RGB color = interpolateRGB(centerColor, edgeColor, ratio);

      // Set the pixel color
      strip.setPixelColor(row * COLS + col, color.r, color.g, color.b);
    }
  }
}

// Function to interpolate between two RGB values based on a ratio
RGB interpolateRGB(const RGB& color1, const RGB& color2, double ratio) {
    return RGB(
      (int)(color1.r + ratio * (color2.r - color1.r)),
      (int)(color1.g + ratio * (color2.g - color1.g)),
      (int)(color1.b + ratio * (color2.b - color1.b))
    );
}