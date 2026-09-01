
const state = {
  currentCity: "Mumbai",
  apiBaseUrl: window.location.origin.startsWith("http") ? "" : "http://localhost:8000",
  currentWeather: null,
  history: [],
  alerts: [],
  thresholds: {},
  tempChart: null,
  humidityWindChart: null,
  refreshTimer: null,
  autoRefreshSeconds: 30
};


const WEATHER_ICON_MAP = {
  0: { icon: "fa-sun", color: "#fbbf24" },                 // Clear
  1: { icon: "fa-cloud-sun", color: "#fcd34d" },           // Mainly clear
  2: { icon: "fa-cloud-sun", color: "#93c5fd" },           // Partly cloudy
  3: { icon: "fa-cloud", color: "#94a3b8" },               // Overcast
  45: { icon: "fa-smog", color: "#cbd5e1" },               // Fog
  48: { icon: "fa-smog", color: "#cbd5e1" },               // Rime fog
  51: { icon: "fa-cloud-rain", color: "#38bdf8" },          // Light drizzle
  53: { icon: "fa-cloud-rain", color: "#38bdf8" },          // Moderate drizzle
  55: { icon: "fa-cloud-showers-heavy", color: "#0284c7" }, // Heavy drizzle
  61: { icon: "fa-cloud-rain", color: "#38bdf8" },          // Slight rain
  63: { icon: "fa-cloud-rain", color: "#0284c7" },          // Moderate rain
  65: { icon: "fa-cloud-showers-heavy", color: "#2563eb" }, // Heavy rain
  71: { icon: "fa-snowflake", color: "#e0f2fe" },           // Slight snow
  73: { icon: "fa-snowflake", color: "#bae6fd" },           // Moderate snow
  75: { icon: "fa-snowflake", color: "#7dd3fc" },           // Heavy snow
  80: { icon: "fa-cloud-showers-water", color: "#38bdf8" }, // Showers
  81: { icon: "fa-cloud-showers-heavy", color: "#0284c7" }, // Moderate showers
  82: { icon: "fa-cloud-showers-heavy", color: "#1d4ed8" }, // Violent rain
  95: { icon: "fa-cloud-bolt", color: "#eab308" },          // Thunderstorm
  96: { icon: "fa-cloud-bolt", color: "#f59e0b" },          // Thunderstorm w/ hail
  99: { icon: "fa-bolt-lightning", color: "#ef4444" }       // Severe Thunderstorm
};

const elements = {
  heroCityName: document.getElementById("heroCityName"),
  heroCountry: document.getElementById("heroCountry"),
  heroTemperature: document.getElementById("heroTemperature"),
  heroCondition: document.getElementById("heroCondition"),
  heroFeelsLike: document.getElementById("heroFeelsLike"),
  heroLastUpdated: document.getElementById("heroLastUpdated"),
  heroWeatherIcon: document.getElementById("heroWeatherIcon"),
  heroConditionBadge: document.getElementById("heroConditionBadge"),

  metricHumidity: document.getElementById("metricHumidity"),
  humidityProgress: document.getElementById("humidityProgress"),
  humidityStatus: document.getElementById("humidityStatus"),

  metricWindSpeed: document.getElementById("metricWindSpeed"),
  windProgress: document.getElementById("windProgress"),
  windStatus: document.getElementById("windStatus"),

  metricPressure: document.getElementById("metricPressure"),
  pressureProgress: document.getElementById("pressureProgress"),
  pressureStatus: document.getElementById("pressureStatus"),

  metricAlertCount: document.getElementById("metricAlertCount"),
  alertProgress: document.getElementById("alertProgress"),
  alertSummaryText: document.getElementById("alertSummaryText"),

  alertsList: document.getElementById("alertsList"),
  badgeAlertTotal: document.getElementById("badgeAlertTotal"),

  cityPills: document.getElementById("cityPills"),
  btnManualIngest: document.getElementById("btnManualIngest"),

  thresholdCityTag: document.getElementById("thresholdCityTag"),
  thresholdForm: document.getElementById("thresholdForm"),
  threshMaxTemp: document.getElementById("threshMaxTemp"),
  valMaxTemp: document.getElementById("valMaxTemp"),
  threshMinTemp: document.getElementById("threshMinTemp"),
  valMinTemp: document.getElementById("valMinTemp"),
  threshMaxWind: document.getElementById("threshMaxWind"),
  valMaxWind: document.getElementById("valMaxWind"),
  threshMaxHumid: document.getElementById("threshMaxHumid"),
  valMaxHumid: document.getElementById("valMaxHumid"),

  subscribeForm: document.getElementById("subscribeForm"),
  subscriberEmail: document.getElementById("subscriberEmail"),
  subscribeFeedback: document.getElementById("subscribeFeedback"),
  subscribersList: document.getElementById("subscribersList"),
  btnRefreshSubscribers: document.getElementById("btnRefreshSubscribers"),

  toastContainer: document.getElementById("toastContainer")
};


