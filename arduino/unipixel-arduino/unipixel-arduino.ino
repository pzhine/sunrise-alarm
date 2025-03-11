#include <Wire.h>
#include <Adafruit_NeoPixel.h>
#ifdef __AVR__
#include <avr/power.h>  // Required for 16 MHz Adafruit Trinket
#endif

// Which pin on the Arduino is connected to the NeoPixels?
// On a Trinket or Gemma we suggest changing this to 1:
#define LED_PIN 6

// How many NeoPixels are attached to the Arduino?
#define LED_COUNT 64

// NeoPixel brightness, 0 (min) to 255 (max)
#define BRIGHTNESS 255  // max = 255

// serial input constants
#define INPUT_BUFFER_SIZE 64
#define MAX_INPUT_PARAMS 10
#define INPUT_DELIMETER ' '

// Declare our NeoPixel strip object:
Adafruit_NeoPixel strip(LED_COUNT, LED_PIN, NEO_GRB + NEO_KHZ800);
// Argument 1 = Number of pixels in NeoPixel strip
// Argument 2 = Arduino pin number (most are valid)
// Argument 3 = Pixel type flags, add together as needed:
//   NEO_KHZ800  800 KHz bitstream (most NeoPixel products w/WS2812 LEDs)
//   NEO_KHZ400  400 KHz (classic 'v1' (not v2) FLORA pixels, WS2811 drivers)
//   NEO_GRB     Pixels are wired for GRB bitstream (most NeoPixel products)
//   NEO_RGB     Pixels are wired for RGB bitstream (v1 FLORA pixels, not v2)
//   NEO_RGBW    Pixels are wired for RGBW bitstream (NeoPixel RGBW products)

//Millis
unsigned long currentMillis = 0;
unsigned long previousLedPixelChangeMillis = 0;  //stores last time a strip pixel was updated
unsigned long previousReceiveCmdMillis = 0;      //stores last time it listened for commands

//Intervals
int ledChangeInterval = 100;
int receiveCmdInterval = 10;

//Colors
int brightness = BRIGHTNESS;
int progressColor[] = { 0, 255, 0, 0, 5 };
int solidColor[] = { 255, 0, 0, 0, 5 };
float animationRate;
int animationPixelLength;

//States
int currentPixelIndex = -1;
byte solidColorState = HIGH;
byte snakeAnimation = LOW;
int startPixelIndex = -1;
int endPixelIndex = LED_COUNT;
byte backwardsMode = LOW;
byte clearPixelsOutsideRange = LOW;

// Serial INPUT for Unipixel comms
char *inputBuffer = new char[INPUT_BUFFER_SIZE];
size_t inputBufferIndex = 0;
bool inputBufferReady = false;
char* inputParams[MAX_INPUT_PARAMS];  // Array to store pointers to tokens
int inputParamCount = 0; // Number of params extracted

// Define a structure to represent RGB values
struct RGB {
  int r, g, b;
  RGB(int red, int green, int blue) : r(red), g(green), b(blue) {}
};
struct RGBWA {
  int r, g, b, w, a;
  RGBWA(int red, int green, int blue, int white, int alpha) : r(red), g(green), b(blue), w(white), a(alpha) {}
};

void setup(void) {
  Serial.begin(9600);

  //neopixel init
  strip.begin(); 

  showDefault();
}

void loop(void) {
  currentMillis = millis();

  receiveCmdLoop();
  // updateColorProgress();

  // if (Serial.available()) {
  //   char inChar = (char)Serial.read();
  //   if (inChar == '\n') {
  //     stringComplete = true;
  //   } else {
  //     inputString += inChar;
  //   }
  // }
}

void receiveCmdLoop() {
  if (inputBufferReady) {
    inputBufferReady = false;
    processSerialInput();
    return;
  }

  // read from serial until newline
  readSerialInput();
}

void processSerialInput() {
  parseInputParams();
  // for (int i = 0; i < inputParamCount; i++) {
  //   Serial.print(i);
  //   Serial.print(" ");
  //   Serial.println(inputParams[i]);
  // }

  if (strcmp(inputParams[0], "SOLID_COLOR") == 0) {
    // Serial.println(">>SOLID_COLOR");
    processSetSolidColorCmd(RGBWA(
      atoi(inputParams[1]), 
      atoi(inputParams[2]), 
      atoi(inputParams[3]),
      atoi(inputParams[4]), 
      atoi(inputParams[5])
    ));
  } else
  if (strcmp(inputParams[0], "GRADIENT") == 0) {
    // Serial.println(">>GRADIENT");
  }
  freeInputParams();
  Serial.print("ACK ");
  Serial.println(inputBuffer);
}

