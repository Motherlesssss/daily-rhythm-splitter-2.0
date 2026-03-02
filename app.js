// ============== 全局状态 ==============
const state = {
    uploadedData: null,      // 原始上传的数据
    aggregatedData: null,    // 按日期+车型聚合的数据
    targetYear: new Date().getFullYear(),
    targetMonth: new Date().getMonth() + 1,
    specialEvents: [],       // 自定义特殊节点
    currentVehicle: null,    // 当前查看的车型
    results: null,           // 生成的比例结果
    ignoreHistoryData: false, // 是否忽略历史同期数据
    weightMultipliers: {     // 权重调整倍数
        weekday: 1.0,        // 工作日倍数
        weekend: 1.0,        // 周末倍数
        holiday: 1.0         // 节假日倍数
    },
    vehicleTargets: {}       // 各车型月度目标量 { vehicle: number }
};

// ============== 中国节假日数据 (2025-2026) ==============
// 包含法定节假日和调休安排
const chineseHolidays = {
    2025: {
        '01-01': '元旦',
        '01-28': '春节',
        '01-29': '春节',
        '01-30': '春节',
        '01-31': '春节',
        '02-01': '春节',
        '02-02': '春节',
        '02-03': '春节',
        '02-04': '春节',
        '04-05': '清明节',
        '04-06': '清明节',
        '04-07': '清明节',
        '05-01': '劳动节',
        '05-02': '劳动节',
        '05-03': '劳动节',
        '05-04': '劳动节',
        '05-05': '劳动节',
        '05-31': '端午节',
        '06-01': '端午节',
        '06-02': '端午节',
        '10-01': '国庆节',
        '10-02': '国庆节',
        '10-03': '国庆节',
        '10-04': '国庆节',
        '10-05': '国庆节',
        '10-06': '国庆节',
        '10-07': '国庆节',
        '10-08': '国庆节'
    },
    2026: {
        '01-01': '元旦',
        '01-02': '元旦',
        '01-03': '元旦',
        '02-15': '春节',
        '02-16': '春节',
        '02-17': '春节',
        '02-18': '春节',
        '02-19': '春节',
        '02-20': '春节',
        '02-21': '春节',
        '02-22': '春节',
        '04-05': '清明节',
        '04-06': '清明节',
        '04-07': '清明节',
        '05-01': '劳动节',
        '05-02': '劳动节',
        '05-03': '劳动节',
        '05-04': '劳动节',
        '05-05': '劳动节',
        '06-19': '端午节',
        '06-20': '端午节',
        '06-21': '端午节',
        '06-22': '端午节',
        '10-01': '国庆中秋',
        '10-02': '国庆中秋',
        '10-03': '国庆中秋',
        '10-04': '国庆中秋',
        '10-05': '国庆中秋',
        '10-06': '国庆中秋',
        '10-07': '国庆中秋',
        '10-08': '国庆中秋'
    }
};


// ============== 工具函数 ==============
function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getWeekday(date) {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return days[date.getDay()];
}

function isWeekend(date) {
    const day = date.getDay();
    return day === 0 || day === 6;
}

function getHoliday(date) {
    const year = date.getFullYear();
    const monthDay = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return chineseHolidays[year]?.[monthDay] || null;
}

function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

// ============== 初始化 ==============
document.addEventListener('DOMContentLoaded', function() {
    initializeYearSelector();
    initializeUpload();
    initializeMonthSelector();
    initializeSpecialEvents();
    initializeGenerateButton();
    initializeExportButton();
    initializeTargetInput();
});

function initializeYearSelector() {
    const yearSelect = document.getElementById('yearSelect');
    const currentYear = new Date().getFullYear();

    for (let year = currentYear; year <= currentYear + 2; year++) {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = `${year}年`;
        yearSelect.appendChild(option);
    }

    yearSelect.value = currentYear;
}

// ============== 文件上传功能 ==============
function initializeUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('drag-over');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('drag-over');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) handleFileUpload(file);
    });

    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) handleFileUpload(file);
    });
}

function handleFileUpload(file) {
    if (!file.name.match(/\.(xlsx|xls)$/)) {
        alert('请上传Excel文件（.xlsx 或 .xls）');
        return;
    }

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(firstSheet);

            if (jsonData.length === 0) {
                alert('Excel文件为空，请检查数据');
                return;
            }

            // 验证数据格式
            const requiredColumns = ['日期', '车型', '实际量'];
            const hasRequiredColumns = requiredColumns.every(col =>
                jsonData.some(row => col in row)
            );

            if (!hasRequiredColumns) {
                alert('Excel格式不正确，请确保包含：日期、车型、实际量列');
                return;
            }

            // 过滤掉无效行（车型为空的行）
            const cleanedData = jsonData.filter(row => {
                return row['车型'] !== null &&
                       row['车型'] !== undefined &&
                       String(row['车型']).trim() !== '';
            });

            if (cleanedData.length === 0) {
                alert('Excel中没有有效数据，请检查文件内容');
                return;
            }

            state.uploadedData = cleanedData;
            displayFileInfo(file.name, cleanedData.length);
            aggregateData();
            checkCanGenerate();

        } catch (error) {
            alert('文件解析失败：' + error.message);
        }
    };

    reader.readAsArrayBuffer(file);
}

function displayFileInfo(fileName, rowCount) {
    const fileInfo = document.getElementById('fileInfo');
    fileInfo.innerHTML = `
        <svg style="width:24px;height:24px;color:#52c41a" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
        </svg>
        <div>
            <strong>${fileName}</strong>
            <span style="color: #8c8c8c; margin-left: 12px;">共 ${rowCount} 条数据</span>
        </div>
    `;
    fileInfo.classList.remove('hidden');
}

