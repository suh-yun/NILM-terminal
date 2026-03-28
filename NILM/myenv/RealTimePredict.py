# =====================
# [수정 1] 기본 설정 동일
# =====================
import pandas as pd
import numpy as np
import serial
import joblib

model = joblib.load('nilm_model.pkl')
feature_cols = ['current', 'H1', 'H3', 'H5', 'H7']
ser = serial.Serial('COM5', 115200, timeout=1)

# =====================
# [수정 2] 채널별 상태 기억
# =====================
last_status = {
    "H": "",
    "L": ""
}

print("--- NILM 실시간 모니터링 시작 (채널별 상태 출력) ---")

try:
    while True:
        if ser.in_waiting > 0:
            line = ser.readline().decode('utf-8', errors='ignore').strip()
            try:
                # =====================
                # [수정 3] 채널(H/L) 분리 파싱
                # =====================
                parts = line.split(',')
                channel = parts[0]                     # 'H' or 'L'
                waveform = np.array([float(v) for v in parts[1:]])

                if len(waveform) < 10:
                    continue

                # =====================
                # [수정 4] 특징 추출
                # =====================
                current_val = np.sqrt(np.mean(waveform ** 2))
                fft_raw = np.abs(np.fft.rfft(waveform))
                h1 = fft_raw[1] if len(fft_raw) > 1 else 0
                h3 = fft_raw[3] if len(fft_raw) > 3 else 0
                h5 = fft_raw[5] if len(fft_raw) > 5 else 0
                h7 = fft_raw[7] if len(fft_raw) > 7 else 0

                # =====================
                # [수정 5] 상태 결정 (채널별)
                # =====================
                if current_val < 0.3:
                    current_status = "대기 중 (None)"
                else:
                    input_data = pd.DataFrame(
                        [[current_val, h1, h3, h5, h7]],
                        columns=feature_cols
                    )
                    prob_array = model.predict_proba(input_data)
                    prob = np.max(prob_array) * 100

                    if prob > 80:
                        current_status = f"탐지됨: [{model.predict(input_data)[0]}]"
                    else:
                        current_status = "분석 중 (불확실)"

                # =====================
                # [수정 6] 채널별 상태 변화 출력
                # =====================
                if current_status != last_status[channel]:
                    print(f"[{pd.Timestamp.now().strftime('%H:%M:%S')}] "
                          f"[{channel}] {current_status}")
                    last_status[channel] = current_status

            except Exception:
                pass

except KeyboardInterrupt:
    print("\n시스템 종료")
    ser.close()
