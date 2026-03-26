#include <Arduino.h>
#include <arduinoFFT.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <WebServer.h>
#include "model_code.h"



const char* ssid = "Swtddddnnnn";    
const char* password = "274926392";

IPAddress local_IP(10, 63, 101, 69); 
IPAddress gateway(10, 63, 101, 1);  
IPAddress subnet(255, 255, 255, 0); 
IPAddress primaryDNS(8, 8, 8, 8);  


WebServer server(80);

const int sensorHighPin = 34;
const int sensorLowPin  = 35;
const float vRef = 3.3;
const int adcRes = 4095;
const float voltageDividerRatio = 2.0;


const float sensitivityH = 0.1;  
const float sensitivityL = 0.185;


float offsetHigh = 0;
float offsetLow  = 0;
float curRMS_H = 0, curRMS_L = 0;
String finalState = "None";


unsigned long deviceStartTime = 0;  
unsigned long restStartTime = 0;    
String lastDetectedState = "None";  
bool isInRestMode = false;         


#define SAMPLES 128
#define SAMPLING_FREQ 1000
double vRealH[SAMPLES], vImagH[SAMPLES], vRealL[SAMPLES], vImagL[SAMPLES];
ArduinoFFT<double> FFTH = ArduinoFFT<double>(vRealH, vImagH, SAMPLES, SAMPLING_FREQ);
ArduinoFFT<double> FFTL = ArduinoFFT<double>(vRealL, vImagL, SAMPLES, SAMPLING_FREQ);


#define WINDOW_SIZE 5
String stateHistory[WINDOW_SIZE];
int historyIdx = 0;


#define RELAY_PIN 5 
bool isBlocked = false;


struct ChannelFeatures {
    float rms;
    float h1, h3, h5, h7;
};


void IRAM_ATTR resetRelay() {
    if(isBlocked = false) {
        digitalWrite(RELAY_PIN, HIGH); 
        Serial.println("Power restored via switch.");
    }
}


void setup() {
    Serial.begin(115200);
    calibrateOffsets(); 

    if (!WiFi.config(local_IP, gateway, subnet, primaryDNS)) {
        Serial.println("Static IP 설정 실패");
    }

    WiFi.begin(ssid, password);
    Serial.print("WiFi 연결 시도 중");
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
   
    Serial.println("\nWiFi 연결 성공");
    Serial.print("고정 IP 주소: ");
    Serial.println(WiFi.localIP());


    server.on("/data", handleData);
    server.begin();

    pinMode(4, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(4), resetRelay, FALLING);
}


void loop() {
    ChannelFeatures dataH = getFeatures('H', sensorHighPin, offsetHigh);
    ChannelFeatures dataL = getFeatures('L', sensorLowPin, offsetLow);
   
    curRMS_H = dataH.rms;
    curRMS_L = dataL.rms;
    finalState = classifyIntegrated(dataH, dataL);


    Serial.printf("H: %.3f A | L: %.3f A | State: %s\n", curRMS_H, curRMS_L, finalState.c_str());
    delay(50);


    String rawState = classifyIntegrated(dataH, dataL);
    String finalState = getSmoothedState(rawState); // Temporal Smoothing 적용

    if (!isBlocked) {
        applyPowerPolicy(finalState, dataH.rms);
    }


    server.handleClient(); 
}


void calibrateOffsets() {
    analogSetAttenuation(ADC_11db);
    Serial.println("\n--- Calibration Starting ---");
    for(int i=0; i<5; i++) {
        Serial.print(".");
        delay(1000);
    }
   
    uint32_t sumRawHigh = 0, sumRawLow = 0;
    const int numSamples = 4000;


    for(int i = 0; i < 100; i++) {
        analogRead(sensorHighPin);
        analogRead(sensorLowPin);
        delayMicroseconds(100);
    }


    for(int i = 0; i < numSamples; i++) {
        sumRawHigh += analogRead(sensorHighPin);
        sumRawLow  += analogRead(sensorLowPin);
        delayMicroseconds(250);
    }


    offsetHigh = ((float)sumRawHigh / numSamples * vRef / adcRes) * voltageDividerRatio;
    offsetLow  = ((float)sumRawLow  / numSamples * vRef / adcRes) * voltageDividerRatio;


    Serial.printf("\nOffset H: %.4f V / L: %.4f V\n", offsetHigh, offsetLow);
}

