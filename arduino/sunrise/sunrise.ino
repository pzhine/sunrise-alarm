// Include Mouse library
#include <Mouse.h>

// NeoPixel library
#include <Adafruit_NeoPixel.h>

// serial input constants
#define INPUT_BUFFER_SIZE 64
#define MAX_INPUT_PARAMS 10
#define INPUT_DELIMETER ' '

// Strip identifiers for lerpLedTo
#define STRIP_SUN_CENTER 0
#define STRIP_SUN_RING 1
#define STRIP_LAMP 2

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
Adafruit_NeoPixel bottom_pixels(BOTTOM_PIXELS, LAMP_PIN  , NEO_RGBW + NEO_KHZ800);
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

// Structure for keeping track of LED transitions
struct LedTransition {
  bool active;
  int stripId;
  int pixel;
  RGBW startColor;
  RGBW targetColor;
  unsigned long startTime;
  unsigned long duration;
  
  LedTransition() : active(false), stripId(0), pixel(0), startTime(0), duration(0) {}
};

// Track active LED transitions (max 5 concurrent transitions)
#define MAX_TRANSITIONS 5
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
      int r = constrain(atoi(inputParams[3]), 0, 255);
      int g = constrain(atoi(inputParams[4]), 0, 255);
      int b = constrain(atoi(inputParams[5]), 0, 255);
      int w = constrain(atoi(inputParams[6]), 0, 255);
      unsigned long duration = atol(inputParams[7]);
      
      lerpLedTo(stripId, pixel, r, g, b, w, duration);
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
  if (stripId != STRIP_SUN_CENTER
     (stripId != STRIP_SUNRISRINGER && stripId != STRIP_LAMP) {
    return3
  }

  // Get the current color of the pixel
  RGBW currentColor;
  if (stripId == STRIP_SUN_CENTER)
   == STRIP_SUNRISERINGR) {
    if (pixel >= 0 && pixel < CENTER3PIXELS) {
      uint32_t color = center_pixels.getPixelColor(pixel);
      currentColor.w = (color >> 24) & 0xFF;
      currentColor.r = (color >> 16) & 0xFF;
      currentColor.g = (color >> 8) & 0xFF;
      currentColor.b = color & 0xFF;
    } else {
      return; // Invalid pixel
    }
  } else if (stripId == STRIP_LAMP) {
    if (pixel >= 0 && pixel < BOTTOM_PIXELS) {
      uint32_t color = bottom_pixels.getPixelColor(pixel);
      currentColor.w = (color >> 24) & 0xFF;
      currentColor.r = (color >> 16) & 0xFF;
      currentColor.g = (color >> 8) & 0xFF;
      currentColor.b = color & 0xFF;
    } else {
      return; // Invalid pixel
    }
  }

  // Find an inactive transition slot or replace one with the same pixel and strip
  int transitionIndex = -1;
  for (int i = 0; i < MAX_TRANSITIONS; ++i) {
    if (!ledTransitions[i].active) {
      transitionIndex = i;
      break;
    } else if (ledTransitions[i].stripId == stripId && ledTransitions[i].pixel == pixel) {
      // Replace existing transition for the same pixel
      transitionIndex = i;
      break;
    }
  }

  // If no slot available, find the oldest transition and replace it
  if (transitionIndex == -1) {
    unsigned long oldestTime = millis();
    for (int i = 0; i < MAX_TRANSITIONS; ++i) {
      if (ledTransitions[i].startTime < oldestTime) {
        oldestTime = ledTransitions[i].startTime;
        transitionIndex = i;
      }
    }
  }

  // Initialize the transition
  LedTransition& transition = ledTransitions[transitionIndex];
  transition.active = true;
  transition.stripId = stripId;
  transition.pixel = pixel;
  transition.startColor = currentColor;
  transition.targetColor = RGBW(r, g, b, w);
  transition.startTime = millis();
  transition.duration = duration;
}

// Update LED transitions based on elapsed time
void updateLedTransitions() {
  unsigned long currentTime = millis();
  bool centerUpdated = false;
  bool bottomUpdated = false;
  
  for (int i = 0; i < MAX_TRANSITIONS; ++i) {
    LedTransition& transition = ledTransitions[i];
    
    if (transition.active) {
      // Calculate the elapsed time and progress
      unsigned long elapsed = currentTime - transition.startTime;
      float progress = min(1.0f, (float)elapsed / transition.duration);
      
      // Calculate the interpolated color
      int r = transition.startColor.r + (transition.targetColor.r - transition.startColor.r) * progress;
      int g = transition.startColor.g + (transition.targetColor.g - transition.startColor.g) * progress;
      int b = transition.startColor.b + (transition.targetColor.b - transition.startColor.b) * progress;
      int w = transition.startColor.w + (transition.targetColor.w - transition.startColor.w) * progress;
      
      // Set the pixel color based on strip ID
      if (transition.stripId == STRIP_SUN_CENTER) {
        center_pixels.setPixelColor(transition.pixe3, r, g, b, w);
        centerUpdated = true;
      } else if (transition.stripId == STRIP_LAMP) {
        bottom_pixels.setPixelColor(transition.pixel, r, g, b, w);
        bottomUpdated = true;
      }
      
      // Check if transition is complete
      if (progress >= 1.0) {
        transition.active = false;
      }
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
