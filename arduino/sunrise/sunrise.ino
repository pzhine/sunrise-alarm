// Include Mouse library
#include <Mouse.h>

// NeoPixel library
#include <Adafruit_NeoPixel.h>

// Audio amplifier library
#include "Adafruit_TPA2016.h"

#define AGC_MODE_POP        1
#define AGC_MODE_CLASSICAL  2
#define AGC_MODE_JAZZ       3
#define AGC_MODE_HIPHOP     4
#define AGC_MODE_ROCK       5
#define AGC_MODE_VOICE      6

Adafruit_TPA2016 audioamp = Adafruit_TPA2016();

// serial input constants
#define INPUT_BUFFER_SIZE 64
#define MAX_INPUT_PARAMS 10
#define INPUT_DELIMETER ' '

// Strip identifiers for lerpLedTo
#define STRIP_SUN_CENTER 0
#define STRIP_SUN_RING   1
#define STRIP_LAMP       2

// Which pin on the Arduino is connected to the NeoPixels?
#define CENTER_PIN   6
#define RING_PIN     5
#define LAMP_PIN     9

// How many NeoPixels are attached to the Arduino?
#define CENTER_PIXELS  2
#define RING_PIXELS    12 
#define BOTTOM_PIXELS  1

// Rotary Encoder Pins
#define ENCODER_PIN_A 7
#define ENCODER_PIN_B 8
#define ENCODER_PIN_C 4
#define SCROLL_SENSITIVITY 3 // Adjust sensitivity of scroll (higher = more sensitive)

// Init NeoPixel library
Adafruit_NeoPixel center_pixels(CENTER_PIXELS, CENTER_PIN, NEO_RGBW + NEO_KHZ800);
Adafruit_NeoPixel ring_pixels(RING_PIXELS, RING_PIN, NEO_GRB + NEO_KHZ800);
Adafruit_NeoPixel bottom_pixels(BOTTOM_PIXELS, LAMP_PIN, NEO_RGBW + NEO_KHZ800);
#define CENTER_BRIGHTNESS 255
#define RING_BRIGHTNESS   255
#define BOTTOM_BRIGHTNESS 255

// Rotary encoder state
volatile int lastEncoded = 0;
volatile long encoderValue = 0;
long lastEncoderValue = 0;
int lastMSB = 0;
int lastLSB = 0;

// Serial INPUT for Unipixel comms
char *inputBuffer = new char[INPUT_BUFFER_SIZE];
size_t inputBufferIndex = 0;
bool inputBufferReady = false;
char* inputParams[MAX_INPUT_PARAMS];  // Array to store pointers to tokens
int inputParamCount = 0; // Number of params extracted

// Other state
bool testIsHigh = false;

// Structures for LED color management
struct RGBW {
  int r, g, b, w;
  RGBW(int red, int green, int blue, int white) : r(red), g(green), b(blue), w(white) {}
  RGBW() : r(0), g(0), b(0), w(0) {}
};

// Define color channel indices
#define CHANNEL_R 0
#define CHANNEL_G 1
#define CHANNEL_B 2
#define CHANNEL_W 3
#define CHANNEL_COUNT 4

// Structure for keeping track of LED transitions per channel
struct LedTransition {
  bool active;
  int stripId;
  int pixel;
  int channelId;      // Which channel this transition is for (R, G, B, or W)
  int startValue;     // Start value for this channel
  int targetValue;    // Target value for this channel
  unsigned long startTime;
  unsigned long duration;
  
  LedTransition() : active(false), stripId(0), pixel(0), channelId(0), startValue(0), targetValue(0), startTime(0), duration(0) {}
};

// Track active LED transitions (increased to support per-channel transitions)
#define MAX_TRANSITIONS 20
LedTransition ledTransitions[MAX_TRANSITIONS];
unsigned long lastTransitionCheck = 0;