ChannelFeatures getFeatures(char chType, int pin, float offset) {
    double* vReal = (chType == 'H') ? vRealH : vRealL;
    double* vImag = (chType == 'H') ? vImagH : vImagL;
    ArduinoFFT<double>& FFT = (chType == 'H') ? FFTH : FFTL;
    float currentSens = (chType == 'H') ? sensitivityH : sensitivityL;
   
    double sumSq = 0;
    for (int i = 0; i < SAMPLES; i++) {
        int raw = analogRead(pin);
        float v = (raw * vRef / adcRes) * voltageDividerRatio;
        float instCurrent = (v - offset) / currentSens;
       
        vReal[i] = (double)instCurrent;
        vImag[i] = 0;
        sumSq += (double)instCurrent * (double)instCurrent;
        delayMicroseconds(500);
    }


    float rms = sqrt(sumSq / SAMPLES);
    if (rms < 0.05) rms = 0;


    FFT.windowing(FFT_WIN_TYP_HAMMING, FFT_FORWARD);
    FFT.compute(FFT_FORWARD);
    FFT.complexToMagnitude();


    return { rms, (float)vReal[8], (float)vReal[23], (float)vReal[38], (float)vReal[54] };
}



String classifyIntegrated(ChannelFeatures h, ChannelFeatures l) {
    double inputH[5] = { (double)h.rms, (double)h.h1, (double)h.h3, (double)h.h5, (double)h.h7 };
    double inputL[5] = { (double)l.rms, (double)l.h1, (double)l.h3, (double)l.h5, (double)l.h7 };
   
    double outputH[6] = {0}, outputL[6] = {0};

    score(inputH, outputH);
    score(inputL, outputL);

    double finalOutput[6];
    int bestIdx = 0;
    double bestVal = -1.0;


    for (int i = 0; i < 6; i++) {
        finalOutput[i] = (outputH[i] * 0.4) + (outputL[i] * 0.6); // H채널과 L채널의 예측 결과 가중치 결합
        if (finalOutput[i] > bestVal) {
            bestVal = finalOutput[i];
            bestIdx = i;
        }
    }


    const char* labels[6] = {"None", "Pot", "Charger", "AirClean_high", "AirClean_low", "Indu"};
    return String(labels[bestIdx]);
}

String getSmoothedState(String current) {
    stateHistory[historyIdx] = current;
    historyIdx = (historyIdx + 1) % WINDOW_SIZE;

    String modes[6] = {"None", "Pot", "Charger", "AirClean_high", "AirClean_low", "Indu"};
    int counts[6] = {0};
    for(int i=0; i<WINDOW_SIZE; i++) {
        for(int j=0; j<6; j++) {
            if(stateHistory[i] == modes[j]) counts[j]++;
        }
    }
    int best = 0;
    for(int i=1; i<6; i++) if(counts[i] > counts[best]) best = i;
    return modes[best];
}

void applyPowerPolicy(String state, float rms) {
    // 1. 상태 변화 감지 및 타이머 초기화
    if (state != lastDetectedState) {
        deviceStartTime = millis();    // 상태가 바뀌면 타이머 리셋
        lastDetectedState = state;
    }

    if (isBlocked && !isInRestMode) return;

    float expectedRMS = 0;
    if (state == "Pot") expectedRMS = 5.0;         // 포트 약 5A
    else if (state == "Indu") expectedRMS = 7.0;   // 인덕션 약 7A
    else if (state == "Charger") expectedRMS = 0.2; // 충전기 약 0.2A
   
    if (expectedRMS > 0 && rms > expectedRMS * 1.5) {
        executeCut("Anomaly Detected: Overcurrent (1.5x)");
        return;
    }

    if (state == "Pot" || state == "Indu") {
        if (millis() - deviceStartTime > 1800000) { // 30분(30 * 60 * 1000)
            executeCut("Safety Timeout: High-heat device left for 30m");
            return;
        }
    }

    if (state == "Charger") {
        if (rms > 0.01 && rms < 0.05) { // 사용 중이다가 0.05A 이하로 떨어지면
            executeCut("Eco Mode: Charger fully charged (Low RMS)");
            return;
        }
    }

    if (state == "AirClean_high" && !isInRestMode) {
        if (millis() - deviceStartTime > 3600000) { // 1시간 가동 시
            digitalWrite(RELAY_PIN, LOW); // 15분간 휴식 시작
            isBlocked = true;
            isInRestMode = true;
            restStartTime = millis();
            Serial.println("Smart Routine: AirClean High 1h - Resting 15m");
        }
    }
   
    if (isInRestMode) {
        if (millis() - restStartTime > 900000) { // 15분 휴식 끝
            digitalWrite(RELAY_PIN, HIGH);
            isBlocked = false;
            isInRestMode = false;
            deviceStartTime = millis(); // 가동 시간 초기화
            Serial.println("Smart Routine: Rest finished. Power Restored.");
        }
    }
}


void executeCut(String reason) {
    digitalWrite(RELAY_PIN, LOW);
    isBlocked = true;
    Serial.print("--- [POWER CUT] --- Reason: ");
    Serial.println(reason);
}

void handleData() {
    JsonDocument doc;
    doc["rmsH"] = String(curRMS_H, 3);
    doc["rmsL"] = String(curRMS_L, 3);
    doc["finalState"] = finalState;
    String response; serializeJson(doc, response);
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", response);
}