// ============== 数据聚合 ==============
function aggregateData() {
    if (!state.uploadedData) return;

    const aggregated = {};

    state.uploadedData.forEach(row => {
        // 解析日期
        let dateStr;
        if (row['日期'] instanceof Date) {
            dateStr = formatDate(row['日期']);
        } else if (typeof row['日期'] === 'number') {
            // Excel日期序列号
            const excelDate = XLSX.SSF.parse_date_code(row['日期']);
            dateStr = `${excelDate.y}-${String(excelDate.m).padStart(2, '0')}-${String(excelDate.d).padStart(2, '0')}`;
        } else {
            dateStr = String(row['日期']).split(' ')[0];
        }

        const vehicle = String(row['车型']).trim();
        const amount = Number(row['实际量']) || 0;

        const key = `${dateStr}_${vehicle}`;
        if (!aggregated[key]) {
            aggregated[key] = {
                date: dateStr,
                vehicle: vehicle,
                amount: 0
            };
        }
        aggregated[key].amount += amount;
    });

    state.aggregatedData = Object.values(aggregated);
    console.log('数据聚合完成:', state.aggregatedData.length, '条记录');
}

// ============== 月份选择 ==============
function initializeMonthSelector() {
    const yearSelect = document.getElementById('yearSelect');
    const monthSelect = document.getElementById('monthSelect');
    const ignoreHistoryCheckbox = document.getElementById('ignoreHistoryCheckbox');
    const weekdayMultiplier = document.getElementById('weekdayMultiplier');
    const weekendMultiplier = document.getElementById('weekendMultiplier');
    const holidayMultiplier = document.getElementById('holidayMultiplier');

    // 默认选择下个月
    const nextMonth = new Date();
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    monthSelect.value = nextMonth.getMonth() + 1;

    yearSelect.addEventListener('change', updateTargetMonth);
    monthSelect.addEventListener('change', updateTargetMonth);
    ignoreHistoryCheckbox.addEventListener('change', function() {
        state.ignoreHistoryData = this.checked;
        autoRefreshResults();
    });

    // 权重倍数调整事件监听
    weekdayMultiplier.addEventListener('input', function() {
        state.weightMultipliers.weekday = parseFloat(this.value) || 1.0;
        autoRefreshResults();
    });
    weekendMultiplier.addEventListener('input', function() {
        state.weightMultipliers.weekend = parseFloat(this.value) || 1.0;
        autoRefreshResults();
    });
    holidayMultiplier.addEventListener('input', function() {
        state.weightMultipliers.holiday = parseFloat(this.value) || 1.0;
        autoRefreshResults();
    });

    // 初始化时调用一次，显示默认月份的日历
    updateTargetMonth();
}

function updateTargetMonth() {
    state.targetYear = Number(document.getElementById('yearSelect').value);
    state.targetMonth = Number(document.getElementById('monthSelect').value);

    updateCalendarView();
    checkCanGenerate();
}