void handleSerialCommand() {
  if (strcmp(inputParams[0], "TEST") == 0) {
    digitalWrite(13, testIsHigh ? LOW : HIGH);
    testIsHigh = !testIsHigh;
  } else if (strcmp(inputParams[0], "LERP_LED") == 0) {
    // Parse parameters: strip, pixel, r, g, b, w, duration
    if (inputParamCount >= 8) {
      int stripId = atoi(inputParams[1]);
      int pixel = atoi(inputParams[2]);
      int r = atoi(inputParams[3]); // Allow -1 for unchanged
      int g = atoi(inputParams[4]); // Allow -1 for unchanged
      int b = atoi(inputParams[5]); // Allow -1 for unchanged
      int w = atoi(inputParams[6]); // Allow -1 for unchanged
      unsigned long duration = atol(inputParams[7]);
      
      lerpLedTo(stripId, pixel, r, g, b, w, duration);
    }
  } else if (strcmp(inputParams[0], "SET_BRIGHTNESS") == 0) {
    // Parse parameters: strip, brightness
    if (inputParamCount >= 3) {
      int stripId = atoi(inputParams[1]);
      int brightness = constrain(atoi(inputParams[2]), 0, 255);
      if (stripId == STRIP_SUN_CENTER) {
        center_pixels.setBrightness(brightness);
      } else if (stripId == STRIP_LAMP) {
        bottom_pixels.setBrightness(brightness);
      }
    }
  }
}