document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  initCharts();
  loadAllCityData(state.currentCity);
  loadSubscribers();
  startAutoRefresh();
});


function setupEventListeners() {

  elements.cityPills.addEventListener("click", (e) => {
    const pill = e.target.closest(".city-pill");
    if (!pill) return;

    document.querySelectorAll(".city-pill").forEach(p => p.classList.remove("active"));
    pill.classList.add("active");

    const city = pill.dataset.city;
    state.currentCity = city;
    loadAllCityData(city);
  });

  elements.btnManualIngest.addEventListener("click", triggerManualIngest);


  elements.threshMaxTemp.addEventListener("input", (e) => elements.valMaxTemp.textContent = `${e.target.value}°C`);
  elements.threshMinTemp.addEventListener("input", (e) => elements.valMinTemp.textContent = `${e.target.value}°C`);
  elements.threshMaxWind.addEventListener("input", (e) => elements.valMaxWind.textContent = `${e.target.value} km/h`);
  elements.threshMaxHumid.addEventListener("input", (e) => elements.valMaxHumid.textContent = `${e.target.value}%`);

  elements.thresholdForm.addEventListener("submit", handleThresholdSave);


  elements.subscribeForm.addEventListener("submit", handleSnsSubscription);
  if (elements.btnRefreshSubscribers) {
    elements.btnRefreshSubscribers.addEventListener("click", loadSubscribers);
  }


  document.querySelectorAll(".btn-sim").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const scenario = btn.dataset.scenario;
      triggerSimulation(scenario);
    });
  });
}

// Chart.js Setup
function initCharts() {
  Chart.defaults.color = '#94a3b8';
  Chart.defaults.font.family = "'Inter', sans-serif";

  // Temperature & Feels Like Trend Chart
  const tempCtx = document.getElementById("temperatureChart").getContext("2d");
  const tempGradient = tempCtx.createLinearGradient(0, 0, 0, 260);
  tempGradient.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
  tempGradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

  const feelsGradient = tempCtx.createLinearGradient(0, 0, 0, 260);
  feelsGradient.addColorStop(0, 'rgba(6, 182, 212, 0.25)');
  feelsGradient.addColorStop(1, 'rgba(6, 182, 212, 0.0)');

  state.tempChart = new Chart(tempCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Temperature (°C)',
          data: [],
          borderColor: '#6366f1',
          backgroundColor: tempGradient,
          fill: true,
          tension: 0.38,
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#6366f1'
        },
        {
          label: 'Feels Like (°C)',
          data: [],
          borderColor: '#06b6d4',
          backgroundColor: feelsGradient,
          fill: true,
          tension: 0.38,
          borderWidth: 1.8,
          borderDash: [4, 4],
          pointRadius: 0,
          pointHoverRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { boxWidth: 12, usePointStyle: true, font: { size: 12 } }
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          borderColor: 'rgba(255, 255, 255, 0.1)',
          borderWidth: 1,
          padding: 10,
          boxPadding: 4
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { font: { size: 11 }, maxRotation: 0 }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: {
            font: { size: 11 },
            callback: (value) => `${value}°C`
          }
        }
      }
    }
  });


  const humCtx = document.getElementById("humidityWindChart").getContext("2d");
  state.humidityWindChart = new Chart(humCtx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'Humidity (%)',
          data: [],
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.15)',
          fill: true,
          tension: 0.3,
          borderWidth: 2,
          yAxisID: 'y'
        },
        {
          label: 'Wind Speed (km/h)',
          data: [],
          borderColor: '#a855f7',
          backgroundColor: 'rgba(168, 85, 247, 0.1)',
          fill: false,
          tension: 0.3,
          borderWidth: 2,
          borderDash: [5, 5],
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, usePointStyle: true } }
      },
      scales: {
        x: { grid: { color: 'rgba(255, 255, 255, 0.05)' } },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { callback: (val) => `${val}%` },
          min: 0,
          max: 100
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          grid: { drawOnChartArea: false },
          ticks: { callback: (val) => `${val}k` }
        }
      }
    }
  });
}