function updateCalendarView() {
    const calendarView = document.getElementById('calendarView');
    const specialEventsForm = document.getElementById('specialEventsForm');

    const daysInMonth = getDaysInMonth(state.targetYear, state.targetMonth);
    let holidayCount = 0;
    let weekendCount = 0;
    let workdayCount = 0;

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(state.targetYear, state.targetMonth - 1, day);
        const holiday = getHoliday(date);
        const weekend = isWeekend(date);

        if (holiday) {
            holidayCount++;
        } else if (weekend) {
            weekendCount++;
        } else {
            workdayCount++;
        }
    }

    calendarView.innerHTML = `
        <h3>📅 ${state.targetYear}年${state.targetMonth}月</h3>
        <div class="summary-grid">
            <div class="summary-item">
                <div class="label">总天数</div>
                <div class="value">${daysInMonth}</div>
            </div>
            <div class="summary-item">
                <div class="label">工作日</div>
                <div class="value">${workdayCount}</div>
            </div>
            <div class="summary-item">
                <div class="label">周末</div>
                <div class="value">${weekendCount}</div>
            </div>
            <div class="summary-item">
                <div class="label">法定节假日</div>
                <div class="value">${holidayCount}</div>
            </div>
        </div>
    `;
    calendarView.className = '';
    specialEventsForm.classList.remove('hidden');

    // 更新日期选择器的范围
    const eventDate = document.getElementById('eventDate');
    eventDate.min = `${state.targetYear}-${String(state.targetMonth).padStart(2, '0')}-01`;
    eventDate.max = `${state.targetYear}-${String(state.targetMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
}

// ============== 特殊节点管理 ==============
function initializeSpecialEvents() {
    const addEventBtn = document.getElementById('addEventBtn');
    addEventBtn.addEventListener('click', addSpecialEvent);
}

function addSpecialEvent() {
    const eventDate = document.getElementById('eventDate').value;
    const eventType = document.getElementById('eventType').value;
    const eventName = document.getElementById('eventName').value;

    if (!eventDate || !eventName) {
        alert('请填写完整的节点信息');
        return;
    }

    const event = {
        date: eventDate,
        type: eventType,
        name: eventName
    };

    state.specialEvents.push(event);
    renderEventsList();
    autoRefreshResults();

    // 清空输入
    document.getElementById('eventDate').value = '';
    document.getElementById('eventName').value = '';
}

function renderEventsList() {
    const eventsList = document.getElementById('eventsList');

    if (state.specialEvents.length === 0) {
        eventsList.innerHTML = '<p style="color: #8c8c8c; text-align: center;">暂无特殊节点</p>';
        return;
    }

    eventsList.innerHTML = state.specialEvents.map((event, index) => `
        <div class="event-item ${event.type}">
            <div>
                <strong>${event.date}</strong> - ${event.name}
                <span class="tag tag-${event.type}">${getEventTypeLabel(event.type)}</span>
            </div>
            <button class="event-remove" onclick="removeSpecialEvent(${index})">×</button>
        </div>
    `).join('');
}

function removeSpecialEvent(index) {
    state.specialEvents.splice(index, 1);
    renderEventsList();
    autoRefreshResults();
}

function getEventTypeLabel(type) {
    const labels = {
        adjustment: '调休',
        promotion: '促销',
        launch: '新车',
        other: '其他'
    };
    return labels[type] || type;
}

// ============== 生成按钮 ==============
function initializeGenerateButton() {
    const generateBtn = document.getElementById('generateBtn');
    generateBtn.addEventListener('click', generateDailyRatios);
}

function checkCanGenerate() {
    const generateBtn = document.getElementById('generateBtn');
    generateBtn.disabled = !state.uploadedData || !state.targetYear || !state.targetMonth;
}

// ============== 核心算法：生成每日比例 ==============
function generateDailyRatios() {
    const loading = document.getElementById('loading');
    loading.classList.remove('hidden');

    // 模拟计算延迟
    setTimeout(() => {
        try {
            const results = {};
            const vehicles = getUniqueVehicles();

            vehicles.forEach(vehicle => {
                results[vehicle] = calculateVehicleDailyRatios(vehicle);
            });

            state.results = results;
            displayResults();
            loading.classList.add('hidden');

        } catch (error) {
            alert('生成失败：' + error.message);
            loading.classList.add('hidden');
        }
    }, 500);
}

function getUniqueVehicles() {
    const vehicles = new Set();
    state.aggregatedData.forEach(row => vehicles.add(row.vehicle));
    return Array.from(vehicles).sort();
}

// 已生成结果时，参数变化后静默重算并刷新视图（不显示 loading）
function autoRefreshResults() {
    if (!state.results) return;

    const vehicles = getUniqueVehicles();
    const results = {};
    vehicles.forEach(vehicle => {
        results[vehicle] = calculateVehicleDailyRatios(vehicle);
    });
    state.results = results;

    // 保持当前选中的车型标签
    if (!state.results[state.currentVehicle]) {
        state.currentVehicle = Object.keys(state.results)[0];
    }
    renderVehicleTabs(Object.keys(state.results));
    renderResultsTable(state.currentVehicle);
    renderSummary(state.currentVehicle);
    displayHistoryData(state.currentVehicle);
}

function calculateVehicleDailyRatios(vehicle) {
    // 获取该车型的历史数据
    const vehicleData = state.aggregatedData.filter(row => row.vehicle === vehicle);

    if (vehicleData.length === 0) {
        return generateDefaultRatios();
    }

    // 按日期分组统计（用于同期优先，保存星期信息用于后续校正）
    const dateStats = {};
    vehicleData.forEach(row => {
        const date = new Date(row.date);
        const monthDay = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

        if (!dateStats[monthDay]) {
            dateStats[monthDay] = [];
        }
        dateStats[monthDay].push({
            amount: row.amount,
            weekday: date.getDay(),
            holiday: getHoliday(date)
        });
    });

    // 按星期几统计（0=周日, 1=周一, ..., 6=周六）
    const weekdayStats = {
        0: [], // 周日
        1: [], // 周一
        2: [], // 周二
        3: [], // 周三
        4: [], // 周四
        5: [], // 周五
        6: []  // 周六
    };

    // 节假日单独统计
    const holidayAmounts = [];

    vehicleData.forEach(row => {
        const date = new Date(row.date);
        const holiday = getHoliday(date);

        if (holiday) {
            // 节假日单独统计，保留日期用于近期加权
            holidayAmounts.push({ date: row.date, amount: row.amount });
        } else {
            // 按星期几分类，保留日期用于近期加权
            const dayOfWeek = date.getDay();
            weekdayStats[dayOfWeek].push({ date: row.date, amount: row.amount });
        }
    });

    // ★ 优化：对每个星期使用「异常值过滤 + 近期加权均值」
    const avgByWeekday = {};
    for (let day = 0; day <= 6; day++) {
        if (weekdayStats[day].length > 0) {
            const trimmed = trimOutliers(weekdayStats[day]);
            avgByWeekday[day] = weightedAvg(trimmed);
        }
    }

    // 如果某些星期没有数据，用工作日/周末的平均值填充
    const hasWeekdayData = [1, 2, 3, 4, 5].some(d => avgByWeekday[d]);
    const hasWeekendData = [0, 6].some(d => avgByWeekday[d]);

    if (hasWeekdayData) {
        const weekdayAvg = [1, 2, 3, 4, 5]
            .filter(d => avgByWeekday[d])
            .reduce((sum, d) => sum + avgByWeekday[d], 0) / [1, 2, 3, 4, 5].filter(d => avgByWeekday[d]).length;

        for (let day = 1; day <= 5; day++) {
            if (!avgByWeekday[day]) {
                avgByWeekday[day] = weekdayAvg;
            }
        }
    }

    if (hasWeekendData) {
        const weekendAvg = [0, 6]
            .filter(d => avgByWeekday[d])
            .reduce((sum, d) => sum + avgByWeekday[d], 0) / [0, 6].filter(d => avgByWeekday[d]).length;

        for (let day of [0, 6]) {
            if (!avgByWeekday[day]) {
                avgByWeekday[day] = weekendAvg;
            }
        }
    }

    // 如果完全没有数据，使用默认值
    if (Object.keys(avgByWeekday).length === 0) {
        for (let day = 0; day <= 6; day++) {
            avgByWeekday[day] = 100;
        }
    }

    // ★ 优化：节假日同样使用异常值过滤 + 近期加权均值
    const avgHoliday = holidayAmounts.length > 0
        ? weightedAvg(trimOutliers(holidayAmounts))
        : (avgByWeekday[1] || 100) * 0.5; // 如果没有节假日数据，用工作日的50%

    // ★ 优化：月末冲量效应——从历史数据自动学习月末最后3天的相对倍数
    const monthEndMultiplier = computeMonthEndMultiplier(vehicleData);

    // 为目标月份的每一天分配权重
    const daysInMonth = getDaysInMonth(state.targetYear, state.targetMonth);
    const dailyWeights = [];

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(state.targetYear, state.targetMonth - 1, day);
        const dateStr = formatDate(date);
        const monthDay = `${String(state.targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const holiday = getHoliday(date);
        const dayOfWeek = date.getDay(); // 0=周日, 1=周一, ..., 6=周六

        let weight;

        // 检查是否有特殊节点
        const specialEvent = state.specialEvents.find(e => e.date === dateStr);

        // 判断是否使用历史同期数据
        // 调休上班日需要覆盖同期数据（去年可能是普通周末，今年算工作日）
        const isAdjustment = specialEvent && specialEvent.type === 'adjustment';
        if (!state.ignoreHistoryData && dateStats[monthDay] && !isAdjustment) {
            // ★ 修正星期偏移：同期日期与预测日期的星期几可能不同
            // 例：去年03-02是周日，今年03-02是周一，需按星期基准比率调整
            const targetBaseline = holiday ? avgHoliday : (avgByWeekday[dayOfWeek] || 100);
            const adjustedAmounts = dateStats[monthDay].map(item => {
                const srcBaseline = item.holiday ? avgHoliday : (avgByWeekday[item.weekday] || 100);
                return srcBaseline > 0 ? item.amount * (targetBaseline / srcBaseline) : item.amount;
            });
            weight = adjustedAmounts.reduce((a, b) => a + b, 0) / adjustedAmounts.length;
        } else if (specialEvent && specialEvent.type === 'adjustment') {
            // 调休上班日，使用对应星期几的工作日权重
            // 调休上班日通常是周六或周日，但算作工作日
            // 使用周一到周五的平均作为调休日权重
            const weekdayWeights = [1, 2, 3, 4, 5].map(d => avgByWeekday[d]).filter(w => w);
            weight = weekdayWeights.reduce((a, b) => a + b, 0) / weekdayWeights.length;
        } else if (holiday) {
            // 节假日使用节假日平均权重
            weight = avgHoliday;
        } else {
            // 使用该星期几的历史平均权重
            weight = avgByWeekday[dayOfWeek] || 100;
        }

        // 对其他特殊节点增加权重
        if (specialEvent) {
            if (specialEvent.type === 'promotion') {
                weight *= 1.5;  // 促销活动增加50%
            } else if (specialEvent.type === 'launch') {
                weight *= 1.8;  // 新车发布增加80%
            }
            // adjustment类型已经在上面处理，不额外加成
        }

        // ★ 月末冲量加成：最后3天，且未使用同期数据（同期数据已包含冲量规律），且非节假日
        const usedSamePeriod = !state.ignoreHistoryData && dateStats[monthDay] && !isAdjustment;
        if (!usedSamePeriod && !holiday && daysInMonth - day < 3) {
            weight *= monthEndMultiplier;
        }

        // 应用权重调整倍数
        // 调休上班日：按工作日倍数（而非周末倍数，因为今天实际作为工作日）
        if (holiday) {
            weight *= state.weightMultipliers.holiday;
        } else if (isAdjustment) {
            weight *= state.weightMultipliers.weekday;
        } else if (dayOfWeek === 0 || dayOfWeek === 6) {
            weight *= state.weightMultipliers.weekend;
        } else {
            weight *= state.weightMultipliers.weekday;
        }

        dailyWeights.push({
            date: dateStr,
            weight: weight,
            isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
            holiday: holiday,
            specialEvent: specialEvent
        });
    }

    // 归一化为百分比
    const totalWeight = dailyWeights.reduce((sum, d) => sum + d.weight, 0);
    const dailyRatios = dailyWeights.map(d => ({
        ...d,
        ratio: (d.weight / totalWeight) * 100
    }));

    return dailyRatios;
}

