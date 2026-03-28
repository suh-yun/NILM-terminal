# =====================
# [수정 1] 기본 설정 동일
# =====================
import serial
import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
import numpy as np

PORT = 'COM5'
BAUD = 115200
ser = serial.Serial(PORT, BAUD, timeout=1)

# =====================
# [수정 2] 그래프를 2채널로 분리 (High / Low)
# =====================
fig, axs = plt.subplots(2, 2, figsize=(12, 8))
plt.subplots_adjust(hspace=0.4, wspace=0.3)

# High 채널
lineH_time, = axs[0, 0].plot([], [], color='blue')
axs[0, 0].set_title("HIGH Channel Waveform")
axs[0, 0].set_ylabel("Current (A)")
axs[0, 0].grid(True)

lineH_fft, = axs[1, 0].plot([], [], color='red')
axs[1, 0].set_title("HIGH Channel FFT")
axs[1, 0].set_xlabel("Frequency (Hz)")
axs[1, 0].grid(True)

# Low 채널
lineL_time, = axs[0, 1].plot([], [], color='green')
axs[0, 1].set_title("LOW Channel Waveform")
axs[0, 1].grid(True)

lineL_fft, = axs[1, 1].plot([], [], color='orange')
axs[1, 1].set_title("LOW Channel FFT")
axs[1, 1].set_xlabel("Frequency (Hz)")
axs[1, 1].grid(True)

# =====================
# [수정 3] 채널별 데이터 처리
# =====================
def update(frame):
    if ser.in_waiting > 0:
        line_data = ser.readline().decode('utf-8').strip()

        try:
            parts = line_data.split(',')
            channel = parts[0]            # 'H' or 'L'
            waveform = np.array([float(v) for v in parts[1:]])
            n = len(waveform)

            if n < 10:
                return lineH_time, lineH_fft, lineL_time, lineL_fft

            fft_data = np.abs(np.fft.rfft(waveform))
            freqs = np.fft.rfftfreq(n, d=(0.02 / n))

            if channel == 'H':
                lineH_time.set_data(np.arange(n), waveform)
                axs[0, 0].set_xlim(0, n)
                axs[0, 0].set_ylim(min(waveform) - 1, max(waveform) + 1)

                lineH_fft.set_data(freqs, fft_data)
                axs[1, 0].set_xlim(0, 500)
                axs[1, 0].set_ylim(0, max(fft_data[1:]) + 5)

            elif channel == 'L':
                lineL_time.set_data(np.arange(n), waveform)
                axs[0, 1].set_xlim(0, n)
                axs[0, 1].set_ylim(min(waveform) - 1, max(waveform) + 1)

                lineL_fft.set_data(freqs, fft_data)
                axs[1, 1].set_xlim(0, 500)
                axs[1, 1].set_ylim(0, max(fft_data[1:]) + 5)

        except Exception:
            pass

    return lineH_time, lineH_fft, lineL_time, lineL_fft

# =====================
# [수정 4] 애니메이션 실행
# =====================
ani = FuncAnimation(fig, update, interval=50, blit=False)
plt.show()
