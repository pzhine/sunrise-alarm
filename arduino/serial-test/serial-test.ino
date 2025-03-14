// serial input constants
#define INPUT_BUFFER_SIZE 64
#define MAX_INPUT_PARAMS 10
#define INPUT_DELIMETER ' '

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

void loop() {
  readAndHandleSerialCommands();
  readAndHandleButton();
}
