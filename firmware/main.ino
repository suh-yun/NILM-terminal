#include <Arduino.h>
#include <arduinoFFT.h>
#include <ArduinoJson.h>
#include <WiFi.h>
#include <WebServer.h>
#include "model_code.h"

// 네트워크 설정(숨김)

// 하드웨어 설정
const int sensorHighPin = 34;
const int sensorLowPin  = 35;
const int redLedPin = 16;
const int whiteLedPin = 17;
const int recoveryButtonPin = 18;
const int IN1 = 12; const int IN2 = 13;
const int IN3 = 14; const int IN4 = 15;

// 전역 변수 및 샘플링 설정
volatile bool bResetRequest = false;
const float vRef = 3.3;
const int adcRes = 4095;
const float voltageDividerRatio = 2.0;
const float currentSens = 0.1;

float offsetHigh = 0, offsetLow = 0;
float curRMS_H = 0, curRMS_L = 0;
String finalState = "None";
bool isBlocked = false;

#define SAMPLES 128
#define SAMPLING_FREQ 5000 
double vRealH[SAMPLES], vImagH[SAMPLES], vRealL[SAMPLES], vImagL[SAMPLES];
ArduinoFFT<double> FFTH = ArduinoFFT<double>(vRealH, vImagH, SAMPLES, SAMPLING_FREQ);
ArduinoFFT<double> FFTL = ArduinoFFT<double>(vRealL, vImagL, SAMPLES, SAMPLING_FREQ);

// 분류 라벨 (4종)
const char* labels[4] = {"AirClean", "Charger", "None", "Pot"};

struct ChannelFeatures {
    float rms;
    float h1, h3, h5, h7;
};

// 타임아웃 및 루틴 변수
unsigned long deviceStartTime = 0;
unsigned long restStartTime = 0;
String lastDetectedState = "None";
bool isInRestMode = false;

// 함수 선언
void pulseRelay(int pin);
void IRAM_ATTR resetRelay();
void calibrateOffsets();
ChannelFeatures getFeatures(char chType, int pin, float offset);
String classifyIntegrated(ChannelFeatures h, ChannelFeatures l);
String getSmoothedState(String current);
void applyPowerPolicy(String state, float rms);
void executeCut(String reason);
void handleData();

void setup() {
    Serial.begin(115200);
    pinMode(redLedPin, OUTPUT); pinMode(whiteLedPin, OUTPUT);
    pinMode(IN1, OUTPUT); pinMode(IN2, OUTPUT);
    pinMode(IN3, OUTPUT); pinMode(IN4, OUTPUT);
    pinMode(recoveryButtonPin, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(recoveryButtonPin), resetRelay, FALLING);

    // 초기 전원 ON
    pulseRelay(IN1); pulseRelay(IN3);
    digitalWrite(redLedPin, HIGH); digitalWrite(whiteLedPin, HIGH);

    calibrateOffsets();

    WiFi.config(local_IP, gateway, subnet, primaryDNS);
    WiFi.begin(ssid, password);
    while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
    
    server.on("/data", handleData);
    server.begin();
    Serial.println("\nSystem Ready.");
}

void loop() {
    // 복구 요청 처리
    if (bResetRequest) {
        pulseRelay(IN1); pulseRelay(IN3);
        digitalWrite(redLedPin, HIGH); digitalWrite(whiteLedPin, HIGH);
        isBlocked = false; isInRestMode = false; bResetRequest = false;
        Serial.println("\n[SYSTEM] Manual Recovery Done.");
    }

    // 데이터 수집 및 특징 추출
    ChannelFeatures dataH = getFeatures('H', sensorHighPin, offsetHigh);
    ChannelFeatures dataL = getFeatures('L', sensorLowPin, offsetLow);
    curRMS_H = dataH.rms; curRMS_L = dataL.rms;

    // Raw 상태 판별
    String rawState;
    if (curRMS_H < 0.12 && curRMS_L < 0.12) {
        rawState = "None";
    } else {
        rawState = classifyIntegrated(dataH, dataL); 
    }

    // Smoothing
    String smoothed = getSmoothedState(rawState);

    // 시리얼 출력 로직
    if (rawState != smoothed) {
        // [SEARCHING] 판단이 바뀌는 과도기 (전류값 노출)
        Serial.printf("\n[SEARCHING...] Raw: %-8s | H: %.3fA | L: %.3fA", 
                      rawState.c_str(), curRMS_H, curRMS_L);
    } 
    else {
        // [CONFIRMED] 상태가 안정되었을 때
        static String lastPrinted = ""; 
        if (lastPrinted != smoothed) {
            Serial.println("\n-------------------------------------------");
            Serial.printf(">>> DETECTED & STABLE: [%s] <<<\n", smoothed.c_str());
            Serial.println("-------------------------------------------");
            lastPrinted = smoothed; 
        }
        
        // 안정기 유지 로그 (3초 주기)
        static unsigned long lastLog = 0;
        if (millis() - lastLog > 3000) {
            Serial.printf("\n[RUNNING] %-8s | H: %.3fA | L: %.3fA | Monitoring...\n", 
                          smoothed.c_str(), curRMS_H, curRMS_L);
            lastLog = millis();
        }
    }

    // 전역 변수 업데이트 및 정책 적용
    finalState = smoothed; 
    if (!isBlocked) {
        applyPowerPolicy(finalState, (finalState == "Pot") ? curRMS_H : curRMS_L);
    }
    
    server.handleClient();
}

