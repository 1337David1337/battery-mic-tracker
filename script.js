const STORAGE_KEY = "battery-mic-tracker:v2";
const TABLE_NAME = "battery_state";

const devices = {
  shure: {
    name: "Shure без провода",
    maxUses: 3,
  },
  headset: {
    name: "Sennheiser пастора",
    maxUses: 2,
  },
};

const today = new Date().toISOString();

const defaultDeviceState = {
  usageCount: 0,
  lastUsed: null,
  replacedAt: today,
};

const syncStatusEl = document.querySelector('[data-role="sync-status"]');

let state = getInitialState();
let supabaseClient = null;
let remoteEnabled = false;
let realtimeChannel = null;

function getInitialState() {
  return Object.fromEntries(Object.keys(devices).map((deviceId) => [deviceId, { ...defaultDeviceState }]));
}

function loadLocalState() {
  const initialState = getInitialState();
  const saved = readSavedState();

  if (!saved) {
    return initialState;
  }

  try {
    const parsed = JSON.parse(saved);

    return Object.fromEntries(
      Object.keys(devices).map((deviceId) => [
        deviceId,
        {
          ...defaultDeviceState,
          ...parsed[deviceId],
        },
      ]),
    );
  } catch {
    return initialState;
  }
}

function normalizeStateRows(rows) {
  const nextState = getInitialState();

  rows.forEach((row) => {
    if (!devices[row.device_id]) {
      return;
    }

    nextState[row.device_id] = {
      usageCount: Number(row.usage_count) || 0,
      lastUsed: row.last_used,
      replacedAt: row.replaced_at || today,
    };
  });

  return nextState;
}

function normalizeDeviceRow(row) {
  return {
    usageCount: Number(row.usage_count) || 0,
    lastUsed: row.last_used,
    replacedAt: row.replaced_at || today,
  };
}

function readSavedState() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveLocalState(nextState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  } catch {
    // Private browsing or restricted file access can block localStorage.
  }
}

function getSupabaseConfig() {
  return window.BATTERY_TRACKER_SUPABASE || {};
}

function hasSupabaseConfig() {
  const config = getSupabaseConfig();

  return Boolean(config.url && config.anonKey);
}

function setSyncStatus(message, stateName = "local") {
  syncStatusEl.textContent = message;
  syncStatusEl.dataset.state = stateName;
}

function createSupabaseClient() {
  if (!hasSupabaseConfig()) {
    setSyncStatus("Локальный режим: Supabase ещё не настроен", "local");
    return null;
  }

  if (!window.supabase) {
    setSyncStatus("Локальный режим: Supabase SDK не загрузился", "offline");
    return null;
  }

  const config = getSupabaseConfig();

  return window.supabase.createClient(config.url, config.anonKey);
}

async function loadRemoteState() {
  const { data, error } = await supabaseClient.from(TABLE_NAME).select("*");

  if (error) {
    throw error;
  }

  return normalizeStateRows(data || []);
}

async function saveRemoteDevice(deviceId) {
  if (!remoteEnabled || !supabaseClient) {
    return;
  }

  const deviceState = state[deviceId];
  const { error } = await supabaseClient.from(TABLE_NAME).upsert({
    device_id: deviceId,
    usage_count: deviceState.usageCount,
    last_used: deviceState.lastUsed,
    replaced_at: deviceState.replacedAt,
    updated_at: new Date().toISOString(),
  });

  if (error) {
    throw error;
  }
}

function subscribeToRemoteChanges() {
  if (!remoteEnabled || !supabaseClient || realtimeChannel) {
    return;
  }

  realtimeChannel = supabaseClient
    .channel("battery-state")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: TABLE_NAME,
      },
      (payload) => {
        if (!payload.new || !devices[payload.new.device_id]) {
          return;
        }

        state = {
          ...state,
          [payload.new.device_id]: normalizeDeviceRow(payload.new),
        };

        saveLocalState(state);
        renderDevice(payload.new.device_id);
        setSyncStatus("Синхронизировано", "online");
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setSyncStatus("Синхронизация включена", "online");
        return;
      }

      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setSyncStatus("Realtime недоступен, данные обновятся при перезагрузке", "offline");
      }
    });
}

