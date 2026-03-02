// ============== 可视化图表模块（汇总版本 - 修复版）==============
// 此文件为 demo.html 专用，实现汇总数据的拖拽调整功能

let chartInstance = null;
let chartData = {
    labels: [],
    originalAmounts: [],     // 原始汇总数量
    adjustedAmounts: [],     // 调整后的汇总数量
    vehicleBreakdown: [],    // 各车型分解数据 [{W01: 100, W02: 50, ...}, ...]
    adjustments: {},         // 记录调整 { dateIndex: newAmount }
    monthlyTarget: 0,        // 月度目标总量
    adjustedVehicleData: {}  // 存储调整后的各车型实际数量 {vehicle: [amounts...]}
};

let isDragging = false;
let dragBarIndex = null;
let chartVisible = true;
let autoSwitchTimer = null; // 存储定时器ID
let userHasSwitched = false; // 标记用户是否手动切换过标签
let switchInProgress = false; // 防止并发切换
let originalSplitTargetByRatios = null; // 保存原始的拆分函数引用

// ============== 初始化图表 ==============
function initializeChart() {
    // Hook 原有的 displayResults
    const originalDisplayResults = window.displayResults;

    window.displayResults = function() {
        // 先执行原逻辑
        originalDisplayResults.call(this);

        // 重置用户切换标志
        userHasSwitched = false;

        // 清除之前的定时器（避免多次点击生成时积累定时器）
        if (autoSwitchTimer) {
            clearTimeout(autoSwitchTimer);
        }

        // 添加"汇总"标签页
        addSummaryTab();

        // 只在用户没有手动切换时才自动切换到汇总
        autoSwitchTimer = setTimeout(() => {
            if (!userHasSwitched) {
                window.switchVehicle('__SUMMARY__');
            }
        }, 100);
    };

    // Hook 原有的 switchVehicle
    const originalSwitchVehicle = window.switchVehicle;

    window.switchVehicle = function(vehicle) {
        console.log('[demo-chart] switchVehicle called with:', vehicle, 'current:', state.currentVehicle);
        console.log('[demo-chart] vehicle type:', typeof vehicle, 'is string:', typeof vehicle === 'string', 'exact value:', JSON.stringify(vehicle));
        console.log('[demo-chart] switchInProgress:', switchInProgress);

        // 防止并发切换
        if (switchInProgress) {
            console.log('[demo-chart] Switch already in progress, ignoring call');
            return;
        }

        switchInProgress = true;

        // 标记用户已经手动切换过（阻止自动切换到汇总）
        userHasSwitched = true;

        // 取消任何待处理的自动切换定时器
        if (autoSwitchTimer) {
            console.log('[demo-chart] Cancelling pending autoSwitchTimer');
            clearTimeout(autoSwitchTimer);
            autoSwitchTimer = null;
        }

        try {
            if (vehicle === '__SUMMARY__') {
                // 切换到汇总视图
                state.currentVehicle = '__SUMMARY__';
                console.log('[demo-chart] Switching to SUMMARY view');
                showSummaryView();

                // 更新标签状态
                document.querySelectorAll('.vehicle-tab').forEach(tab => {
                    tab.classList.remove('active');
                });
                document.querySelector(`.vehicle-tab[data-vehicle="${vehicle}"]`)?.classList.add('active');

                switchInProgress = false;
                console.log('[demo-chart] SUMMARY switch completed, switchInProgress reset to false');
                return; // 关键：不要继续执行原逻辑
            }

            console.log('[demo-chart] Calling originalSwitchVehicle for vehicle:', vehicle);
            // 原有车型切换逻辑
            originalSwitchVehicle.call(this, vehicle);
            console.log('[demo-chart] After originalSwitchVehicle, state.currentVehicle:', state.currentVehicle);

            // 重新添加汇总标签（因为renderVehicleTabs会清空所有标签）
            addSummaryTab();

            // 隐藏图表
            const chartArea = document.getElementById('chartAdjustmentArea');
            if (chartArea) {
                chartArea.style.display = 'none';
            }

            // 确保结果表格区域可见
            const comparisonLayout = document.querySelector('.comparison-layout');
            if (comparisonLayout) {
                comparisonLayout.style.display = '';
            }

            // 更新标签状态
            document.querySelectorAll('.vehicle-tab').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelector(`.vehicle-tab[data-vehicle="${vehicle}"]`)?.classList.add('active');

            switchInProgress = false;
            console.log('[demo-chart] Vehicle switch completed, switchInProgress reset to false');
        } catch (error) {
            switchInProgress = false;
            console.error('[demo-chart] Error during switchVehicle:', error);
            throw error;
        }
    };

    // Hook renderVehicleTabs 函数，确保汇总标签不会消失
    const originalRenderVehicleTabs = window.renderVehicleTabs;
    if (originalRenderVehicleTabs) {
        window.renderVehicleTabs = function(vehicles) {
            // 调用原始函数
            originalRenderVehicleTabs.call(this, vehicles);
            // 重新添加汇总标签
            addSummaryTab();
        };
    }

    // Hook renderSummary 函数，避免汇总视图报错
    const originalRenderSummary = window.renderSummary;
    if (originalRenderSummary) {
        window.renderSummary = function(vehicle) {
            // 汇总视图不调用原始renderSummary，使用专门的函数
            if (vehicle === '__SUMMARY__') {
                renderSummarySummary();
                return;
            }
            // 正常车型调用原始逻辑
            originalRenderSummary.call(this, vehicle);
        };
    }

    // Hook updateTargetInput 函数，处理汇总视图
    const originalUpdateTargetInput = window.updateTargetInput;
    window.updateTargetInput = function(vehicle) {
        console.log('[demo-chart] updateTargetInput called with:', vehicle, 'currentVehicle:', state.currentVehicle);
        console.log('[demo-chart] vehicle type:', typeof vehicle, 'vehicle === "__SUMMARY__":', vehicle === '__SUMMARY__');

        if (vehicle === '__SUMMARY__') {
            // 汇总视图使用专门的函数
            console.log('[demo-chart] Calling updateSummaryTargetInput');
            updateSummaryTargetInput();
            return;
        }
        // 正常车型：调用原逻辑即可，不需要额外处理
        console.log('[demo-chart] Calling originalUpdateTargetInput for:', vehicle);
        originalUpdateTargetInput.call(this, vehicle);
        console.log('[demo-chart] After originalUpdateTargetInput, checking DOM state...');

        // 验证DOM状态
        const vehicleTargetLabel = document.getElementById('targetVehicleLabel');
        const vehicleTargetInput = document.getElementById('vehicleTargetInput');
        console.log('[demo-chart] DOM after update - label:', vehicleTargetLabel?.textContent, 'disabled:', vehicleTargetInput?.disabled);
    };

    // Hook splitTargetByRatios 函数，使用调整后的数据
    originalSplitTargetByRatios = window.splitTargetByRatios; // 保存到全局变量
    window.splitTargetByRatios = function(vehicle) {
        // 如果有调整数据且不为空，直接返回
        if (chartData.adjustedVehicleData[vehicle] && chartData.adjustedVehicleData[vehicle].length > 0) {
            return chartData.adjustedVehicleData[vehicle];
        }
        // 否则使用原逻辑
        return originalSplitTargetByRatios.call(this, vehicle);
    };

    // 初始化控制按钮
    document.getElementById('resetAdjustmentBtn')?.addEventListener('click', resetAdjustments);
    document.getElementById('toggleChartBtn')?.addEventListener('click', toggleChart);
}

