// Include Mouse library
#include <Mouse.h>

// serial input constants
#define INPUT_BUFFER_SIZE 64
#define MAX_INPUT_PARAMS 10
#define INPUT_DELIMETER ' '


// Rotary Encoder Pins
#define ENCODER_PIN_A 3
#define ENCODER_PIN_B 4
#define SCROLL_SENSITIVITY 2 // Adjust sensitivity of scroll (higher = more sensitive)

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

void setup() {
  //start serial connection
  Serial.begin(9600);
  //configure pin 2 as an input and enable the internal pull-up resistor
  pinMode(2, INPUT_PULLUP);
  pinMode(13, OUTPUT);
  
  // Initialize rotary encoder pins
  pinMode(ENCODER_PIN_A, INPUT_PULLUP);
  pinMode(ENCODER_PIN_B, INPUT_PULLUP);
  
  // Read the initial state of the encoder
  lastEncoded = (digitalRead(ENCODER_PIN_A) << 1) | digitalRead(ENCODER_PIN_B);
  
  // Initialize the Mouse library
  Mouse.begin();
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

void handleSerialCommand() {
  if (strcmp(inputParams[0], "TEST") == 0) {
    digitalWrite(13, testIsHigh ? LOW : HIGH);
    testIsHigh = !testIsHigh;
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
  int sensorVal = digitalRead(2);
 
  // LOW when it's pressed. Toggle test LED (pin 13) when the
  // button's pressed
  if (sensorVal == LOW) {
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

void loop() {
  readAndHandleSerialCommands();
  readAndHandleButton();
  handleRotaryEncoder();
}