async function loadAllCityData(city) {
  try {
    showToast(`Loading weather telemetry for ${city}...`, 'info');

    // Fetch Current Weather, History, Thresholds, and Alerts in parallel
    const [currentRes, historyRes, thresholdsRes, alertsRes] = await Promise.all([
      fetch(`${state.apiBaseUrl}/api/weather/current?city=${encodeURIComponent(city)}`).then(r => r.json()),
      fetch(`${state.apiBaseUrl}/api/weather/history?city=${encodeURIComponent(city)}&limit=24`).then(r => r.json()),
      fetch(`${state.apiBaseUrl}/api/thresholds?city=${encodeURIComponent(city)}`).then(r => r.json()),
      fetch(`${state.apiBaseUrl}/api/alerts?city=${encodeURIComponent(city)}`).then(r => r.json())
    ]);

    state.currentWeather = currentRes;
    state.history = historyRes.history || [];
    state.thresholds = thresholdsRes || {};
    state.alerts = alertsRes.alerts || [];

    updateHeroUI(currentRes);
    updateMetricsUI(currentRes);
    updateChartsUI(state.history);
    updateThresholdsUI(state.thresholds, city);
    updateAlertsUI(state.alerts);

  } catch (err) {
    console.error("Failed to load weather data:", err);
    showToast(`Error communicating with backend API. Make sure local_server.py is running.`, 'alert');
  }
}


function updateHeroUI(data) {
  if (!data || !data.location) return;

  elements.heroCityName.textContent = data.location;
  elements.heroCountry.textContent = data.country || "Global";
  elements.heroTemperature.textContent = data.temperature !== undefined ? data.temperature.toFixed(1) : "--";
  elements.heroCondition.textContent = data.condition || "Unknown";
  elements.heroFeelsLike.textContent = data.feels_like !== undefined ? `${data.feels_like.toFixed(1)}°C` : "--";

  if (data.recorded_at) {
    elements.heroLastUpdated.textContent = data.recorded_at;
  } else {
    elements.heroLastUpdated.textContent = new Date().toLocaleTimeString();
  }

  const code = data.weather_code !== undefined ? data.weather_code : 0;
  const iconConfig = WEATHER_ICON_MAP[code] || { icon: "fa-cloud-sun", color: "#fbbf24" };

  elements.heroWeatherIcon.innerHTML = `<i class="fa-solid ${iconConfig.icon} weather-icon-anim" style="color: ${iconConfig.color};"></i>`;


  const temp = data.temperature || 0;
  const wind = data.wind_speed || 0;
  if (temp > 40 || wind > 50 || [95, 96, 99].includes(code)) {
    elements.heroConditionBadge.className = "condition-badge critical";
    elements.heroConditionBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Extreme Weather Advisory`;
  } else if (temp > 35 || temp < 8 || wind > 35) {
    elements.heroConditionBadge.className = "condition-badge warning";
    elements.heroConditionBadge.innerHTML = `<i class="fa-solid fa-bell"></i> Weather Advisory`;
  } else {
    elements.heroConditionBadge.className = "condition-badge";
    elements.heroConditionBadge.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Normal Conditions`;
  }
}