// ============== 添加汇总标签 ==============
function addSummaryTab() {
    const vehicleTabs = document.getElementById('vehicleTabs');
    if (!vehicleTabs) {
        console.warn('[addSummaryTab] vehicleTabs元素不存在');
        return;
    }

    // 检查是否已存在汇总标签
    const existingTab = document.querySelector('.vehicle-tab[data-vehicle="__SUMMARY__"]');
    if (existingTab) {
        console.log('[addSummaryTab] 汇总标签已存在，跳过添加');
        return;
    }

    console.log('[addSummaryTab] 创建汇总标签');

    // 在第一个位置插入汇总标签
    const summaryTab = document.createElement('div');
    summaryTab.className = 'vehicle-tab';
    summaryTab.setAttribute('data-vehicle', '__SUMMARY__');
    summaryTab.textContent = '📊 汇总';
    summaryTab.onclick = function(e) {
        console.log('[addSummaryTab] 汇总标签被点击');
        console.log('[addSummaryTab] Event target:', e.target);
        console.log('[addSummaryTab] 调用 window.switchVehicle("__SUMMARY__")');
        window.switchVehicle('__SUMMARY__');
    };

    vehicleTabs.insertBefore(summaryTab, vehicleTabs.firstChild);
    console.log('[addSummaryTab] 汇总标签已添加到DOM');
}

// ============== 显示汇总视图 ==============
function showSummaryView() {
    console.log('[showSummaryView] 开始显示汇总视图');
    console.log('[showSummaryView] 设置 state.currentVehicle = "__SUMMARY__"');

    state.currentVehicle = '__SUMMARY__';

    // 计算汇总数据
    calculateSummaryData();

    console.log('[showSummaryView] 显示图表区域');
    // 显示图表区域
    const chartArea = document.getElementById('chartAdjustmentArea');
    if (chartArea) {
        chartArea.style.display = 'block';
    }

    // 创建/更新图表
    createSummaryChart();

    console.log('[showSummaryView] 渲染汇总表格');
    // 渲染汇总表格
    renderSummaryTable();

    console.log('[showSummaryView] 更新目标量输入');
    // 更新目标量输入
    updateSummaryTargetInput();

    console.log('[showSummaryView] 汇总视图显示完成，当前 state.currentVehicle:', state.currentVehicle);
}

