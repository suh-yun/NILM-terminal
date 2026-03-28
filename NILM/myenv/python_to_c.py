import joblib
import numpy as np

# 저장했던 스케일러 파일 불러오기
scaler = joblib.load("nilm_scaler.pkl")

print("// --- ESP32용 정규화 계수 ---")
print(f"double scaler_mean[] = {{ {', '.join(map(str, scaler.mean_))} }};")
# scaler.var_는 분산이므로 루트를 씌워 표준편차(std)로 변환
print(f"double scaler_std[]  = {{ {', '.join(map(str, np.sqrt(scaler.var_)))} }};")