function updateMetricsUI(data) {
  if (!data) return;

  // Humidity
  const humidity = data.humidity || 0;
  elements.metricHumidity.textContent = humidity;
  elements.humidityProgress.style.width = `${Math.min(100, Math.max(0, humidity))}%`;
  elements.humidityStatus.textContent = humidity > 80 ? 'High Humidity' : (humidity < 30 ? 'Dry Atmosphere' : 'Optimal comfort levels');

  // Wind Speed
  const wind = data.wind_speed || 0;
  elements.metricWindSpeed.textContent = wind.toFixed(1);
  const windPct = Math.min(100, (wind / 60) * 100);
  elements.windProgress.style.width = `${windPct}%`;
  elements.windStatus.textContent = wind > 40 ? 'Gale / High Wind' : (wind > 20 ? 'Moderate Breeze' : 'Gentle Air Flow');

  // Pressure
  const pressure = data.pressure || 1013.2;
  elements.metricPressure.textContent = pressure.toFixed(1);
  const pressPct = Math.min(100, Math.max(0, ((pressure - 980) / 50) * 100));
  elements.pressureProgress.style.width = `${pressPct}%`;
  elements.pressureStatus.textContent = pressure < 1000 ? 'Low Pressure (Depression)' : 'Stable Barometric Pressure';

  // Alerts Count
  const cityAlerts = state.alerts.filter(a => !a.location || a.location.toLowerCase() === state.currentCity.toLowerCase());
  const alertCount = cityAlerts.length;
  elements.metricAlertCount.textContent = alertCount;
  elements.alertProgress.style.width = `${Math.min(100, alertCount * 25)}%`;

  if (alertCount > 0) {
    elements.alertSummaryText.className = "metric-footer text-rose";
    elements.alertSummaryText.textContent = `${alertCount} safety threshold(s) breached`;
  } else {
    elements.alertSummaryText.className = "metric-footer text-emerald";
    elements.alertSummaryText.textContent = "All parameters within safety thresholds";
  }
}