// ★ 异常值过滤：去除每组数据中 P10~P90 之外的极端值
// items: [{date, amount}, ...], 样本不足5条时不过滤
function trimOutliers(items) {
    if (items.length < 5) return items;
    const sorted = [...items].sort((a, b) => a.amount - b.amount);
    const lo = Math.floor(sorted.length * 0.1);
    const hi = Math.ceil(sorted.length * 0.9);
    return sorted.slice(lo, hi);
}

// ★ 近期加权平均：越近的数据权重越高（指数衰减）
// items: [{date, amount}, ...], decayPerSample 每步衰减系数（默认0.95）
// 例：52条周数据时，最新的权重=1，6个月前≈0.26，12个月前≈0.07
function weightedAvg(items, decayPerSample = 0.95) {
    if (items.length === 0) return null;
    const sorted = [...items].sort((a, b) => new Date(a.date) - new Date(b.date));
    const n = sorted.length;
    let weightedSum = 0, totalWeight = 0;
    sorted.forEach((pt, i) => {
        const w = Math.pow(decayPerSample, n - 1 - i); // 最新 i=n-1 → w=1
        weightedSum += pt.amount * w;
        totalWeight += w;
    });
    return weightedSum / totalWeight;
}

// ★ 月末冲量效应：从历史数据中自动学习月末最后3天相对月中的倍数
// vehicleData: [{date, amount}, ...] 某车型的全量聚合数据
function computeMonthEndMultiplier(vehicleData) {
    // 按年月分组
    const monthGroups = {};
    vehicleData.forEach(row => {
        const date = new Date(row.date);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthGroups[key]) monthGroups[key] = [];
        monthGroups[key].push({
            day: date.getDate(),
            amount: row.amount,
            daysInMonth: getDaysInMonth(date.getFullYear(), date.getMonth() + 1)
        });
    });

    const multipliers = [];
    for (const days of Object.values(monthGroups)) {
        const total = days[0].daysInMonth;
        // 月末：最后3天（排除节假日影响不在此处处理，保持简单）
        const lastThree = days.filter(d => total - d.day < 3);
        // 月中：第5天到倒数第4天（避免月初月末效应）
        const middle = days.filter(d => d.day >= 5 && total - d.day >= 3);
        if (lastThree.length >= 2 && middle.length >= 5) {
            const lastAvg = lastThree.reduce((s, d) => s + d.amount, 0) / lastThree.length;
            const midAvg = middle.reduce((s, d) => s + d.amount, 0) / middle.length;
            if (midAvg > 0) multipliers.push(lastAvg / midAvg);
        }
    }

    if (multipliers.length === 0) return 1.0;
    const avg = multipliers.reduce((a, b) => a + b, 0) / multipliers.length;
    // 限制在合理范围内，避免极端值
    return Math.max(0.8, Math.min(3.0, avg));
}