// ============== 计算汇总数据 ==============
function calculateSummaryData() {
    console.log('[calculateSummaryData] 开始计算汇总数据');

    if (!state.results) {
        console.warn('[calculateSummaryData] state.results 不存在');
        return;
    }

    const vehicles = Object.keys(state.results).filter(v => v !== '__SUMMARY__');
    if (vehicles.length === 0) {
        console.warn('[calculateSummaryData] 没有车型数据');
        return;
    }

    console.log('[calculateSummaryData] 车型列表:', vehicles);

    const daysInMonth = state.results[vehicles[0]].length;
    console.log('[calculateSummaryData] 月份天数:', daysInMonth);

    // 重置所有数据
    chartData.labels = [];
    chartData.originalAmounts = [];
    chartData.vehicleBreakdown = [];

    // 如果没有手动调整，重新初始化adjustedVehicleData
    const hasManualAdjustments = Object.keys(chartData.adjustments).length > 0;
    console.log('[calculateSummaryData] 是否有手动调整:', hasManualAdjustments);

    if (!hasManualAdjustments) {
        chartData.adjustedVehicleData = {};
        vehicles.forEach(vehicle => {
            chartData.adjustedVehicleData[vehicle] = [];
        });
    }

    // 计算每日汇总
    for (let dayIndex = 0; dayIndex < daysInMonth; dayIndex++) {
        const dateObj = state.results[vehicles[0]][dayIndex];
        const date = new Date(dateObj.date);
        chartData.labels.push(`${date.getMonth() + 1}/${date.getDate()}`);

        let dayTotal = 0;
        const breakdown = {};

        vehicles.forEach(vehicle => {
            const dayRatio = state.results[vehicle][dayIndex].ratio;
            const vehicleTarget = state.vehicleTargets[vehicle] || 0;

            let amount = 0;
            if (vehicleTarget > 0) {
                // 如果有目标量，使用实际拆分量
                // 在初始化阶段，直接调用原始函数避免循环依赖
                const allocations = originalSplitTargetByRatios ?
                    originalSplitTargetByRatios.call(window, vehicle) :
                    null;

                if (allocations && dayIndex < allocations.length && allocations[dayIndex] !== undefined) {
                    amount = allocations[dayIndex];
                } else {
                    console.warn(`[calculateSummaryData] 无法获取 ${vehicle} 第${dayIndex}天的拆分量，使用0`);
                    amount = 0;
                }
            } else {
                // 否则使用比例（假设基数100）
                amount = dayRatio || 0;
            }

            // 确保amount是有效数字
            if (isNaN(amount) || !isFinite(amount)) {
                console.error(`[calculateSummaryData] ${vehicle} 第${dayIndex}天的amount无效:`, amount, '使用0代替');
                amount = 0;
            }

            breakdown[vehicle] = amount;
            dayTotal += amount;

            // 只在没有手动调整时初始化
            if (!hasManualAdjustments) {
                chartData.adjustedVehicleData[vehicle][dayIndex] = amount;
            }
        });

        chartData.originalAmounts.push(dayTotal);
        chartData.vehicleBreakdown.push(breakdown);
    }

    console.log('[calculateSummaryData] originalAmounts 长度:', chartData.originalAmounts.length);
    console.log('[calculateSummaryData] originalAmounts 前3天:', chartData.originalAmounts.slice(0, 3));

    // 如果没有调整过，使用原始数据；否则需要重新应用调整
    if (!hasManualAdjustments) {
        // 没有手动调整，直接使用原始数据
        chartData.adjustedAmounts = [...chartData.originalAmounts];
    } else {
        // 有手动调整，需要根据调整重新计算
        chartData.adjustedAmounts = chartData.originalAmounts.map((originalAmount, index) => {
            if (chartData.adjustments[index] !== undefined) {
                return chartData.adjustments[index];
            }
            return originalAmount;
        });
    }

    console.log('[calculateSummaryData] adjustedAmounts 长度:', chartData.adjustedAmounts.length);
    console.log('[calculateSummaryData] adjustedAmounts 前3天:', chartData.adjustedAmounts.slice(0, 3));

    // 计算月度目标总量
    chartData.monthlyTarget = chartData.originalAmounts.reduce((sum, val) => sum + val, 0);
    console.log('[calculateSummaryData] 月度目标总量:', chartData.monthlyTarget);
}