function updateChartsUI(history) {
  if (!history || !Array.isArray(history) || history.length === 0) return;

  const labels = history.map(item => {
    if (item.recorded_at) {
      const parts = item.recorded_at.split(' ');
      return parts.length > 1 ? parts[1].slice(0, 5) : item.recorded_at;
    }
    if (item.timestamp) {
      const d = new Date(item.timestamp);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return '';
  });

  const temps = history.map(item => item.temperature || 0);
  const feels = history.map(item => item.feels_like || item.temperature || 0);
  const humidities = history.map(item => item.humidity || 0);
  const windSpeeds = history.map(item => item.wind_speed || 0);

  // Update Temperature Chart
  if (state.tempChart) {
    state.tempChart.data.labels = labels;
    state.tempChart.data.datasets[0].data = temps;
    state.tempChart.data.datasets[1].data = feels;
    state.tempChart.update();
  }

  // Update Humidity / Wind Chart
  if (state.humidityWindChart) {
    state.humidityWindChart.data.labels = labels;
    state.humidityWindChart.data.datasets[0].data = humidities;
    state.humidityWindChart.data.datasets[1].data = windSpeeds;
    state.humidityWindChart.update();
  }
}

function updateThresholdsUI(thresholds, city) {
  elements.thresholdCityTag.textContent = city;

  const maxT = thresholds.max_temperature || 38;
  const minT = thresholds.min_temperature || 5;
  const maxW = thresholds.max_wind_speed || 45;
  const maxH = thresholds.max_humidity || 85;

  elements.threshMaxTemp.value = maxT;
  elements.valMaxTemp.textContent = `${maxT}°C`;

  elements.threshMinTemp.value = minT;
  elements.valMinTemp.textContent = `${minT}°C`;

  elements.threshMaxWind.value = maxW;
  elements.valMaxWind.textContent = `${maxW} km/h`;

  elements.threshMaxHumid.value = maxH;
  elements.valMaxHumid.textContent = `${maxH}%`;
}

function updateAlertsUI(alerts) {
  elements.badgeAlertTotal.textContent = alerts.length;

  if (!alerts || alerts.length === 0) {
    elements.alertsList.innerHTML = `
      <div class="alert-empty-state">
        <i class="fa-solid fa-circle-check"></i>
        <p>No weather anomalies currently recorded.</p>
        <small>Continuous monitoring active via AWS Lambda & EventBridge.</small>
      </div>
    `;
    return;
  }

  elements.alertsList.innerHTML = alerts.map(alert => {
    const isCritical = (alert.severity || '').toUpperCase() === 'CRITICAL';
    const severityClass = isCritical ? 'critical' : 'warning';
    const timeStr = alert.timestamp ? new Date(alert.timestamp).toLocaleTimeString() : 'Recent';

    return `
      <div class="alert-item ${severityClass}">
        <div class="alert-top-row">
          <span class="alert-type-badge ${severityClass}">${alert.severity || 'ALERT'}</span>
          <span class="alert-time"><i class="fa-regular fa-clock"></i> ${timeStr}</span>
        </div>
        <div class="alert-title-text">${alert.title || 'Weather Anomaly Detected'}</div>
        <div class="alert-msg-text">${alert.message || ''}</div>
      </div>
    `;
  }).join('');
}

// User Actions

async function triggerManualIngest() {
  const icon = elements.btnManualIngest.querySelector("i");
  icon.classList.add("fa-spin");

  try {
    const res = await fetch(`${state.apiBaseUrl}/api/collect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city: state.currentCity })
    }).then(r => r.json());

    showToast(`Ingestion completed for ${state.currentCity}! Readings saved to DynamoDB.`, 'success');
    await loadAllCityData(state.currentCity);
  } catch (err) {
    console.error("Manual ingestion error:", err);
    showToast("Failed to invoke weather ingestion Lambda.", 'alert');
  } finally {
    icon.classList.remove("fa-spin");
  }
}

async function handleThresholdSave(e) {
  e.preventDefault();

  const payload = {
    location: state.currentCity,
    max_temperature: parseFloat(elements.threshMaxTemp.value),
    min_temperature: parseFloat(elements.threshMinTemp.value),
    max_wind_speed: parseFloat(elements.threshMaxWind.value),
    max_humidity: parseFloat(elements.threshMaxHumid.value)
  };

  try {
    const res = await fetch(`${state.apiBaseUrl}/api/thresholds`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(r => r.json());

    showToast(`Threshold settings saved to DynamoDB for ${state.currentCity}!`, 'success');
    // Trigger re-evaluation
    await triggerManualIngest();
  } catch (err) {
    console.error("Save thresholds error:", err);
    showToast("Failed to update thresholds.", 'alert');
  }
}

async function handleSnsSubscription(e) {
  e.preventDefault();
  const email = elements.subscriberEmail.value.trim();
  const protocolSelect = document.getElementById("subscriberProtocol");
  const protocol = protocolSelect ? protocolSelect.value : "email-json";
  if (!email) return;

  try {
    const res = await fetch(`${state.apiBaseUrl}/api/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ protocol, endpoint: email })
    }).then(r => r.json());

    elements.subscriberEmail.value = "";
    showToast(`Subscribed ${email} (${protocol}) to Amazon SNS weather-alert-SNS!`, 'success');
    elements.subscribeFeedback.innerHTML = `<span style="color: #10b981;">✓ Successfully requested ${protocol} subscription for ${email}. Please check inbox to confirm.</span>`;
    await loadSubscribers();
  } catch (err) {
    console.error("SNS Subscribe error:", err);
    showToast("Subscription request failed.", 'alert');
  }
}