void setup() {
  //start serial connection
  Serial.begin(9600);
  //configure pin 2 as an input and enable the internal pull-up resistor
  pinMode(ENCODER_PIN_C, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  
  // Initialize rotary encoder pins
  pinMode(ENCODER_PIN_A, INPUT_PULLUP);
  pinMode(ENCODER_PIN_B, INPUT_PULLUP);
  
  // Read the initial state of the encoder
  lastEncoded = (digitalRead(ENCODER_PIN_A) << 1) | digitalRead(ENCODER_PIN_B);
  
  // Initialize the Mouse library
  Mouse.begin();

  // Start NeoPixels
  ring_pixels.begin();
  ring_pixels.setBrightness(RING_BRIGHTNESS);
  center_pixels.begin(); 
  center_pixels.setBrightness(CENTER_BRIGHTNESS);
  bottom_pixels.begin();
  bottom_pixels.setBrightness(BOTTOM_BRIGHTNESS);
  
  ring_pixels.clear(); 
  center_pixels.clear();
  bottom_pixels.clear();

  ring_pixels.show();
  center_pixels.show();
  bottom_pixels.show();

  // start audio
  audioamp.begin();
  audioamp.setGain(0);
  audioamp.setLimitLevel(18);
  setAgcMode(AGC_MODE_JAZZ);
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

void parseSerialCommand() {
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

void readAndHandleSerialCommands() {
  if (inputBufferReady) {
    inputBufferReady = false;
    parseSerialCommand();
    handleSerialCommand();
    freeInputParams();
    Serial.print("ACK ");
    Serial.println(inputBuffer);
  }
  // read from serial until newline
  readSerialInput();
}

void readAndHandleButton() {
  //read the pushbutton value into a variable
  int sensorVal = digitalRead(ENCODER_PIN_C);
 
  // LOW when it's pressed. Toggle test LED (pin 13) when the
  // button'spressed
  if (sensorVal == LOW) {
    Mouse.click(MOUSE_RIGHT); // Simulate a right mouse click
    digitalWrite(13, testIsHigh ? LOW : HIGH);
  } else {
    digitalWrite(13, testIsHigh ? HIGH : LOW);
  }
}

void handleRotaryEncoder() {
  // Read the current state of the encoder pins
  int MSB = digitalRead(ENCODER_PIN_A);
  int LSB = digitalRead(ENCODER_PIN_B);
  
  // Converting the 2 pin values to a single number
  int encoded = (MSB << 1) | LSB;
  
  // Determine direction based on the current and previous encoder values
  int sum = (lastEncoded << 2) | encoded;
  
  // Clockwise rotation (0010, 1101, 1011, 0100) - decimal values 2, 13, 11, 4
  if(sum == 2 || sum == 13 || sum == 11 || sum == 4) {
    encoderValue++;
  }
  // Counter-clockwise rotation (0001, 0111, 1110, 1000) - decimal values 1, 7, 14, 8
  else if(sum == 1 || sum == 7 || sum == 14 || sum == 8) {
    encoderValue--;
  }
  
  lastEncoded = encoded;
  
  // Send mouse scroll events if there's significant movement
  if(encoderValue > lastEncoderValue + SCROLL_SENSITIVITY) {
    Mouse.move(0, 0, -1); // Scroll up
    lastEncoderValue = encoderValue;
  }
  else if(encoderValue < lastEncoderValue - SCROLL_SENSITIVITY) {
    Mouse.move(0, 0, 1); // Scroll down
    lastEncoderValue = encoderValue;
  }
}

void lerpLedTo(int stripId, int pixel, int r, int g, int b, int w, unsigned long duration) {
  // Ensure stripId is valid
  if (stripId != STRIP_SUN_CENTER && stripId != STRIP_LAMP) {
    return;
  }

  // Get the current color of the pixel
  int currentR = 0, currentG = 0, currentB = 0, currentW = 0;
  if (stripId == STRIP_SUN_CENTER) {
    if (pixel >= 0 && pixel < CENTER_PIXELS) {
      uint32_t color = center_pixels.getPixelColor(pixel);
      currentW = (color >> 24) & 0xFF;
      currentR = (color >> 16) & 0xFF;
      currentG = (color >> 8) & 0xFF;
      currentB = color & 0xFF;
    } else {
      return; // Invalid pixel
    }
  } else if (stripId == STRIP_LAMP) {
    if (pixel >= 0 && pixel < BOTTOM_PIXELS) {
      uint32_t color = bottom_pixels.getPixelColor(pixel);
      currentW = (color >> 24) & 0xFF;
      currentR = (color >> 16) & 0xFF;
      currentG = (color >> 8) & 0xFF;
      currentB = color & 0xFF;
    } else {
      return; // Invalid pixel
    }
  }

  // Store the target color values in an array for easier processing
  int currentValues[CHANNEL_COUNT] = {currentR, currentG, currentB, currentW};
  int targetValues[CHANNEL_COUNT] = {r, g, b, w};
  
  // Process each channel
  for (int channel = 0; channel < CHANNEL_COUNT; channel++) {
    // Skip this channel if target is -1 (meaning: leave unchanged)
    if (targetValues[channel] == -1) {
      continue;
    }
    
    // Constrain the target value to valid range
    targetValues[channel] = constrain(targetValues[channel], 0, 255);
    
    // Find a transition slot for this channel
    int slotIndex = -1;
    
    // First try to find an existing transition for this pixel+strip+channel to replace
    for (int i = 0; i < MAX_TRANSITIONS; i++) {
      if (ledTransitions[i].active && 
          ledTransitions[i].stripId == stripId && 
          ledTransitions[i].pixel == pixel &&
          ledTransitions[i].channelId == channel) {
        slotIndex = i;
        break;
      }
    }
    
    // If no existing transition found for this channel, find an inactive slot
    if (slotIndex == -1) {
      for (int i = 0; i < MAX_TRANSITIONS; i++) {
        if (!ledTransitions[i].active) {
          slotIndex = i;
          break;
        }
      }
    }
    
    // If still no slot available, find the oldest transition and replace it
    if (slotIndex == -1) {
      unsigned long oldestTime = millis();
      for (int i = 0; i < MAX_TRANSITIONS; i++) {
        if (ledTransitions[i].startTime < oldestTime) {
          oldestTime = ledTransitions[i].startTime;
          slotIndex = i;
        }
      }
    }
    
    // Initialize the transition for this channel
    LedTransition& transition = ledTransitions[slotIndex];
    transition.active = true;
    transition.stripId = stripId;
    transition.pixel = pixel;
    transition.channelId = channel;
    transition.startValue = currentValues[channel];
    transition.targetValue = targetValues[channel];
    transition.startTime = millis();
    transition.duration = duration;
  }
}

// Update LED transitions based on elapsed time
void updateLedTransitions() {
  unsigned long currentTime = millis();
  
  // Arrays to track which pixels need updating
  bool centerPixelsUpdated[CENTER_PIXELS] = {false};
  bool bottomPixelsUpdated[BOTTOM_PIXELS] = {false};
  
  // Current color values for each pixel being processed
  int centerColors[CENTER_PIXELS][CHANNEL_COUNT];
  int bottomColors[BOTTOM_PIXELS][CHANNEL_COUNT];
  
  // First, get the current color values for all pixels
  for (int p = 0; p < CENTER_PIXELS; p++) {
    uint32_t color = center_pixels.getPixelColor(p);
    centerColors[p][CHANNEL_W] = (color >> 24) & 0xFF;
    centerColors[p][CHANNEL_R] = (color >> 16) & 0xFF;
    centerColors[p][CHANNEL_G] = (color >> 8) & 0xFF;
    centerColors[p][CHANNEL_B] = color & 0xFF;
  }
  
  for (int p = 0; p < BOTTOM_PIXELS; p++) {
    uint32_t color = bottom_pixels.getPixelColor(p);
    bottomColors[p][CHANNEL_W] = (color >> 24) & 0xFF;
    bottomColors[p][CHANNEL_R] = (color >> 16) & 0xFF;
    bottomColors[p][CHANNEL_G] = (color >> 8) & 0xFF;
    bottomColors[p][CHANNEL_B] = color & 0xFF;
  }
  
  // Process each transition
  for (int i = 0; i < MAX_TRANSITIONS; i++) {
    LedTransition& transition = ledTransitions[i];
    
    if (transition.active) {
      // Calculate the elapsed time and progress
      unsigned long elapsed = currentTime - transition.startTime;
      float progress = min(1.0f, (float)elapsed / transition.duration);
      
      // Calculate the interpolated value for this channel
      int interpolatedValue = transition.startValue + 
                            ((transition.targetValue - transition.startValue) * progress);
      
      // Update the appropriate color array based on strip and pixel
      if (transition.stripId == STRIP_SUN_CENTER && transition.pixel < CENTER_PIXELS) {
        centerColors[transition.pixel][transition.channelId] = interpolatedValue;
        centerPixelsUpdated[transition.pixel] = true;
      } 
      else if (transition.stripId == STRIP_LAMP && transition.pixel < BOTTOM_PIXELS) {
        bottomColors[transition.pixel][transition.channelId] = interpolatedValue;
        bottomPixelsUpdated[transition.pixel] = true;
      }
      
      // Mark transition as inactive if complete
      if (progress >= 1.0) {
        transition.active = false;
      }
    }
  }
  
  // Update pixels with new color values
  bool centerUpdated = false;
  bool bottomUpdated = false;
  
  for (int p = 0; p < CENTER_PIXELS; p++) {
    if (centerPixelsUpdated[p]) {
      center_pixels.setPixelColor(p, 
                               centerColors[p][CHANNEL_R],
                               centerColors[p][CHANNEL_G],
                               centerColors[p][CHANNEL_B],
                               centerColors[p][CHANNEL_W]);
      centerUpdated = true;
    }
  }
  
  for (int p = 0; p < BOTTOM_PIXELS; p++) {
    if (bottomPixelsUpdated[p]) {
      bottom_pixels.setPixelColor(p,
                               bottomColors[p][CHANNEL_R],
                               bottomColors[p][CHANNEL_G],
                               bottomColors[p][CHANNEL_B],
                               bottomColors[p][CHANNEL_W]);
      bottomUpdated = true;
    }
  }
  
  // Update strips only if changes were made
  if (centerUpdated) {
    center_pixels.show();
  }
  if (bottomUpdated) {
    bottom_pixels.show();
  }
}

void setAgcMode(int mode) {
  switch (mode) {
    case AGC_MODE_POP: {
      setAgcParams(TPA2016_AGC_4, 2, 1300, 137);
      break;
    }
    case AGC_MODE_CLASSICAL: {
      setAgcParams(TPA2016_AGC_2, 2.56, 1150, 137);
      break;
    }
    case AGC_MODE_JAZZ: {
      setAgcParams(TPA2016_AGC_2, 8, 3288, 0);
      break;
    }
    case AGC_MODE_ROCK: {
      setAgcParams(TPA2016_AGC_2, 3.84, 4110, 0);
      break;
    }
    case AGC_MODE_HIPHOP: {
      setAgcParams(TPA2016_AGC_4, 2, 1640, 0);
      break;
    }
    case AGC_MODE_VOICE: {
      setAgcParams(TPA2016_AGC_4, 2.56, 1640, 0);
      break;
    }
  }
}

//  TPA2016_AGC_2 (1:2 compression)
//  TPA2016_AGC_4 (1:4 compression)
//  TPA2016_AGC_8 (1:8 compression)
void setAgcParams(int compression, int attack, int release, int hold) {
  audioamp.setAGCCompression(compression);
  audioamp.setAttackControl(attack);
  audioamp.setReleaseControl(release);
  audioamp.setHoldControl(hold);
}

// Main loop
void loop() {
  readAndHandleSerialCommands();
  readAndHandleButton();
  handleRotaryEncoder();
  
  // Update LED transitions at most every 16ms (approx. 60fps)
  unsigned long currentTime = millis();
  if (currentTime - lastTransitionCheck >= 16) {
    updateLedTransitions();
    lastTransitionCheck = currentTime;
  }
}