// ============== 创建汇总图表 ==============
function createSummaryChart() {
    const canvas = document.getElementById('ratioChart');
    const ctx = canvas.getContext('2d');

    // 销毁旧图表
    if (chartInstance) {
        chartInstance.destroy();
    }

    // 判断显示实际量还是比例
    const hasTarget = Object.values(state.vehicleTargets || {}).some(t => t > 0);
    const yAxisLabel = hasTarget ? '实际量' : '比例 (%)';

    // 创建新图表
    chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: `汇总 ${yAxisLabel}`,
                data: chartData.adjustedAmounts,
                backgroundColor: function(context) {
                    const index = context.dataIndex;
                    if (chartData.adjustments[index]) {
                        return 'rgba(255, 149, 0, 0.7)';  // 已调整：橙色
                    }
                    return 'rgba(19, 102, 236, 0.8)';  // 未调整：蓝色
                },
                borderColor: function(context) {
                    const index = context.dataIndex;
                    if (chartData.adjustments[index]) {
                        return '#FF6B00';  // 已调整：橙色边框
                    }
                    return 'transparent';
                },
                borderWidth: 3,
                borderRadius: 6,
                hoverBackgroundColor: 'rgba(19, 102, 236, 0.9)',
                datalabels: {
                    align: 'end',
                    anchor: 'end',
                    color: '#1a1a1a',
                    font: {
                        size: 11,
                        weight: 'bold'
                    },
                    formatter: function(value) {
                        return hasTarget ? Math.round(value) : value.toFixed(1) + '%';
                    },
                    display: true
                }
            }]
        },
        plugins: [ChartDataLabels],
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top'
                },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            const index = context[0].dataIndex;
                            const vehicles = Object.keys(state.results).filter(v => v !== '__SUMMARY__');
                            const dateObj = state.results[vehicles[0]][index];
                            return dateObj.date;
                        },
                        label: function(context) {
                            const index = context.dataIndex;
                            const value = context.parsed.y;
                            const original = chartData.originalAmounts[index];

                            const lines = [
                                `当前总量: ${hasTarget ? Math.round(value) : value.toFixed(2) + '%'}`,
                                `原始总量: ${hasTarget ? Math.round(original) : original.toFixed(2) + '%'}`
                            ];

                            if (chartData.adjustments[index]) {
                                const change = value - original;
                                const changePercent = ((change / original) * 100).toFixed(1);
                                lines.push(`调整: ${change > 0 ? '+' : ''}${hasTarget ? Math.round(change) : change.toFixed(2) + '%'} (${changePercent > 0 ? '+' : ''}${changePercent}%)`);
                            }

                            return lines;
                        },
                        afterLabel: function(context) {
                            const index = context.dataIndex;
                            const vehicles = Object.keys(state.results).filter(v => v !== '__SUMMARY__');

                            if (vehicles.length > 0) {
                                const lines = ['', '车型分解:'];
                                vehicles.forEach(v => {
                                    const amt = chartData.adjustedVehicleData[v]?.[index] || chartData.vehicleBreakdown[index][v];
                                    lines.push(`  ${v}: ${hasTarget ? Math.round(amt) : amt.toFixed(2) + '%'}`);
                                });
                                return lines.join('\n');
                            }
                            return '';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: yAxisLabel,
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        callback: function(value) {
                            return hasTarget ? Math.round(value) : value.toFixed(1) + '%';
                        }
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: '日期',
                        font: {
                            size: 12,
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        autoSkip: true,
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            }
        }
    });

    // 绑定拖拽事件
    bindDragEvents(canvas);

    // 更新统计信息
    updateAdjustmentStats();
}

// ============== 拖拽功能 ==============
function bindDragEvents(canvas) {
    let startY = 0;
    let startValue = 0;
    let lastUpdateTime = 0;
    const updateInterval = 50; // 50ms 更新一次，避免过于频繁

    canvas.addEventListener('mousedown', function(e) {
        const elements = chartInstance.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);

        if (elements.length > 0) {
            isDragging = true;
            dragBarIndex = elements[0].index;
            startY = e.clientY - canvas.getBoundingClientRect().top;
            startValue = chartData.adjustedAmounts[dragBarIndex];
            canvas.style.cursor = 'grabbing';
        }
    });

    canvas.addEventListener('mousemove', function(e) {
        if (!isDragging || dragBarIndex === null) return;

        const rect = canvas.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const deltaY = startY - y;

        // 计算新值
        const yScale = chartInstance.scales.y;
        const valuePerPixel = (yScale.max - yScale.min) / yScale.height;
        const deltaValue = deltaY * valuePerPixel;

        let newValue = startValue + deltaValue;

        // 限制范围
        newValue = Math.max(0, newValue);

        // 更新数据
        chartData.adjustedAmounts[dragBarIndex] = newValue;
        chartData.adjustments[dragBarIndex] = newValue;

        // 更新图表
        chartInstance.update('none');

        // 节流更新表格和统计信息（避免过于频繁）
        const now = Date.now();
        if (now - lastUpdateTime > updateInterval) {
            lastUpdateTime = now;

            // 反向分配到各车型
            redistributeToVehicles();

            // 实时更新表格和统计
            renderSummaryTable();
            updateAdjustmentStats();
            updateSummaryTargetInput();
        }
    });

    canvas.addEventListener('mouseup', function() {
        if (isDragging) {
            isDragging = false;

            // 最终更新一次（确保数据准确）
            redistributeToVehicles();
            chartInstance.update();
            renderSummaryTable();
            updateAdjustmentStats();
            updateSummaryTargetInput();

            canvas.style.cursor = 'grab';
            dragBarIndex = null;
        }
    });

    canvas.addEventListener('mouseleave', function() {
        if (isDragging) {
            isDragging = false;
            redistributeToVehicles();
            chartInstance.update();
            renderSummaryTable();
            updateAdjustmentStats();
            updateSummaryTargetInput();
            canvas.style.cursor = 'default';
            dragBarIndex = null;
        }
    });

    canvas.addEventListener('mouseover', function(e) {
        const elements = chartInstance.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
        canvas.style.cursor = elements.length > 0 ? 'grab' : 'default';
    });
}

