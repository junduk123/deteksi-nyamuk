// static/js/main.js

// =================================================================
// BAGIAN 1: FUNGSI-FUNGSI UNTUK MEMPERBARUI TAMPILAN (UI)
// =================================================================

function updateStats(statsData) {
    document.getElementById('todayCount').innerText = statsData.total_deteksi_hari_ini;
    document.getElementById('currentTemp').innerText = statsData.suhu.toFixed(1) + '°C';
    document.getElementById('currentHumidity').innerText = statsData.kelembapan.toFixed(1) + '%';
    document.getElementById('currentAir').innerText = statsData.kualitas_udara.toFixed(0) + ' ppm';
    document.getElementById('currentSound').innerText = statsData.level_suara.toFixed(1) + ' dB';
}

function updateMLAnalysis(analisisTotal, analisisToday) {
    document.getElementById('overallMlProbabilityText').innerText = analisisTotal.probabilitas.toFixed(1) + ' %';
    document.getElementById('overallMlProbability').style.width = analisisTotal.probabilitas + '%';
    document.getElementById('overallRiskLevel').textContent = analisisTotal.tingkat_risiko;

    document.getElementById('todayMlProbabilityText').innerText = analisisToday.probabilitas.toFixed(1) + ' %';
    document.getElementById('todayMlProbability').style.width = analisisToday.probabilitas + '%';
}

function updateTable(chartData) {
    const tbody = document.getElementById('dataTable');
    if (!tbody) return;

    tbody.innerHTML = '';
    chartData.slice(0, 20).forEach(d => {
        const tr = document.createElement('tr');
        const statusClass = d.status === 'ada' ? 'text-red-600' : 'text-green-600';

        tr.innerHTML = `
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${new Date(d.timestamp).toLocaleString('id-ID')}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${d.sound.toFixed(1)}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${d.temperature.toFixed(1)}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${d.humidity.toFixed(1)}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${d.co2.toFixed(0)}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm font-semibold ${statusClass}">${d.status}</td>
        `;
        tbody.appendChild(tr);
    });
}

// =================================================================
// BAGIAN 2: GRAFIK
// =================================================================

let trendChart, envChart, airChart, soundChart;

function updateChart(chartInstance, chartId, options) {
    const ctx = document.getElementById(chartId);
    if (!ctx) return null;
    if (chartInstance) chartInstance.destroy();
    return new Chart(ctx, options);
}

function initializeCharts(dataArray) {
    const hourlyData = {};
    [...Array(24).keys()].forEach(h => {
        hourlyData[h] = { temp: [], humidity: [], co2: [], sound: [], count: 0 };
    });

    dataArray.forEach(d => {
        const hour = new Date(d.timestamp).getHours();
        if (hourlyData[hour]) {
            hourlyData[hour].temp.push(d.temperature);
            hourlyData[hour].humidity.push(d.humidity);
            hourlyData[hour].co2.push(d.co2);
            hourlyData[hour].sound.push(d.sound);
            hourlyData[hour].count += (d.status === 'ada' ? 1 : 0);
        }
    });

    const hours = Object.keys(hourlyData);
    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

    const trendCounts = hours.map(h => hourlyData[h].count);
    const avgTemps = hours.map(h => avg(hourlyData[h].temp));
    const avgHumidities = hours.map(h => avg(hourlyData[h].humidity));
    const avgCo2 = hours.map(h => avg(hourlyData[h].co2));
    const avgSounds = hours.map(h => avg(hourlyData[h].sound));
    const chartLabels = hours.map(h => `${h}:00`);

    trendChart = updateChart(trendChart, 'trendChart', {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'Jumlah Deteksi (ML)',
                data: trendCounts,
                borderColor: 'rgb(75, 85, 99)',
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, ticks: { stepSize: 1 } }
            }
        }
    });

    envChart = updateChart(envChart, 'envChart', {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [
                { label: 'Suhu (°C)', data: avgTemps, borderColor: 'rgb(239, 68, 68)', yAxisID: 'y-temp' },
                { label: 'Kelembapan (%)', data: avgHumidities, borderColor: 'rgb(59, 130, 246)', yAxisID: 'y-humidity' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index' },
            scales: {
                'y-temp': { position: 'left' },
                'y-humidity': { position: 'right', grid: { display: false } }
            }
        }
    });

    airChart = updateChart(airChart, 'airChart', {
        type: 'bar',
        data: {
            labels: chartLabels,
            datasets: [{ label: 'CO₂ (ppm)', data: avgCo2, backgroundColor: 'rgba(16, 185, 129, 0.5)' }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
        }
    });

    soundChart = updateChart(soundChart, 'soundChart', {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{ label: 'Level Suara (dB)', data: avgSounds, borderColor: 'rgb(234, 179, 8)', tension: 0.3, fill: true }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true } }
        }
    });
}

// =================================================================
// NOTIFIKASI
// =================================================================

function showNotification() {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;

    toast.classList.remove('opacity-0');
    toast.classList.add('opacity-100');

    setTimeout(() => {
        toast.classList.remove('opacity-100');
        toast.classList.add('opacity-0');
    }, 5000);
}

// =================================================================
// FUNGSI UTAMA
// =================================================================

async function updateDashboardData() {
    try {
        const response = await fetch('/api/ml-analysis');
        if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

        const data = await response.json();
        if (data.error) throw new Error(`Error dari backend: ${data.error}`);

        updateStats(data.stats_cards);
        updateMLAnalysis(data.analisis_ml_keseluruhan, data.analisis_ml_hari_ini);

        // ✅ Trigger Notifikasi jika probabilitas hari ini tinggi
        if (data.analisis_ml_hari_ini.probabilitas > 50) {
            showNotification();
        }

        const chartData = data.chart_data.map(d => ({
            ...d,
            timestamp: new Date(d.timestamp).getTime()
        }));

        initializeCharts(chartData);
        updateTable(chartData);

    } catch (error) {
        console.error("Gagal memperbarui dashboard:", error);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    updateDashboardData();
    setInterval(updateDashboardData, 300000); // auto refresh tiap 5 menit
});