void readSerialInput() {
  if (Serial.available() <= 0) {
    return;
  }
  char c = Serial.read(); // Read a single character
  if (c == '\n' || inputBufferIndex >= INPUT_BUFFER_SIZE - 1) { // End of line or buffer full
    inputBuffer[inputBufferIndex] = '\0'; // Null-terminate the string
    inputBufferReady = true; // flag the buffer ready to read
    inputBufferIndex = 0; // reset the index
    return;
  }
  inputBuffer[inputBufferIndex] = c; // Append character to buffer
  inputBufferIndex += 1;
}

void parseInputParams() {
  char* buffer = new char[strlen(inputBuffer) + 1]; // Allocate memory for a modifiable copy of the input
  strcpy(buffer, inputBuffer);  // Copy input to the buffer
  char delimiterStr[2] = {INPUT_DELIMETER, '\0'};  // Delimiter as a C-string
  char* token = strtok(buffer, delimiterStr); // Get the first token
  inputParamCount = 0;
  while (token != nullptr && inputParamCount < MAX_INPUT_PARAMS) {
    inputParams[inputParamCount] = new char[strlen(token) + 1]; // Allocate space for the token
    strcpy(inputParams[inputParamCount], token); // Copy token into tokens array
    inputParamCount += 1;
    token = strtok(nullptr, delimiterStr); // Get the next token
  }
  delete[] buffer; // Free the temporary buffer
}

void freeInputParams() {
  for (int i = 0; i < inputParamCount; ++i) {
    delete[] inputParams[i]; 
  }
}

// color loop stuff
int fadeVal=100, fadeMax=100;
int fadeStep = 4;
uint32_t firstPixelHue = 0;
int numRainbowLoops = 20;
int rainbowLoopCount = 0;

void showDefault() {
  strip.setBrightness(brightness);
  
  float W = 255 * fadeVal / fadeMax;
  //show default patterns
  strip.fill(strip.Color(strip.gamma8(W), strip.gamma8(W), strip.gamma8(W), strip.gamma8(W)));
  strip.show();
  solidColorState = HIGH; // stop animations
}

void processBrightnessCmd(String cmd) {
  brightness = cmd.substring(cmd.indexOf("B") + 1).toInt();
  strip.setBrightness(brightness);
  strip.show();
}

void processSetSolidColorCmd(const RGBWA& color) {
  solidColorState = HIGH;
  RGB color2 = applyAlphaValue(color);
  strip.fill(strip.Color(color2.r, color2.g, color2.b, color.w));
  strip.show();
}

// apply alpha value in RGBWA to RGB
RGB applyAlphaValue(const RGBWA& color) {
  RGB color2 = RGB(0, 0, 0);
  float v = (float)color.a / (float)255;
  color2.r = round(color.r * v);
  color2.g = round(color.g * v);
  color2.b = round(color.b * v);
  return color2;
}

// void processAnimationColorCmd(String cmd) {
//   Serial.println("processAnimationColorCmd: " + cmd);

//   //Get first color
//   String firstColorCmd = cmd.substring(cmd.indexOf("S") + 2, cmd.indexOf("X") - 1);

//   solidColor[0] = firstColorCmd.substring(firstColorCmd.indexOf("R") + 1, firstColorCmd.indexOf("G")).toInt();
//   solidColor[1] = firstColorCmd.substring(firstColorCmd.indexOf("G") + 1, firstColorCmd.indexOf("B")).toInt();
//   solidColor[2] = firstColorCmd.substring(firstColorCmd.indexOf("B") + 1, firstColorCmd.indexOf("W")).toInt();
//   solidColor[3] = firstColorCmd.substring(firstColorCmd.indexOf("W") + 1, firstColorCmd.indexOf("A")).toInt();
//   solidColor[4] = firstColorCmd.substring(firstColorCmd.indexOf("A") + 1).toInt();
//   applyAlphaValue(solidColor);

//   //Get second color
//   String secondColorCmd = cmd.substring(cmd.indexOf("X") + 2, cmd.indexOf("H") - 1);