// ============== 反向分配到各车型（保持月度总量不变）==============
function redistributeToVehicles() {
    const vehicles = Object.keys(state.results).filter(v => v !== '__SUMMARY__');
    const hasTarget = Object.values(state.vehicleTargets || {}).some(t => t > 0);

    if (!hasTarget) {
        // 没有目标量时，使用简单的比例缩放
        chartData.adjustedAmounts.forEach((newTotal, dayIndex) => {
            const originalTotal = chartData.originalAmounts[dayIndex];
            if (originalTotal === 0) return;

            const scaleFactor = newTotal / originalTotal;
            vehicles.forEach(vehicle => {
                const originalAmount = chartData.vehicleBreakdown[dayIndex][vehicle];
                const newAmount = originalAmount * scaleFactor;

                if (!chartData.adjustedVehicleData[vehicle]) {
                    chartData.adjustedVehicleData[vehicle] = [];
                }
                chartData.adjustedVehicleData[vehicle][dayIndex] = newAmount;
                chartData.vehicleBreakdown[dayIndex][vehicle] = newAmount;
            });
        });
        return;
    }

    // 有目标量时：保持各车型月度总量不变，只调整日分配
    const daysInMonth = chartData.adjustedAmounts.length;

    // 获取被调整的天
    const adjustedDays = Object.keys(chartData.adjustments).map(k => parseInt(k));

    if (adjustedDays.length === 0) return;

    // 对每个车型进行重新分配
    vehicles.forEach(vehicle => {
        const monthlyTarget = state.vehicleTargets[vehicle] || 0;
        if (monthlyTarget <= 0) return;

        // 初始化该车型的调整数据
        if (!chartData.adjustedVehicleData[vehicle]) {
            chartData.adjustedVehicleData[vehicle] = [];
        }

        // 第一步：计算被调整天该车型的新分配量（使用精确整数分配）
        let adjustedDaysTotal = 0;
        adjustedDays.forEach(dayIndex => {
            const dayNewTotal = Math.round(chartData.adjustedAmounts[dayIndex]);
            const dayOriginalTotal = chartData.originalAmounts[dayIndex];

            if (dayOriginalTotal === 0) return;

            // 该车型在这一天的原始占比
            const vehicleOriginalAmount = chartData.vehicleBreakdown[dayIndex][vehicle];
            const vehicleRatioInDay = vehicleOriginalAmount / dayOriginalTotal;

            // 该车型在这一天的新量（按占比分配，但先不取整）
            const vehicleNewAmountExact = dayNewTotal * vehicleRatioInDay;

            // 暂存精确值，稍后统一取整
            chartData.adjustedVehicleData[vehicle][dayIndex] = vehicleNewAmountExact;
            adjustedDaysTotal += vehicleNewAmountExact;
        });

        // 对被调整天进行精确整数分配
        const adjustedDaysAllocations = adjustedDays.map(dayIndex => ({
            dayIndex,
            exactValue: chartData.adjustedVehicleData[vehicle][dayIndex]
        }));

        const floorAllocations = adjustedDaysAllocations.map(item => ({
            dayIndex: item.dayIndex,
            floor: Math.floor(item.exactValue),
            remainder: item.exactValue - Math.floor(item.exactValue)
        }));

        let adjustedDaysDistributed = floorAllocations.reduce((sum, item) => sum + item.floor, 0);
        const adjustedDaysExtra = Math.round(adjustedDaysTotal) - adjustedDaysDistributed;

        floorAllocations.sort((a, b) => b.remainder - a.remainder);

        // 重新分配被调整天的整数值
        adjustedDaysTotal = 0;
        floorAllocations.forEach((item, index) => {
            let finalValue = item.floor;
            if (index < adjustedDaysExtra) {
                finalValue++;
            }
            chartData.adjustedVehicleData[vehicle][item.dayIndex] = finalValue;
            adjustedDaysTotal += finalValue;
        });

        // 第二步：计算未调整天需要分配的总量
        const unadjustedDaysTarget = monthlyTarget - adjustedDaysTotal;

        // 第三步：收集未调整天的信息
        const unadjustedDays = [];
        let unadjustedOriginalTotal = 0;

        for (let dayIndex = 0; dayIndex < daysInMonth; dayIndex++) {
            if (!adjustedDays.includes(dayIndex)) {
                const originalAmount = chartData.vehicleBreakdown[dayIndex][vehicle];
                unadjustedDays.push({ dayIndex, originalAmount });
                unadjustedOriginalTotal += originalAmount;
            }
        }

        // 第四步：按原始比例重新分配未调整天（使用精确整数分配）
        if (unadjustedOriginalTotal > 0 && unadjustedDays.length > 0) {
            // 使用精确分配避免舍入误差
            const exactAllocations = unadjustedDays.map(({ dayIndex, originalAmount }) => ({
                dayIndex,
                exactValue: (originalAmount / unadjustedOriginalTotal) * unadjustedDaysTarget
            }));

            // 先全部向下取整
            const floorAllocations = exactAllocations.map(item => ({
                dayIndex: item.dayIndex,
                floor: Math.floor(item.exactValue),
                remainder: item.exactValue - Math.floor(item.exactValue)
            }));

            // 计算已分配量
            let distributed = floorAllocations.reduce((sum, item) => sum + item.floor, 0);
            const extra = Math.round(unadjustedDaysTarget) - distributed;

            // 按余数降序排列
            floorAllocations.sort((a, b) => b.remainder - a.remainder);

            // 分配余量
            floorAllocations.forEach((item, index) => {
                let finalValue = item.floor;
                if (index < extra) {
                    finalValue++;
                }
                chartData.adjustedVehicleData[vehicle][item.dayIndex] = finalValue;
            });
        }
    });

    // 第五步：重新计算未调整天的汇总总量
    for (let dayIndex = 0; dayIndex < daysInMonth; dayIndex++) {
        if (!adjustedDays.includes(dayIndex)) {
            let dayTotal = 0;
            vehicles.forEach(vehicle => {
                dayTotal += chartData.adjustedVehicleData[vehicle][dayIndex] || 0;
            });
            chartData.adjustedAmounts[dayIndex] = dayTotal;
        }
    }

    // 更新各车型的表格显示
    vehicles.forEach(vehicle => {
        updateVehicleTableDisplay(vehicle);
    });
}

