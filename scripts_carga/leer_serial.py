import sys
import time
import serial

port = sys.argv[1] if len(sys.argv) > 1 else "COM11"
seconds = float(sys.argv[2]) if len(sys.argv) > 2 else 12

s = serial.Serial()
s.port = port
s.baudrate = 115200
s.timeout = 0.2
s.dtr = False  # No reiniciar ni entrar a modo descarga al abrir
s.rts = False
s.open()

time.sleep(0.5)
s.write(b"ESTADO\r\n")
end = time.time() + seconds
while time.time() < end:
    data = s.read(512)
    if data:
        sys.stdout.write(data.decode("utf-8", "replace"))
        sys.stdout.flush()
s.close()