function formatDate(value) {
  if (!value) {
    return "ещё не отмечено";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function getChargePercent(usageCount, maxUses) {
  if (usageCount <= 0) {
    return 100;
  }

  return Math.max(0, Math.round(((maxUses - usageCount) / maxUses) * 100));
}

function getBatteryColor(percent) {
  if (percent > 50) {
    return "var(--green)";
  }

  if (percent > 20) {
    return "var(--yellow)";
  }

  return "var(--red)";
}

function getHint(usageCount, maxUses) {
  if (usageCount === 0) {
    return "Батарейки свежие.";
  }

  if (usageCount < maxUses - 1) {
    return "Остался запас ещё примерно на одно воскресенье.";
  }

  if (usageCount === maxUses - 1) {
    return "Это последнее надёжное использование. Лучше подготовить замену.";
  }

  return "Заряд закончился. Использование больше не отмечаем до замены.";
}

function getElements(card) {
  return {
    usageCount: card.querySelector('[data-role="usage-count"]'),
    batteryLevel: card.querySelector('[data-role="battery-level"]'),
    chargeValue: card.querySelector('[data-role="charge-value"]'),
    chargeHint: card.querySelector('[data-role="charge-hint"]'),
    emptyState: card.querySelector('[data-role="empty-state"]'),
    lastUsed: card.querySelector('[data-role="last-used"]'),
    replacedAt: card.querySelector('[data-role="replaced-at"]'),
    useButton: card.querySelector('[data-action="use"]'),
  };
}

function renderDevice(deviceId) {
  const card = document.querySelector(`[data-device-id="${deviceId}"]`);
  const elements = getElements(card);
  const deviceState = state[deviceId];
  const maxUses = devices[deviceId].maxUses;
  const isEmpty = deviceState.usageCount >= maxUses;
  const percent = getChargePercent(deviceState.usageCount, maxUses);

  card.classList.toggle("is-empty", isEmpty);
  elements.usageCount.textContent = deviceState.usageCount;
  elements.chargeValue.textContent = `${percent}%`;
  elements.chargeHint.textContent = getHint(deviceState.usageCount, maxUses);
  elements.lastUsed.textContent = formatDate(deviceState.lastUsed);
  elements.replacedAt.textContent = formatDate(deviceState.replacedAt);
  elements.batteryLevel.style.width = `${percent}%`;
  elements.batteryLevel.style.backgroundColor = getBatteryColor(percent);
  elements.emptyState.hidden = !isEmpty;
  elements.useButton.disabled = isEmpty;
  elements.useButton.textContent = isEmpty ? "Сначала замените батарейки" : "Использовали сегодня";
}

function render() {
  Object.keys(devices).forEach(renderDevice);
}

async function updateDevice(deviceId, nextDeviceState) {
  state = {
    ...state,
    [deviceId]: {
      ...state[deviceId],
      ...nextDeviceState,
    },
  };

  saveLocalState(state);
  renderDevice(deviceId);

  if (!remoteEnabled) {
    setSyncStatus("Сохранено только на этом устройстве", "local");
    return;
  }

  try {
    setSyncStatus("Сохраняем...", "syncing");
    await saveRemoteDevice(deviceId);
    setSyncStatus("Синхронизировано", "online");
  } catch {
    setSyncStatus("Нет связи с базой, сохранено локально", "offline");
  }
}

function useDevice(deviceId) {
  if (state[deviceId].usageCount >= devices[deviceId].maxUses) {
    return;
  }

  void updateDevice(deviceId, {
    usageCount: state[deviceId].usageCount + 1,
    lastUsed: new Date().toISOString(),
  });
}

function replaceBatteries(deviceId) {
  const confirmed = window.confirm(`Сбросить счётчик и отметить замену батареек для ${devices[deviceId].name}?`);

  if (!confirmed) {
    return;
  }

  void updateDevice(deviceId, {
    usageCount: 0,
    lastUsed: null,
    replacedAt: new Date().toISOString(),
  });
}

function bindDeviceControls(card) {
  const deviceId = card.dataset.deviceId;

  card.querySelector('[data-action="use"]').addEventListener("click", () => {
    useDevice(deviceId);
  });

  card.querySelector('[data-action="replace"]').addEventListener("click", () => {
    replaceBatteries(deviceId);
  });
}

async function initializeApp() {
  state = loadLocalState();
  render();

  supabaseClient = createSupabaseClient();

  if (!supabaseClient) {
    return;
  }

  try {
    setSyncStatus("Загружаем данные из Supabase...", "syncing");
    state = await loadRemoteState();
    saveLocalState(state);
    remoteEnabled = true;
    render();
    setSyncStatus("Синхронизация включена", "online");
    subscribeToRemoteChanges();
  } catch {
    remoteEnabled = false;
    setSyncStatus("Нет связи с базой, работаем локально", "offline");
  }
}

document.querySelectorAll("[data-device-id]").forEach((card) => {
  bindDeviceControls(card);
});

void initializeApp();
