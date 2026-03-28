import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier
from sklearn.metrics import accuracy_score, classification_report
import joblib
import m2cgen as m2c

# 1. 데이터 로딩
print("📦 CSV 로딩 중...")
df = pd.read_csv("nilm_features.csv")

# 2. 데이터 전처리 (H와 L 채널 결합)
# 같은 시간에 측정된 H와 L을 한 줄로 합치는 과정입니다.
df_h = df[df['channel'] == 'H'].reset_index(drop=True)
df_l = df[df['channel'] == 'L'].reset_index(drop=True)

# 개수가 안 맞을 경우 최소 개수에 맞춤
min_len = min(len(df_h), len(df_l))
df_h = df_h.iloc[:min_len]
df_l = df_l.iloc[:min_len]

# 특징 합치기 (H채널 5개 + L채널 5개 = 총 10개 피처)
combined_data = pd.DataFrame({
    "rms_H": df_h["current_rms"], "h1_H": df_h["H1"], "h3_H": df_h["H3"], "h5_H": df_h["H5"], "h7_H": df_h["H7"],
    "rms_L": df_l["current_rms"], "h1_L": df_l["H1"], "h3_L": df_l["H3"], "h5_L": df_l["H5"], "h7_L": df_l["H7"],
    "Label": df_h["Label"] # H와 L의 라벨은 같다고 가정
})

print("🧹 결측치 제거 전 개수:", len(combined_data))
combined_data = combined_data.dropna()
print("✅ 결합 후 데이터 개수:", len(combined_data))

# 3. 입력(X), 라벨(y) 설정
feature_cols = ["rms_H", "h1_H", "h3_H", "h5_H", "h7_H", "rms_L", "h1_L", "h3_L", "h5_L", "h7_L"]
X = combined_data[feature_cols].values
y = combined_data["Label"].values

# 4. Train / Test 분리
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# 5. 정규화
scaler = StandardScaler()
X_train = scaler.fit_transform(X_train)
X_test = scaler.transform(X_test)

# 6. 모델 학습
model = DecisionTreeClassifier(max_depth=7, random_state=42)
print("🧠 통합 채널 모델 학습 중...")
model.fit(X_train, y_train)

# 7. C 코드 변환 (에러가 난다면 이 부분 때문임)
print("📝 C 코드 생성 중 (model_code.h)...")
# model 객체만 단독으로 전달해야 합니다.
code = m2c.export_to_c(model)

with open("model_code.h", "w") as f:
    f.write(code)

# 8. 저장 (스케일러는 이제 필요 없으니 주석 처리)
joblib.dump(model, "nilm_model.pkl")
# joblib.dump(scaler, "nilm_scaler.pkl") # 주석 처리
print("\n💾 모델 저장 완료!")
print("Means:", scaler.mean_)
print("Std: ", scaler.scale_)