// 특징 추출 함수
ChannelFeatures getFeatures(char chType, int pin, float offset) {
    double* vReal = (chType == 'H') ? vRealH : vRealL;
    double* vImag = (chType == 'H') ? vImagH : vImagL;
    ArduinoFFT<double>& FFT = (chType == 'H') ? FFTH : FFTL;
    double sumSq = 0;

    for (int i = 0; i < SAMPLES; i++) {
        float raw = (float)analogRead(pin);
        float v = (raw * vRef / adcRes) * voltageDividerRatio;
        float instI = (v - offset) / currentSens;
        vReal[i] = (double)instI; vImag[i] = 0;
        sumSq += (double)instI * (double)instI;
        delayMicroseconds(150);
    }
    float rms = sqrt(sumSq / SAMPLES);
    
    FFT.compute(FFT_FORWARD);
    FFT.complexToMagnitude();
    float scale = (float)SAMPLES / 2.0;

    return { 
        rms, 
        (float)(vReal[1]/scale), 
        (float)(vReal[3]/scale), 
        (float)(vReal[5]/scale), 
        (float)(vReal[7]/scale) 
    };
}

// 식별 함수
String classifyIntegrated(ChannelFeatures h, ChannelFeatures l) {
    double rawInput[10] = {
        (double)h.rms, (double)h.h1, (double)h.h3, (double)h.h5, (double)h.h7,
        (double)l.rms, (double)l.h1, (double)l.h3, (double)l.h5, (double)l.h7
    };

    double means[10] = {
        1.91246506, 0.87259487, 0.39324263, 0.00936362, 0.00944792, 
        0.34491426, 0.09765417, 0.04177212, 0.11520913, 0.00988622
    }; 
    
    double stds[10] = {
        2.62120733, 1.20290411, 0.54772122, 0.01054804, 0.01073448, 
        0.27874845, 0.08104531, 0.03526061, 0.1052322, 0.00732302
    };

    double scaledInput[10];
    for(int i = 0; i < 10; i++) {
        if (stds[i] > 0.000001) {
            scaledInput[i] = (rawInput[i] - means[i]) / stds[i];
        } else {
            scaledInput[i] = rawInput[i] - means[i];
        }
    }

    double output4[4] = {0, 0, 0, 0};
    score(scaledInput, output4); 

    int bestIdx = 2; // 기본값 None
    double bestVal = -1.0;
    for (int i = 0; i < 4; i++) {
        if (output4[i] > bestVal) {
            bestVal = output4[i];
            bestIdx = i;
        }
    }

    return String(labels[bestIdx]);
}

// 전력 차단 방침 함수
void applyPowerPolicy(String state, float rms) {
    if (state != lastDetectedState) { deviceStartTime = millis(); lastDetectedState = state; }
    if (state == "None") return;

    // 커피포트(Pot) 30분 차단
    if (state == "Pot" && (millis() - deviceStartTime > 30000)) {
        executeCut("Pot Safety Timeout");
    }
    // 충전기(Charger) 완충 차단
    if (state == "Charger" && rms < 0.05) {
        executeCut("Charger Eco Cut");
    }
    // 공기청정기(AirClean) 루틴
    if (state == "AirClean" && !isInRestMode && (millis() - deviceStartTime > 3600000)) {
        pulseRelay(IN2); digitalWrite(whiteLedPin, LOW);
        isBlocked = true; isInRestMode = true; restStartTime = millis();
    }
    if (isInRestMode && (millis() - restStartTime > 900000)) {
        pulseRelay(IN1); digitalWrite(whiteLedPin, HIGH);
        isBlocked = false; isInRestMode = false; deviceStartTime = millis();
    }
}

void executeCut(String reason) {
    if (lastDetectedState == "Pot") { pulseRelay(IN4); digitalWrite(redLedPin, LOW); }
    else { pulseRelay(IN2); digitalWrite(whiteLedPin, LOW); }
    isBlocked = true;
    Serial.printf("\n--- [CUT] %s ---\n", reason.c_str());
}

void pulseRelay(int pin) { digitalWrite(pin, HIGH); delay(100); digitalWrite(pin, LOW); }

void IRAM_ATTR resetRelay() { bResetRequest = true; }

void calibrateOffsets() {
    uint32_t sH = 0, sL = 0;
    for(int i=0; i<2000; i++) { 
        sH += analogRead(sensorHighPin); 
        sL += analogRead(sensorLowPin); 
        delayMicroseconds(200); 
    }

    offsetHigh = ((float)sH / 2000.0 * vRef / adcRes) * voltageDividerRatio;
    offsetLow  = ((float)sL / 2000.0 * vRef / adcRes) * voltageDividerRatio;
}

String getSmoothedState(String current) {
    static String history[5]; static int idx = 0;
    history[idx] = current; idx = (idx+1)%5;
    int c[4]={0};
    for(int i=0; i<5; i++) for(int j=0; j<4; j++) if(history[i]==labels[j]) c[j]++;
    int b=0; for(int i=1; i<4; i++) if(c[i]>c[b]) b=i;
    return labels[b];
}

void handleData() {
    JsonDocument doc; doc["rmsH"] = curRMS_H; doc["rmsL"] = curRMS_L; doc["finalState"] = finalState;
    String res; serializeJson(doc, res);
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.send(200, "application/json", res);
}