function generateDefaultRatios() {
    // 如果没有历史数据，使用简单平均分配
    const daysInMonth = getDaysInMonth(state.targetYear, state.targetMonth);
    const dailyRatios = [];

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(state.targetYear, state.targetMonth - 1, day);
        const dateStr = formatDate(date);

        dailyRatios.push({
            date: dateStr,
            ratio: 100 / daysInMonth,
            isWeekend: isWeekend(date),
            holiday: getHoliday(date),
            specialEvent: state.specialEvents.find(e => e.date === dateStr)
        });
    }

    return dailyRatios;
}

// ============== 目标量拆分 ==============

// 最大余数法：确保拆分整数之和严格等于目标总量
function splitTargetByRatios(vehicle) {
    const target = state.vehicleTargets[vehicle];
    if (!target || target <= 0 || !state.results || !state.results[vehicle]) return null;

    const ratios = state.results[vehicle];
    const exactValues = ratios.map(d => d.ratio / 100 * target);
    const floorValues = exactValues.map(v => Math.floor(v));

    const distributed = floorValues.reduce((a, b) => a + b, 0);
    const extra = Math.round(target - distributed); // 需要额外分配的 1

    // 按小数部分降序，将余量优先分给余数最大的日期
    const remainders = exactValues.map((v, i) => ({
        index: i,
        remainder: v - Math.floor(v)
    }));
    remainders.sort((a, b) => b.remainder - a.remainder);

    const allocations = [...floorValues];
    for (let i = 0; i < extra; i++) {
        allocations[remainders[i].index]++;
    }

    return allocations;
}

function updateTargetInput(vehicle) {
    const targetSplitArea = document.getElementById('targetSplitArea');
    const vehicleTargetLabel = document.getElementById('targetVehicleLabel');
    const vehicleTargetInput = document.getElementById('vehicleTargetInput');
    const targetSplitFeedback = document.getElementById('targetSplitFeedback');
    const clearTargetBtn = document.getElementById('clearTargetBtn');

    targetSplitArea.style.display = '';
    vehicleTargetLabel.textContent = vehicle;

    // 确保输入框是启用的（从汇总视图切换回来时需要）
    vehicleTargetInput.disabled = false;

    const existingTarget = state.vehicleTargets[vehicle];
    vehicleTargetInput.value = existingTarget || '';

    if (existingTarget) {
        targetSplitFeedback.textContent = `已设置目标 ${existingTarget.toLocaleString()}，拆分量已显示在表格中`;
        targetSplitFeedback.className = 'target-split-feedback success';
        clearTargetBtn.style.display = '';
    } else {
        targetSplitFeedback.textContent = '输入后自动按比例拆分到每日，总量严格等于目标';
        targetSplitFeedback.className = 'target-split-feedback hint';
        clearTargetBtn.style.display = 'none';
    }
}

function initializeTargetInput() {
    const vehicleTargetInput = document.getElementById('vehicleTargetInput');
    const clearTargetBtn = document.getElementById('clearTargetBtn');

    vehicleTargetInput.addEventListener('input', function() {
        const val = parseInt(this.value);
        const vehicle = state.currentVehicle;

        // 跳过汇总视图
        if (!vehicle || vehicle === '__SUMMARY__') return;

        if (val && val > 0) {
            state.vehicleTargets[vehicle] = val;
        } else {
            delete state.vehicleTargets[vehicle];
        }

        updateTargetInput(vehicle);
        renderResultsTable(vehicle);
        renderSummary(vehicle);
    });

    clearTargetBtn.addEventListener('click', function() {
        const vehicle = state.currentVehicle;

        // 跳过汇总视图
        if (!vehicle || vehicle === '__SUMMARY__') return;

        delete state.vehicleTargets[vehicle];
        document.getElementById('vehicleTargetInput').value = '';
        updateTargetInput(vehicle);
        renderResultsTable(vehicle);
        renderSummary(vehicle);
    });
}