// ============== 更新车型表格显示 ==============
function updateVehicleTableDisplay() {
    // 如果有调整数据，强制刷新该车型的显示
    // 但不改变 state.results，保持原始比例不变
    // 导出时会优先使用 adjustedVehicleData
}

// ============== 渲染汇总表格 ==============
function renderSummaryTable() {
    const resultsBody = document.getElementById('resultsBody');
    const resultsTableHead = document.querySelector('#resultsTable thead tr');

    const vehicles = Object.keys(state.results).filter(v => v !== '__SUMMARY__');
    if (vehicles.length === 0) {
        console.warn('[renderSummaryTable] 没有车型数据');
        return;
    }

    if (!state.results[vehicles[0]] || state.results[vehicles[0]].length === 0) {
        console.error('[renderSummaryTable] 车型结果数据为空');
        return;
    }

    const hasTarget = Object.values(state.vehicleTargets || {}).some(t => t > 0);

    // 更新表头
    resultsTableHead.innerHTML = `
        <th>日期</th>
        <th>星期</th>
        <th>汇总${hasTarget ? '数量' : '比例'}</th>
        <th>调整</th>
        <th>累计</th>
    `;

    let cumulative = 0;

    // 确保数据长度一致 - 使用最小值
    const vehicleDataLength = state.results[vehicles[0]].length;
    const dataLength = Math.min(
        chartData.adjustedAmounts ? chartData.adjustedAmounts.length : 0,
        chartData.originalAmounts ? chartData.originalAmounts.length : 0,
        vehicleDataLength
    );

    console.log('[renderSummaryTable] 数据长度检查:', {
        adjustedAmounts: chartData.adjustedAmounts ? chartData.adjustedAmounts.length : 0,
        originalAmounts: chartData.originalAmounts ? chartData.originalAmounts.length : 0,
        vehicleResults: vehicleDataLength,
        usingLength: dataLength
    });

    if (dataLength === 0) {
        console.error('[renderSummaryTable] 数据长度为0，无法渲染');
        resultsBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#F53F3F;">数据错误：无法加载汇总数据</td></tr>';
        return;
    }

    const rows = [];
    for (let dayIndex = 0; dayIndex < dataLength; dayIndex++) {
        const amount = chartData.adjustedAmounts[dayIndex];
        cumulative += amount;

        const dateObj = state.results[vehicles[0]][dayIndex];
        if (!dateObj || !dateObj.date) {
            console.error('[renderSummaryTable] dateObj 为空或缺少 date 字段 at index:', dayIndex);
            continue;
        }

        const date = new Date(dateObj.date);
        const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
        const weekday = weekdays[date.getDay()];

        const original = chartData.originalAmounts[dayIndex];
        const change = amount - original;
        const isAdjusted = Math.abs(change) > 0.01;

        let rowClass = '';
        if (isAdjusted) {
            rowClass = 'special-event';
        } else if (dateObj.isWeekend) {
            rowClass = 'weekend';
        } else if (dateObj.holiday) {
            rowClass = 'holiday';
        }

        let adjustmentCell = '-';
        if (isAdjusted) {
            const changePercent = ((change / original) * 100).toFixed(1);
            const color = change > 0 ? '#00B578' : '#F53F3F';
            adjustmentCell = `<span style="color:${color};font-weight:600">${change > 0 ? '+' : ''}${hasTarget ? Math.round(change) : change.toFixed(2)} (${changePercent}%)</span>`;
        }

        rows.push(`
            <tr class="${rowClass}">
                <td>${dateObj.date}</td>
                <td>${weekday}</td>
                <td><strong>${hasTarget ? Math.round(amount) : amount.toFixed(2) + '%'}</strong></td>
                <td>${adjustmentCell}</td>
                <td>${hasTarget ? Math.round(cumulative) : cumulative.toFixed(2) + '%'}</td>
            </tr>
        `);
    }

    resultsBody.innerHTML = rows.join('');

    // 更新摘要
    renderSummarySummary();
}