//   progressColor[0] = secondColorCmd.substring(secondColorCmd.indexOf("R") + 1, secondColorCmd.indexOf("G")).toInt();
//   progressColor[1] = secondColorCmd.substring(secondColorCmd.indexOf("G") + 1, secondColorCmd.indexOf("B")).toInt();
//   progressColor[2] = secondColorCmd.substring(secondColorCmd.indexOf("B") + 1, secondColorCmd.indexOf("W")).toInt();
//   progressColor[3] = secondColorCmd.substring(secondColorCmd.indexOf("W") + 1, secondColorCmd.indexOf("A")).toInt();
//   progressColor[4] = secondColorCmd.substring(secondColorCmd.indexOf("A") + 1).toInt();
//   applyAlphaValue(progressColor);

//   //Get Animation pixel length
//   animationPixelLength = cmd.substring(cmd.indexOf("L") + 1).toInt();

//   //Get Animation start/end pixel
//   startPixelIndex = cmd.substring(cmd.indexOf("PS") + 2).toInt();
//   endPixelIndex = cmd.substring(cmd.indexOf("PE") + 2).toInt();

//   currentPixelIndex = startPixelIndex;

//   //Get Snake or or regular animation state
//   snakeAnimation = LOW;
//   if (cmd.indexOf("Anim2") >= 0) {
//     snakeAnimation = HIGH;
//     Serial.println("isSnake");
//   }

//   backwardsMode = LOW;
//   if (cmd.indexOf("Ba") >= 0) {
//     backwardsMode = HIGH;
//     Serial.println("isBack");
//   }

//   //Clear Pixels Outside Range
//   if (cmd.indexOf("_T") >= 0) {
//     clearPixelsOutsideRange = HIGH;

//     for (int i = 0; i < LED_COUNT; i++) {
//       if (i < startPixelIndex || i > endPixelIndex) {
//         strip.setPixelColor(i, strip.Color(0, 0, 0, 0));
//       }
//     }
//   }

//   //Get Animation rate (comes as seconds from Unity)
//   animationRate = cmd.substring(cmd.indexOf("H") + 1).toFloat() * 1000;

//   animationRate = animationRate / (endPixelIndex - startPixelIndex);  //Divide by length of animation in pixels so takes same amount regardless of length
  
  
//   //Set Solid Color
//   if (clearPixelsOutsideRange == LOW) {
//     strip.fill(strip.Color(solidColor[0], solidColor[1], solidColor[2], solidColor[3]));
//   } else {
//     strip.fill(strip.Color(solidColor[0], solidColor[1], solidColor[2], solidColor[3]), startPixelIndex, endPixelIndex);
//   }

//   strip.show();

//   //This line makes sure the animation starts from the beginning, otherwise it "catches up" to the current milli (interesting effect)
//   previousLedPixelChangeMillis = millis();

//   solidColorState = LOW;
// }

// void updateColorProgress() {
//   if (solidColorState == HIGH)
//     return;

//   if (millis() - previousLedPixelChangeMillis < animationRate)
//     return;

//   int drawAtIndex = currentPixelIndex % endPixelIndex;
//   //WRAP
//   if (backwardsMode == HIGH) {
//     drawAtIndex = endPixelIndex - drawAtIndex - 1;
//   }

//   //REGULAR ANIMATION
//   if (snakeAnimation == LOW) {
//     //REACHED END?
//     if (currentPixelIndex > 0 && (currentPixelIndex % endPixelIndex == 0)) {
//       // stop anim
//       solidColorState = HIGH;
//       return;
//     }
//   }
//   //SNAKE ANIMATION
//   else {
//     int removeAtIndex;
//     if (backwardsMode == LOW) {
//       removeAtIndex = (currentPixelIndex - animationPixelLength) % endPixelIndex;
//     } else {
//       removeAtIndex = (drawAtIndex + animationPixelLength) % endPixelIndex;
//     }
//     //Remove trail (snake)
//     strip.setPixelColor(removeAtIndex, strip.Color(solidColor[0], solidColor[1], solidColor[2], solidColor[3]));
//   }

//   strip.setPixelColor(drawAtIndex, strip.Color(progressColor[0], progressColor[1], progressColor[2], progressColor[3]));
  
//   previousLedPixelChangeMillis += animationRate;
  
//   currentPixelIndex++;

//   strip.show();
// }
