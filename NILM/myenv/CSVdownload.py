import serial
import csv
import os
from datetime import datetime

# =====================
# [설정] 환경에 맞게 수정하세요
# =====================
PORT = 'COM5'
BAUD = 115200
CSV_FILE = "nilm_features.csv"
LABEL = "Airclean"  # 수집 중인 기기 이름으로 변경 (Indu, Charger, Pot, AirClean 등)
ser = serial.Serial(PORT, BAUD, timeout=1)

# =====================
# [준비] CSV 헤더 생성
# =====================
if not os.path.exists(CSV_FILE):
    with open(CSV_FILE, mode='w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow([
            "time", "channel", "current_rms",
            "H1", "H3", "H5", "H7", "Label"
        ])

print(f"🚀 [{LABEL}] 데이터 수집 시작 (아두이노 연산 데이터 수신 중...)")
print("중단하시려면 터미널에서 Ctrl+C를 누르세요.\n")

try:
    while True:
        if ser.in_waiting > 0:
            # 1. 아두이노에서 보낸 한 줄 읽기 (형식: H,RMS,H1,H3,H5,H7)
            line_data = ser.readline().decode('utf-8', errors='ignore').strip()

            if not line_data:
                continue

            try:
                # 2. 데이터 분리
                parts = line_data.split(',')

                # 데이터 개수 확인 (채널 + 특징 5개 = 총 6개여야 함)
                if len(parts) != 6:
                    continue

                channel = parts[0]  # 'H' 또는 'L'
                rms_val = float(parts[1])
                h1 = float(parts[2])
                h3 = float(parts[3])
                h5 = float(parts[4])
                h7 = float(parts[5])

                # 3. CSV 저장
                now = datetime.now().strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                with open(CSV_FILE, mode='a', newline='') as f:
                    writer = csv.writer(f)
                    writer.writerow([
                        now, channel,
                        f"{rms_val:.4f}",
                        f"{h1:.4f}", f"{h3:.4f}",
                        f"{h5:.4f}", f"{h7:.4f}",
                        LABEL
                    ])

                # 수집 현황 출력
                print(f"[{now}] [{channel}] {LABEL:10} | RMS:{rms_val:.3f} | H1:{h1:.3f} | H3:{h3:.3f} | H5:{h5:.3f} | H7:{h7:.3f}")

            except (ValueError, IndexError):
                # 데이터가 깨져서 들어올 경우 무시
                pass
            except Exception as e:
                print(f"오류 발생: {e}")

except KeyboardInterrupt:
    print("\n🛑 데이터 수집을 종료합니다.")
finally:
    ser.close()