// ============== 渲染汇总摘要 ==============
function renderSummarySummary() {
    const summaryInfo = document.getElementById('summaryInfo');
    const hasTarget = Object.values(state.vehicleTargets || {}).some(t => t > 0);

    if (!chartData.adjustedAmounts || chartData.adjustedAmounts.length === 0) {
        console.error('[renderSummarySummary] adjustedAmounts 为空');
        summaryInfo.innerHTML = '<p style="color:#F53F3F;">数据错误</p>';
        return;
    }

    const total = chartData.adjustedAmounts.reduce((sum, val) => sum + val, 0);
    const avg = total / chartData.adjustedAmounts.length;
    const maxAmount = Math.max(...chartData.adjustedAmounts);
    const minAmount = Math.min(...chartData.adjustedAmounts);
    const maxIndex = chartData.adjustedAmounts.indexOf(maxAmount);
    const minIndex = chartData.adjustedAmounts.indexOf(minAmount);

    const vehicles = Object.keys(state.results).filter(v => v !== '__SUMMARY__');

    // 添加边界检查
    if (!state.results[vehicles[0]] ||
        maxIndex >= state.results[vehicles[0]].length ||
        minIndex >= state.results[vehicles[0]].length) {
        console.error('[renderSummarySummary] 数组索引越界', {
            maxIndex,
            minIndex,
            vehicleDataLength: state.results[vehicles[0]] ? state.results[vehicles[0]].length : 0
        });
        summaryInfo.innerHTML = '<p style="color:#F53F3F;">数据错误：索引越界</p>';
        return;
    }

    const maxDateObj = state.results[vehicles[0]][maxIndex];
    const minDateObj = state.results[vehicles[0]][minIndex];

    if (!maxDateObj || !minDateObj || !maxDateObj.date || !minDateObj.date) {
        console.error('[renderSummarySummary] dateObj 为空或缺少 date 字段');
        summaryInfo.innerHTML = '<p style="color:#F53F3F;">数据错误：缺少日期信息</p>';
        return;
    }

    summaryInfo.innerHTML = `
        <h3>汇总统计</h3>
        <div class="summary-grid">
            <div class="summary-item">
                <div class="label">月度总量</div>
                <div class="value">${hasTarget ? Math.round(total) : total.toFixed(2) + '%'}</div>
            </div>
            <div class="summary-item">
                <div class="label">日均量</div>
                <div class="value">${hasTarget ? Math.round(avg) : avg.toFixed(2) + '%'}</div>
            </div>
            <div class="summary-item">
                <div class="label">最高日</div>
                <div class="value" style="font-size:14px">${maxDateObj.date}<br>${hasTarget ? Math.round(maxAmount) : maxAmount.toFixed(2) + '%'}</div>
            </div>
            <div class="summary-item">
                <div class="label">最低日</div>
                <div class="value" style="font-size:14px">${minDateObj.date}<br>${hasTarget ? Math.round(minAmount) : minAmount.toFixed(2) + '%'}</div>
            </div>
        </div>
    `;
}