// ============== 结果展示 ==============
function displayResults() {
    const resultsSection = document.getElementById('resultsSection');
    resultsSection.classList.remove('hidden');

    const vehicles = Object.keys(state.results);
    state.currentVehicle = vehicles[0];

    renderVehicleTabs(vehicles);
    renderResultsTable(state.currentVehicle);
    renderSummary(state.currentVehicle);
    displayHistoryData(state.currentVehicle);
    updateTargetInput(state.currentVehicle);

    // 滚动到结果区域
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function renderVehicleTabs(vehicles) {
    const vehicleTabs = document.getElementById('vehicleTabs');
    vehicleTabs.innerHTML = vehicles.map(vehicle => `
        <div class="vehicle-tab ${vehicle === state.currentVehicle ? 'active' : ''}"
             data-vehicle="${vehicle}"
             onclick="switchVehicle('${vehicle}')">
            ${vehicle}
        </div>
    `).join('');
}

function switchVehicle(vehicle) {
    state.currentVehicle = vehicle;
    renderVehicleTabs(Object.keys(state.results));
    renderResultsTable(vehicle);
    renderSummary(vehicle);
    displayHistoryData(vehicle);
    updateTargetInput(vehicle);
}

function renderResultsTable(vehicle) {
    const resultsBody = document.getElementById('resultsBody');
    const resultsTableHead = document.querySelector('#resultsTable thead tr');
    const ratios = state.results[vehicle];
    const allocations = splitTargetByRatios(vehicle);

    // 动态更新表头：有目标量时追加拆分量列
    if (allocations) {
        resultsTableHead.innerHTML = `
            <th>日期</th>
            <th>星期</th>
            <th>节假日/特殊节点</th>
            <th>每日比例</th>
            <th>累计比例</th>
            <th>拆分量</th>
            <th>累计拆分量</th>
        `;
    } else {
        resultsTableHead.innerHTML = `
            <th>日期</th>
            <th>星期</th>
            <th>节假日/特殊节点</th>
            <th>每日比例</th>
            <th>累计比例</th>
        `;
    }

    let cumulativeRatio = 0;
    let cumulativeAlloc = 0;

    resultsBody.innerHTML = ratios.map((day, i) => {
        cumulativeRatio += day.ratio;

        const date = new Date(day.date);
        const weekday = getWeekday(date);

        let rowClass = '';
        if (day.specialEvent) {
            if (day.specialEvent.type === 'adjustment') {
                rowClass = 'adjustment';
            } else {
                rowClass = 'special-event';
            }
        } else if (day.holiday) {
            rowClass = 'holiday';
        } else if (day.isWeekend) {
            rowClass = 'weekend';
        }

        let tags = [];
        if (day.holiday) {
            tags.push(`<span class="tag tag-holiday">${day.holiday}</span>`);
        } else if (day.isWeekend) {
            tags.push('<span class="tag tag-weekend">周末</span>');
        }

        if (day.specialEvent) {
            const tagClass = `tag-${day.specialEvent.type}`;
            tags.push(`<span class="tag ${tagClass}">${day.specialEvent.name}</span>`);
        }

        let allocationCells = '';
        if (allocations) {
            cumulativeAlloc += allocations[i];
            allocationCells = `
                <td><strong>${allocations[i].toLocaleString()}</strong></td>
                <td>${cumulativeAlloc.toLocaleString()}</td>
            `;
        }

        return `
            <tr class="${rowClass}">
                <td>${day.date}</td>
                <td>${weekday}</td>
                <td>${tags.join(' ') || '-'}</td>
                <td><strong>${day.ratio.toFixed(2)}%</strong></td>
                <td>${cumulativeRatio.toFixed(2)}%</td>
                ${allocationCells}
            </tr>
        `;
    }).join('');
}

function renderSummary(vehicle) {
    const summaryInfo = document.getElementById('summaryInfo');
    const ratios = state.results[vehicle];
    const allocations = splitTargetByRatios(vehicle);

    const totalRatio = ratios.reduce((sum, d) => sum + d.ratio, 0);
    const avgRatio = totalRatio / ratios.length;
    const maxDay = ratios.reduce((max, d) => d.ratio > max.ratio ? d : max);
    const minDay = ratios.reduce((min, d) => d.ratio < min.ratio ? d : min);

    // 按日期类型分类统计比例
    let weekdayRatio = 0, weekdayCount = 0;
    let weekendRatio = 0, weekendCount = 0;
    let holidayRatio = 0, holidayCount = 0;

    ratios.forEach(day => {
        const date = new Date(day.date);
        const holiday = getHoliday(date);
        const isWknd = isWeekend(date);
        const isAdjustment = state.specialEvents.some(e =>
            e.date === day.date && e.type === 'adjustment'
        );

        if (isAdjustment || (!holiday && !isWknd)) {
            weekdayRatio += day.ratio;
            weekdayCount++;
        } else if (holiday) {
            holidayRatio += day.ratio;
            holidayCount++;
        } else if (isWknd) {
            weekendRatio += day.ratio;
            weekendCount++;
        }
    });

    let allocationBlock = '';
    if (allocations && state.vehicleTargets[vehicle]) {
        const totalAlloc = allocations.reduce((a, b) => a + b, 0);
        const avgAlloc = totalAlloc / allocations.length;
        const maxAllocIdx = allocations.indexOf(Math.max(...allocations));
        allocationBlock = `
            <h3 style="margin-top:20px;margin-bottom:12px;font-size:16px;">拆分统计 - ${vehicle}</h3>
            <div class="summary-grid">
                <div class="summary-item">
                    <div class="label">月度目标</div>
                    <div class="value">${state.vehicleTargets[vehicle].toLocaleString()}</div>
                </div>
                <div class="summary-item">
                    <div class="label">拆分总量</div>
                    <div class="value" style="color:var(--success-color)">${totalAlloc.toLocaleString()} ✓</div>
                </div>
                <div class="summary-item">
                    <div class="label">日均拆分</div>
                    <div class="value">${avgAlloc.toFixed(1)}</div>
                </div>
                <div class="summary-item">
                    <div class="label">最高拆分日</div>
                    <div class="value" style="font-size:14px">${ratios[maxAllocIdx].date}<br>${allocations[maxAllocIdx].toLocaleString()}</div>
                </div>
            </div>
        `;
    }

    summaryInfo.innerHTML = `
        <h3>统计摘要 - ${vehicle}</h3>
        <div class="summary-grid">
            <div class="summary-item">
                <div class="label">总计比例</div>
                <div class="value">${totalRatio.toFixed(2)}%</div>
            </div>
            <div class="summary-item">
                <div class="label">日均比例</div>
                <div class="value">${avgRatio.toFixed(2)}%</div>
            </div>
            <div class="summary-item">
                <div class="label">工作日占比</div>
                <div class="value" style="font-size:16px">${weekdayRatio.toFixed(2)}%<br><span style="font-size:12px;color:#86909C;font-weight:400">${weekdayCount}天 · 日均${(weekdayRatio/weekdayCount).toFixed(2)}%</span></div>
            </div>
            <div class="summary-item">
                <div class="label">周末占比</div>
                <div class="value" style="font-size:16px">${weekendRatio.toFixed(2)}%<br><span style="font-size:12px;color:#86909C;font-weight:400">${weekendCount}天 · 日均${weekendCount > 0 ? (weekendRatio/weekendCount).toFixed(2) : 0}%</span></div>
            </div>
            <div class="summary-item">
                <div class="label">节假日占比</div>
                <div class="value" style="font-size:16px">${holidayRatio.toFixed(2)}%<br><span style="font-size:12px;color:#86909C;font-weight:400">${holidayCount}天 · 日均${holidayCount > 0 ? (holidayRatio/holidayCount).toFixed(2) : 0}%</span></div>
            </div>
            <div class="summary-item">
                <div class="label">最高日期</div>
                <div class="value" style="font-size: 14px;">${maxDay.date}<br>${maxDay.ratio.toFixed(2)}%</div>
            </div>
            <div class="summary-item">
                <div class="label">最低日期</div>
                <div class="value" style="font-size: 14px;">${minDay.date}<br>${minDay.ratio.toFixed(2)}%</div>
            </div>
        </div>
        ${allocationBlock}
    `;
}

// ============== 去年同期参考 ==============
function displayHistoryData(vehicle) {
    const historyBody = document.getElementById('historyBody');
    const historyNote = document.getElementById('historyNote');
    const historySummary = document.getElementById('historySummary');

    const lastYear = state.targetYear - 1;
    const targetMonth = state.targetMonth;

    const samePeriodData = state.aggregatedData.filter(row => {
        if (row.vehicle !== vehicle) return false;
        const date = new Date(row.date);
        return date.getFullYear() === lastYear && (date.getMonth() + 1) === targetMonth;
    });

    if (samePeriodData.length === 0) {
        historyNote.innerHTML = '';
        historyNote.style.display = 'none';
        historyBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:#8c8c8c;">上传数据中未找到去年同期记录</td></tr>';
        historySummary.innerHTML = '';
        return;
    }

    samePeriodData.sort((a, b) => new Date(a.date) - new Date(b.date));

    const totalAmount = samePeriodData.reduce((sum, row) => sum + row.amount, 0);

    // 隐藏月度汇总信息
    historyNote.innerHTML = '';
    historyNote.style.display = 'none';

    let cumulative = 0;
    historyBody.innerHTML = samePeriodData.map(row => {
        const date = new Date(row.date);
        const weekday = getWeekday(date);
        const holiday = getHoliday(date);
        const isWknd = isWeekend(date);
        const ratio = totalAmount > 0 ? (row.amount / totalAmount) * 100 : 0;
        cumulative += ratio;

        let rowClass = '';
        if (holiday) rowClass = 'holiday';
        else if (isWknd) rowClass = 'weekend';

        let tags = [];
        if (holiday) tags.push(`<span class="tag tag-holiday">${holiday}</span>`);
        else if (isWknd) tags.push('<span class="tag tag-weekend">周末</span>');

        return `
            <tr class="${rowClass}">
                <td>${row.date}</td>
                <td>${weekday}</td>
                <td>${tags.join(' ') || '-'}</td>
                <td><strong>${row.amount.toLocaleString()}</strong></td>
                <td><strong>${ratio.toFixed(2)}%</strong></td>
                <td>${cumulative.toFixed(2)}%</td>
            </tr>
        `;
    }).join('');

    const maxDay = samePeriodData.reduce((max, d) => d.amount > max.amount ? d : max);
    const minDay = samePeriodData.reduce((min, d) => d.amount < min.amount ? d : min);
    const avgAmount = totalAmount / samePeriodData.length;

    // 按日期类型分类统计
    let weekdayAmount = 0, weekdayCount = 0;
    let weekendAmount = 0, weekendCount = 0;
    let holidayAmount = 0, holidayCount = 0;

    samePeriodData.forEach(row => {
        const date = new Date(row.date);
        const holiday = getHoliday(date);
        const isWknd = isWeekend(date);

        if (holiday) {
            holidayAmount += row.amount;
            holidayCount++;
        } else if (isWknd) {
            weekendAmount += row.amount;
            weekendCount++;
        } else {
            weekdayAmount += row.amount;
            weekdayCount++;
        }
    });

    historySummary.innerHTML = `
        <h3>统计摘要 - ${vehicle} 同期参考</h3>
        <div class="summary-grid">
            <div class="summary-item">
                <div class="label">月合计</div>
                <div class="value">${totalAmount.toLocaleString()}</div>
            </div>
            <div class="summary-item">
                <div class="label">日均量</div>
                <div class="value">${Math.round(avgAmount).toLocaleString()}</div>
            </div>
            <div class="summary-item">
                <div class="label">工作日实际量</div>
                <div class="value" style="font-size:16px">${weekdayAmount.toLocaleString()}<br><span style="font-size:12px;color:#86909C;font-weight:400">${weekdayCount}天 · 日均${Math.round(weekdayAmount/weekdayCount).toLocaleString()}</span></div>
            </div>
            <div class="summary-item">
                <div class="label">周末实际量</div>
                <div class="value" style="font-size:16px">${weekendAmount.toLocaleString()}<br><span style="font-size:12px;color:#86909C;font-weight:400">${weekendCount}天 · 日均${weekendCount > 0 ? Math.round(weekendAmount/weekendCount).toLocaleString() : 0}</span></div>
            </div>
            <div class="summary-item">
                <div class="label">节假日实际量</div>
                <div class="value" style="font-size:16px">${holidayAmount.toLocaleString()}<br><span style="font-size:12px;color:#86909C;font-weight:400">${holidayCount}天 · 日均${holidayCount > 0 ? Math.round(holidayAmount/holidayCount).toLocaleString() : 0}</span></div>
            </div>
            <div class="summary-item">
                <div class="label">最高日期</div>
                <div class="value" style="font-size:14px">${maxDay.date}<br>${maxDay.amount.toLocaleString()}</div>
            </div>
            <div class="summary-item">
                <div class="label">最低日期</div>
                <div class="value" style="font-size:14px">${minDay.date}<br>${minDay.amount.toLocaleString()}</div>
            </div>
        </div>
    `;
}

// ============== 导出Excel ==============
function initializeExportButton() {
    const exportBtn = document.getElementById('exportBtn');
    const exportHorizontalBtn = document.getElementById('exportHorizontalBtn');

    exportBtn.addEventListener('click', exportToExcel);
    exportHorizontalBtn.addEventListener('click', exportToExcelHorizontal);
}

function exportToExcel() {
    if (!state.results) {
        alert('请先生成分配比例');
        return;
    }

    const wb = XLSX.utils.book_new();

    // 为每个车型创建一个工作表
    Object.keys(state.results).forEach(vehicle => {
        const ratios = state.results[vehicle];
        const allocations = splitTargetByRatios(vehicle);

        const headers = ['日期', '星期', '节假日/特殊节点', '每日比例(%)', '累计比例(%)'];
        if (allocations) {
            headers.push('拆分量', '累计拆分量');
        }

        const sheetData = [headers];

        let cumulative = 0;
        let cumulativeAlloc = 0;
        ratios.forEach((day, i) => {
            cumulative += day.ratio;
            const date = new Date(day.date);
            const weekday = getWeekday(date);

            let tags = [];
            if (day.isWeekend) tags.push('周末');
            if (day.holiday) tags.push(day.holiday);
            if (day.specialEvent) tags.push(day.specialEvent.name);

            const row = [
                day.date,
                weekday,
                tags.join(', ') || '-',
                day.ratio.toFixed(2),
                cumulative.toFixed(2)
            ];

            if (allocations) {
                cumulativeAlloc += allocations[i];
                row.push(allocations[i], cumulativeAlloc);
            }

            sheetData.push(row);
        });

        const ws = XLSX.utils.aoa_to_sheet(sheetData);

        // 设置列宽
        ws['!cols'] = [
            { wch: 12 },
            { wch: 8 },
            { wch: 20 },
            { wch: 12 },
            { wch: 12 },
            ...(allocations ? [{ wch: 10 }, { wch: 12 }] : [])
        ];

        XLSX.utils.book_append_sheet(wb, ws, vehicle);
    });

    // 生成文件名
    const fileName = `商机日节奏_${state.targetYear}年${state.targetMonth}月_${new Date().getTime()}.xlsx`;
    XLSX.writeFile(wb, fileName);
}

// ============== 横向日期格式导出 ==============
function exportToExcelHorizontal() {
    if (!state.results) {
        alert('请先生成分配比例');
        return;
    }

    const wb = XLSX.utils.book_new();

    // 获取所有车型
    const vehicles = Object.keys(state.results);

    // 获取目标月份的所有日期
    const daysInMonth = getDaysInMonth(state.targetYear, state.targetMonth);
    const dates = [];
    for (let day = 1; day <= daysInMonth; day++) {
        dates.push(`${state.targetMonth}/${day}`);
    }

    // 构建表头：车型 | 日期1 | 日期2 | ... | 日期N | 合计
    const headers = ['车型', ...dates, '合计'];
    const sheetData = [headers];

    // 为每个车型添加一行数据
    vehicles.forEach(vehicle => {
        const ratios = state.results[vehicle];
        const allocations = splitTargetByRatios(vehicle);

        const row = [vehicle];

        // 如果有目标量拆分，使用拆分量；否则使用比例
        if (allocations) {
            // 使用拆分量
            allocations.forEach(alloc => {
                row.push(alloc);
            });
            // 计算合计
            const total = allocations.reduce((sum, val) => sum + val, 0);
            row.push(total);
        } else {
            // 使用比例（保留2位小数）
            ratios.forEach(day => {
                row.push(parseFloat(day.ratio.toFixed(2)));
            });
            // 计算合计
            const total = ratios.reduce((sum, day) => sum + day.ratio, 0);
            row.push(parseFloat(total.toFixed(2)));
        }

        sheetData.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // 设置列宽
    const colWidths = [
        { wch: 10 }, // 车型列
        ...dates.map(() => ({ wch: 8 })), // 日期列
        { wch: 10 } // 合计列
    ];
    ws['!cols'] = colWidths;

    // 添加工作表
    const sheetName = `${state.targetYear}年${state.targetMonth}月`;
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // 生成文件名
    const fileName = `商机日节奏_横向_${state.targetYear}年${state.targetMonth}月_${new Date().getTime()}.xlsx`;
    XLSX.writeFile(wb, fileName);
}

// ============== 暴露到全局作用域 ==============
window.switchVehicle = switchVehicle;
window.removeSpecialEvent = removeSpecialEvent;