async function loadSubscribers() {
  if (!elements.subscribersList) return;
  try {
    const res = await fetch(`${state.apiBaseUrl}/api/subscriptions`).then(r => r.json());
    const subs = res.subscriptions || [];

    if (subs.length === 0) {
      elements.subscribersList.innerHTML = `<span style="color: #64748b; font-style: italic;">No subscribers found.</span>`;
      return;
    }

    elements.subscribersList.innerHTML = subs.map(s => {
      const isConfirmed = s.SubscriptionArn && s.SubscriptionArn !== "PendingConfirmation" && s.SubscriptionArn !== "pending confirmation";
      const statusText = isConfirmed ? "CONFIRMED" : "PENDING";
      const statusColor = isConfirmed ? "#10b981" : "#f59e0b";
      const endpoint = s.Endpoint || s.endpoint || "Unknown";
      const protocol = s.Protocol || s.protocol || "email";
      const arn = s.SubscriptionArn || s.subscription_arn || "";

      return `
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); border-radius: 6px; padding: 4px 8px; border: 1px solid rgba(255,255,255,0.06);">
          <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 180px;">
            <div style="font-weight: 500; color: #f1f5f9; font-size: 0.76rem;">${endpoint}</div>
            <div style="font-size: 0.68rem; color: #64748b;">${protocol} &bull; <span style="color: ${statusColor}; font-weight: 600;">${statusText}</span></div>
          </div>
          ${isConfirmed ? `
            <button onclick="handleUnsubscribe('${arn}')" title="Unsubscribe endpoint" style="background: rgba(239,68,68,0.15); border: 1px solid rgba(239,68,68,0.3); color: #f87171; border-radius: 4px; padding: 2px 6px; font-size: 0.68rem; cursor: pointer;">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          ` : `
            <span style="font-size: 0.65rem; color: #f59e0b; font-style: italic;">Pending</span>
          `}
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error("Failed to load subscribers:", err);
  }
}

window.handleUnsubscribe = async function (subArn) {
  if (!confirm("Are you sure you want to unsubscribe this recipient from Amazon SNS?")) return;
  try {
    const res = await fetch(`${state.apiBaseUrl}/api/unsubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription_arn: subArn })
    }).then(r => r.json());

    showToast("Subscriber removed from Amazon SNS topic.", "info");
    await loadSubscribers();
  } catch (err) {
    console.error("Unsubscribe error:", err);
    showToast("Failed to unsubscribe endpoint.", "alert");
  }
};

async function triggerSimulation(scenario) {
  if (scenario === 'normal') {
    await triggerManualIngest();
    return;
  }

  showToast(`Simulating '${scenario}' event in ${state.currentCity}...`, 'info');
  try {
    const res = await fetch(`${state.apiBaseUrl}/api/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city: state.currentCity, scenario })
    }).then(r => r.json());

    showToast(`Simulated ${scenario} alert generated and dispatched via SNS!`, 'alert');
    await loadAllCityData(state.currentCity);
  } catch (err) {
    console.error("Simulation error:", err);
    showToast("Simulation trigger failed.", 'alert');
  }
}

// Background Auto-Refresh
function startAutoRefresh() {
  if (state.refreshTimer) clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(() => {
    loadAllCityData(state.currentCity);
  }, state.autoRefreshSeconds * 1000);
}

// Toast Notification Manager
function showToast(message, type = 'info') {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  let iconClass = 'fa-circle-info';
  if (type === 'success') iconClass = 'fa-circle-check';
  if (type === 'alert') iconClass = 'fa-triangle-exclamation';

  toast.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span>${message}</span>`;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