// ============== 更新统计信息 ==============
function updateAdjustmentStats() {
    const adjustedCount = Object.keys(chartData.adjustments).filter(idx => {
        const original = chartData.originalAmounts[idx];
        const adjusted = chartData.adjustedAmounts[idx];
        return Math.abs(adjusted - original) > 0.01;
    }).length;

    let maxChange = 0;
    Object.keys(chartData.adjustments).forEach(idx => {
        const original = chartData.originalAmounts[idx];
        const adjusted = chartData.adjustedAmounts[idx];
        const changePercent = Math.abs((adjusted - original) / original * 100);
        if (changePercent > maxChange) {
            maxChange = changePercent;
        }
    });

    const totalRatio = chartData.adjustedAmounts.reduce((sum, val) => sum + val, 0);
    const hasTarget = Object.values(state.vehicleTargets || {}).some(t => t > 0);

    document.getElementById('adjustedDaysCount').textContent = adjustedCount;
    document.getElementById('maxAdjustment').textContent = maxChange.toFixed(1) + '%';
    document.getElementById('totalRatio').textContent = hasTarget ? Math.round(totalRatio) : totalRatio.toFixed(2) + '%';
}

// ============== 更新目标量输入 ==============
function updateSummaryTargetInput() {
    console.log('[demo-chart] updateSummaryTargetInput called, currentVehicle:', state.currentVehicle);

    // 安全检查：如果当前不是汇总视图，不要覆盖DOM
    if (state.currentVehicle !== '__SUMMARY__') {
        console.warn('[demo-chart] updateSummaryTargetInput BLOCKED - currentVehicle is not __SUMMARY__:', state.currentVehicle);
        return;
    }

    console.log('[demo-chart] updateSummaryTargetInput proceeding to update DOM');
    const targetSplitArea = document.getElementById('targetSplitArea');
    const vehicleTargetLabel = document.getElementById('targetVehicleLabel');
    const vehicleTargetInput = document.getElementById('vehicleTargetInput');

    targetSplitArea.style.display = '';
    vehicleTargetLabel.textContent = '汇总';

    const vehicles = Object.keys(state.results).filter(v => v !== '__SUMMARY__');
    let totalTarget = 0;

    // 检查是否有手动拖拽调整
    const hasAdjustments = Object.keys(chartData.adjustments).length > 0;

    if (hasAdjustments) {
        // 如果有拖拽调整，使用调整后的实际量
        vehicles.forEach(vehicle => {
            const adjustedData = chartData.adjustedVehicleData[vehicle];
            if (adjustedData && adjustedData.length > 0) {
                totalTarget += adjustedData.reduce((sum, val) => sum + val, 0);
            }
        });
    } else {
        // 如果没有调整，直接累加各车型的目标量
        vehicles.forEach(vehicle => {
            const vehicleTarget = state.vehicleTargets[vehicle] || 0;
            totalTarget += vehicleTarget;
        });
    }

    vehicleTargetInput.value = totalTarget > 0 ? Math.round(totalTarget) : '';
    vehicleTargetInput.disabled = true;

    document.getElementById('targetSplitFeedback').textContent = hasAdjustments
        ? '汇总目标已根据拖拽调整自动计算'
        : '各车型目标总和';
    document.getElementById('targetSplitFeedback').className = 'target-split-feedback hint';
    document.getElementById('clearTargetBtn').style.display = 'none';
}

// ============== 重置调整 ==============
function resetAdjustments() {
    if (!confirm('确定要重置所有手动调整吗？')) return;

    console.log('[resetAdjustments] 开始重置调整');

    // 清空所有调整记录
    chartData.adjustments = {};
    chartData.adjustedVehicleData = {};

    // 重新计算汇总数据（会重新初始化所有数据）
    calculateSummaryData();

    console.log('[resetAdjustments] 重新计算后 adjustedAmounts 长度:', chartData.adjustedAmounts.length);

    // 更新图表
    if (chartInstance) {
        chartInstance.data.datasets[0].data = chartData.adjustedAmounts;
        chartInstance.update();
        console.log('[resetAdjustments] 图表已更新');
    }

    // 更新表格和统计
    renderSummaryTable();
    updateAdjustmentStats();
    updateSummaryTargetInput();

    console.log('[resetAdjustments] 重置完成');
}

// ============== 切换图表显示 ==============
function toggleChart() {
    const chartContainer = document.querySelector('.chart-adjustment-area');
    const toggleBtn = document.getElementById('toggleChartBtn');

    chartVisible = !chartVisible;

    if (chartVisible) {
        chartContainer.style.display = 'block';
        toggleBtn.textContent = '收起图表';
    } else {
        chartContainer.style.display = 'none';
        toggleBtn.textContent = '展开图表';
    }
}

// ============== 页面加载后初始化 ==============
document.addEventListener('DOMContentLoaded', function() {
    initializeChart();

    console.log('📊 汇总可视化拖拽模块已加载');
    console.log('💡 提示：切换到"汇总"标签可拖拽调整总量');
});
