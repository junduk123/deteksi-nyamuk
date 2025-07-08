# 1. Impor semua library yang dibutuhkan
from flask import Flask, render_template, jsonify
import joblib
import numpy as np
import pandas as pd
import os
import firebase_admin
from firebase_admin import credentials, db
from datetime import datetime, timezone

# 2. Inisialisasi Aplikasi Flask
# Flask akan otomatis mencari folder 'templates' dan 'static'
app = Flask(__name__)

# 3. Inisialisasi Firebase & Model ML
try:
    # Memastikan path ke file kunci sudah benar
    cred_path = os.path.join(os.path.dirname(__file__), 'serviceAccountKey.json')
    cred = credentials.Certificate(cred_path)
    
    # Inisialisasi koneksi ke Firebase Realtime Database
    firebase_admin.initialize_app(cred, {
        'databaseURL': 'https://tugas-akhir-zaman-19c49-default-rtdb.asia-southeast1.firebasedatabase.app'
    })
    print("Koneksi ke Firebase Realtime Database berhasil.")
    
    # Memuat model machine learning Anda
    model_path = os.path.join(os.path.dirname(__file__), 'deteksi_nyamuk_model.pkl')
    model = joblib.load(model_path)
    print("Model ML berhasil dimuat.")

except Exception as e:
    # Menampilkan pesan error jika inisialisasi gagal
    print(f"ERROR KRITIS SAAT INISIALISASI: {e}")
    model = None

# ==================================
# RUTE HALAMAN (NAVIGASI)
# ==================================

# Rute 1: Untuk halaman utama (landing page)
@app.route('/')
def index():
    # Menampilkan file 'index.html' dari folder 'templates'
    return render_template('index.html')

# Rute 2: Untuk halaman dashboard ML
@app.route('/dashboard')
def dashboard():
    # Menampilkan file 'dashboard.html' dari folder 'templates'
    return render_template('dashboard.html')


# ==================================
# RUTE API (UNTUK MENYEDIAKAN DATA)
# ==================================

# Rute 3: API untuk menyediakan data analisis ML ke frontend
@app.route('/api/ml-analysis')
def get_ml_analysis():
    if not model:
        return jsonify({"error": "Model ML tidak berhasil dimuat di server."}), 500

    try:
        # Mengambil 1000 data terakhir dari Firebase
        db_ref = db.reference('/')
        all_data = db_ref.order_by_child('waktu').limit_to_last(1000).get()

        if not all_data:
            return jsonify({"error": "Tidak ada data di Firebase."}), 404
        
        # Mengubah data dari Firebase menjadi DataFrame Pandas
        df = pd.DataFrame.from_dict(all_data, orient='index')
        
        feature_cols = ['sensor_gas', 'sensor_kelembapan', 'sensor_suara', 'sensor_suhu']
        
        # Memastikan semua kolom yang dibutuhkan ada
        for col in feature_cols + ['waktu', 'deteksi_nyamuk']:
            if col not in df.columns:
                return jsonify({"error": f"Data dari Firebase tidak memiliki kolom '{col}'"}), 400

        # Membersihkan data
        for col in feature_cols:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        df.dropna(subset=feature_cols, inplace=True)

        if df.empty:
            return jsonify({"error": "Tidak ada data yang valid untuk diprediksi setelah proses pembersihan."}), 400
        
        # Mengolah data waktu
        df['waktu'] = df['waktu'].astype(str).str.replace(' at', '')
        df['waktu_dt'] = pd.to_datetime(df['waktu'], errors='coerce')
        df.dropna(subset=['waktu_dt'], inplace=True)
        df.sort_values(by='waktu_dt', inplace=True, ascending=False)
        
        if df.empty:
             return jsonify({"error": "Tidak ada data yang valid setelah konversi waktu."}), 400

        # Menjalankan prediksi dengan model ML
        features = df[feature_cols]
        df['prediksi_ml'] = model.predict(features)
        
        # Menghitung statistik dan analisis berdasarkan hasil ML
        total_data = len(df)
        probabilitas_keseluruhan = (df['prediksi_ml'].sum() / total_data) * 100 if total_data > 0 else 0
        tingkat_risiko = "Tinggi" if probabilitas_keseluruhan > 75 else "Sedang" if probabilitas_keseluruhan > 40 else "Rendah"
        
        today_start = pd.Timestamp.now(tz=timezone.utc).normalize()
        df_today = df[df['waktu_dt'] >= today_start]
        jumlah_deteksi_today = df_today['prediksi_ml'].sum()
        probabilitas_today = (jumlah_deteksi_today / len(df_today) * 100) if not df_today.empty else 0

        data_terakhir = df.iloc[0]

        # Menyiapkan data untuk dikirim ke frontend
        df_chart = df.copy()
        df_chart['status_ml'] = df_chart['prediksi_ml'].apply(lambda x: 'ada' if x == 1 else 'tidak ada')
        df_chart.rename(columns={
            'waktu_dt': 'timestamp',
            'sensor_suara': 'sound',
            'sensor_suhu': 'temperature',
            'sensor_kelembapan': 'humidity',
            'sensor_gas': 'co2',
            'status_ml': 'status'
        }, inplace=True)

        # Mengemas semua hasil ke dalam format JSON
        output = {
            "stats_cards": {
                "total_deteksi_hari_ini": int(jumlah_deteksi_today),
                "suhu": float(data_terakhir['sensor_suhu']),
                "kelembapan": float(data_terakhir['sensor_kelembapan']),
                "kualitas_udara": int(data_terakhir['sensor_gas']),
                "level_suara": float(data_terakhir['sensor_suara'])
            },
            "analisis_ml_keseluruhan": {
                "probabilitas": float(round(probabilitas_keseluruhan, 1)),
                "tingkat_risiko": tingkat_risiko
            },
            "analisis_ml_hari_ini": {
                "probabilitas": float(round(probabilitas_today, 1))
            },
            "chart_data": df_chart[['timestamp', 'sound', 'temperature', 'humidity', 'co2', 'status']].to_dict(orient='records')
        }
        return jsonify(output)
        
    except Exception as e:
        print(f"ERROR DI API /api/ml-analysis: {e}")
        return jsonify({"error": "Terjadi kesalahan internal pada server saat mengolah data."}), 500


# ==================================
# BAGIAN UNTUK MENJALANKAN SERVER
# ==================================
if __name__ == '__main__':
    app.run(port=5000, debug=True)
