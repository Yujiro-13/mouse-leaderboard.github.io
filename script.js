// グローバル変数
let bleDevice = null;
let bleCharacteristic = null;
let timerInterval = null;
let timerSeconds = 300; // 5分 = 300秒
let isTimerRunning = false;

// リアルタイム計測タイマー
let measurementTimer = null;
let measurementStartTime = 0;
let isMeasuring = false;

// データ保存用
let currentRecordsList = [];
let allRankingData = JSON.parse(localStorage.getItem('rankingData') || '[]');
let entryList = [];
let currentEntryIndex = 0;

// 自動記録モード
let autoRecordMode = false;

// 初期化
document.addEventListener('DOMContentLoaded', function() {
    loadSavedData();
    loadDefaultCSV(); // デフォルトCSVの読み込み
    updateDisplay();
    updateRealtimeButtonState(); // ボタン状態の初期化
});

// データ保存・読み込み
function saveData() {
    const data = {
        entryNumber: document.getElementById('entryNumber').value,
        entryName: document.getElementById('entryName').value,
        robotName: document.getElementById('robotName').value,
        currentRound: document.getElementById('currentRound').value,
        currentRecords: currentRecordsList,
        rankingData: allRankingData,
        entryList: entryList,
        currentEntryIndex: currentEntryIndex,
        autoRecordMode: autoRecordMode
    };
    localStorage.setItem('racingData', JSON.stringify(data));
    localStorage.setItem('rankingData', JSON.stringify(allRankingData));
}

function loadSavedData() {
    const saved = JSON.parse(localStorage.getItem('racingData') || '{}');
    if (saved.entryNumber) document.getElementById('entryNumber').value = saved.entryNumber;
    if (saved.entryName) document.getElementById('entryName').value = saved.entryName;
    if (saved.robotName) document.getElementById('robotName').value = saved.robotName;
    if (saved.currentRound) document.getElementById('currentRound').value = saved.currentRound;
    if (saved.currentRecords) currentRecordsList = saved.currentRecords;
    if (saved.entryList) entryList = saved.entryList;
    if (saved.currentEntryIndex !== undefined) currentEntryIndex = saved.currentEntryIndex;
    if (saved.autoRecordMode !== undefined) {
        autoRecordMode = saved.autoRecordMode;
        document.getElementById('autoRecordMode').checked = autoRecordMode;
        toggleAutoRecord();
    }
    updateDisplay();
}

// BLE接続
async function connectBLE() {
    try {
        console.log('BLE接続を開始...');
        bleDevice = await navigator.bluetooth.requestDevice({
            filters: [
                { namePrefix: 'ESP32' },
                { services: ['12345678-1234-1234-1234-123456789abc'] }
            ],
            optionalServices: ['12345678-1234-1234-1234-123456789abc']
        });

        const server = await bleDevice.gatt.connect();
        const service = await server.getPrimaryService('12345678-1234-1234-1234-123456789abc');
        bleCharacteristic = await service.getCharacteristic('87654321-4321-4321-4321-cba987654321');

        // 通知を有効化
        await bleCharacteristic.startNotifications();
        bleCharacteristic.addEventListener('characteristicvaluechanged', handleBLEData);

        document.getElementById('connectionStatus').textContent = 'BLE接続中';
        document.getElementById('connectionStatus').className = 'connection-status connected';
        
        console.log('BLE接続成功');
    } catch (error) {
        console.error('BLE接続エラー:', error);
        alert('BLE接続に失敗しました: ' + error.message);
    }
}

async function disconnectBLE() {
    if (bleDevice && bleDevice.gatt.connected) {
        bleDevice.gatt.disconnect();
        document.getElementById('connectionStatus').textContent = '未接続';
        document.getElementById('connectionStatus').className = 'connection-status disconnected';
        console.log('BLE切断完了');
    }
}

// BLEデータ受信処理
function handleBLEData(event) {
    const value = new TextDecoder().decode(event.target.value);
    console.log('BLEデータ受信:', value);
    
    if (value === 'START') {
        // ESP32からスタート信号受信 - リアルタイム計測開始
        startRealTimeMeasurement();
        // ボタン状態を更新
        updateRealtimeButtonState();
        console.log('ESP32計測開始');
    } else if (value.startsWith('TIME:')) {
        // タイムデータの形式 (例: "TIME:12.345")
        const timeValue = value.replace('TIME:', '');
        
        // リアルタイム計測を停止
        stopRealTimeMeasurement();
        // ボタン状態を更新
        updateRealtimeButtonState();
        
        // ESP32のタイムでリアルタイムタイマーを上書き（最終確定値）
        document.getElementById('realtimeTimer').textContent = timeValue;
        document.getElementById('realtimeTimer').style.color = '#e53e3e';
        
        // 前回結果として表示（receivedTime）
        document.getElementById('receivedTime').textContent = timeValue;
        document.getElementById('manualTime').value = timeValue;
        
        // 自動記録モードの場合、自動で記録追加
        if (autoRecordMode) {
            setTimeout(() => {
                addCurrentTimeAuto();
            }, 500); // 0.5秒後に自動追加
        }
        
        console.log('ESP32計測タイム確定:', timeValue);
    } else if (value === 'RESTART') {
        // ESP32からリスタート信号受信 - タイマーリセット
        stopRealTimeMeasurement();
        document.getElementById('realtimeTimer').textContent = '00.000';
        document.getElementById('realtimeTimer').style.color = '#1a202c';
        // ボタン状態を更新
        updateRealtimeButtonState();
        console.log('ESP32リスタート信号受信 - タイマーリセット');
    } else if (value === 'READY') {
        // ESP32がリセット完了 - 新しい走行準備
        document.getElementById('realtimeTimer').textContent = '00.000';
        document.getElementById('realtimeTimer').style.color = '#38a169';
        console.log('ESP32リセット完了');
    }
}

// タイマー機能
function toggleTimer() {
    if (isTimerRunning) {
        stopTimer();
    } else {
        startTimer();
    }
}

function startTimer() {
    if (!isTimerRunning) {
        isTimerRunning = true;
        timerInterval = setInterval(updateTimer, 1000);
        updateTimerButton();
    }
}

function stopTimer() {
    isTimerRunning = false;
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    updateTimerButton();
}

function resetTimer() {
    stopTimer();
    timerSeconds = 300;
    updateTimerDisplay();
    updateTimerButton();
}

function updateTimer() {
    if (timerSeconds > 0) {
        timerSeconds--;
        updateTimerDisplay();
    } else {
        stopTimer();
        alert('⏰ タイムアップ！');
    }
}

function updateTimerDisplay() {
    const minutes = Math.floor(timerSeconds / 60);
    const seconds = timerSeconds % 60;
    document.getElementById('timerDisplay').textContent = 
        String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
}

function updateTimerButton() {
    const toggleBtn = document.getElementById('toggleTimerBtn');
    if (isTimerRunning) {
        toggleBtn.textContent = 'ストップ';
        toggleBtn.className = 'button danger';
    } else {
        toggleBtn.textContent = 'スタート';
        toggleBtn.className = 'button success';
    }
}

// 記録管理
function updateReceivedTime() {
    const manualTime = document.getElementById('manualTime').value;
    if (manualTime) {
        document.getElementById('receivedTime').textContent = manualTime;
    }
}

function addCurrentTime() {
    const timeValue = document.getElementById('receivedTime').textContent;
    if (timeValue && timeValue !== '00.000' && timeValue !== '未記録') {
        const currentRound = parseInt(document.getElementById('currentRound').value);
        currentRecordsList.push({
            round: currentRound,
            time: parseFloat(timeValue),
            type: 'time'
        });
        
        updateDisplay();
        saveData();
        
        // 走行回数を記録数と自動同期
        updateRoundFromRecords();
        
        // 前回結果は次回のゴール時まで保持（リセットしない）
        // manualTimeのみクリア
        document.getElementById('manualTime').value = '';
    }
}

function addCurrentTimeAuto() {
    const timeValue = document.getElementById('receivedTime').textContent;
    if (timeValue && timeValue !== '00.000' && timeValue !== '未記録') {
        const currentRound = parseInt(document.getElementById('currentRound').value);
        currentRecordsList.push({
            round: currentRound,
            time: parseFloat(timeValue),
            type: 'time'
        });
        
        updateDisplay();
        saveData();
        
        // 走行回数を記録数と自動同期
        updateRoundFromRecords();
        
        // 前回結果は次回のゴール時まで保持（リセットしない）
        // manualTimeのみクリア
        document.getElementById('manualTime').value = '';
        
        console.log(`第${currentRound}走のタイムを自動記録: ${timeValue}秒`);
    }
}

function addRetiredRecord() {
    const currentRound = parseInt(document.getElementById('currentRound').value);
    currentRecordsList.push({
        round: currentRound,
        time: null,
        type: 'retired'
    });
    
    updateDisplay();
    saveData();
    
    // 走行回数を記録数と自動同期
    updateRoundFromRecords();
    
    console.log(`第${currentRound}走をリタイアとして記録`);
}

function clearCurrentRecords() {
    if (confirm('現在の記録をすべて削除しますか？')) {
        currentRecordsList = [];
        
        // 走行回数を1回に戻す
        document.getElementById('currentRound').value = 1;
        updateRound();
        
        updateDisplay();
        saveData();
    }
}

function toggleAutoRecord() {
    autoRecordMode = document.getElementById('autoRecordMode').checked;
    const indicator = document.getElementById('autoRecordIndicator');
    
    if (autoRecordMode) {
        indicator.style.display = 'inline-block';
        console.log('自動記録モードをONにしました');
    } else {
        indicator.style.display = 'none';
        console.log('自動記録モードをOFFにしました');
    }
    
    saveData();
}

// 表示更新
function updateData() {
    saveData();
}

function updateRound() {
    const round = document.getElementById('currentRound').value;
    document.getElementById('roundDisplay').textContent = round + ' / 5';
    saveData();
}

// 記録数から走行回数を自動更新
function updateRoundFromRecords() {
    const recordCount = currentRecordsList.length;
    const nextRound = recordCount + 1;
    
    // 最大5回まで
    if (nextRound <= 5) {
        document.getElementById('currentRound').value = nextRound;
        updateRound();
        console.log(`走行回数を記録数と同期: ${nextRound}回目`);
    } else {
        // 5回を超えた場合は5のまま
        document.getElementById('currentRound').value = 5;
        updateRound();
    }
}

function updateDisplay() {
    // 現在の記録表示
    const recordsContainer = document.getElementById('currentRecords');
    if (currentRecordsList.length === 0) {
        recordsContainer.innerHTML = '<div style="text-align: center; color: #718096;">記録がありません</div>';
    } else {
        recordsContainer.innerHTML = currentRecordsList.map((record, index) => {
            if (record.type === 'retired') {
                return `<div class="record-item retired">
                    <span>第${record.round}走</span>
                    <span style="font-weight: bold; color: #e53e3e;">R (リタイア)</span>
                    <button class="button" onclick="removeRecord(${index})" style="padding: 5px 10px; font-size: 12px;">削除</button>
                </div>`;
            } else {
                return `<div class="record-item">
                    <span>第${record.round}走</span>
                    <span style="font-weight: bold; color: #667eea;">${record.time.toFixed(3)}秒</span>
                    <button class="button" onclick="removeRecord(${index})" style="padding: 5px 10px; font-size: 12px;">削除</button>
                </div>`;
            }
        }).join('');
    }

    // ベストタイム表示（リタイアを除く）
    const validTimes = currentRecordsList.filter(record => record.type === 'time').map(record => record.time);
    if (validTimes.length > 0) {
        const bestTime = Math.min(...validTimes);
        document.getElementById('currentBestTime').textContent = `ベスト: ${bestTime.toFixed(3)}秒`;
        
        // 順位計算
        calculateCurrentPosition(bestTime);
    } else {
        document.getElementById('currentBestTime').textContent = 'ベスト: --.-';
        document.getElementById('currentPosition').textContent = '-位';
    }

    updateRankingDisplay();
}

function removeRecord(index) {
    currentRecordsList.splice(index, 1);
    
    // 走行回数を記録数と同期（リタイア含む）
    updateRoundFromRecords();
    
    updateDisplay();
    saveData();
}

function calculateCurrentPosition(currentBest) {
    let position = 1;
    for (const entry of allRankingData) {
        if (entry.bestTime < currentBest) {
            position++;
        }
    }
    document.getElementById('currentPosition').textContent = position + '位';
}

function updateRanking() {
    const entryName = document.getElementById('entryName').value || '無名';
    const entryNumber = document.getElementById('entryNumber').value || '#000';
    const robotName = document.getElementById('robotName').value || 'ロボット';
    
    const validTimes = currentRecordsList.filter(record => record.type === 'time').map(record => record.time);
    if (validTimes.length === 0) {
        alert('有効な記録がありません。まず走行記録を追加してください。');
        return;
    }

    const bestTime = Math.min(...validTimes);
    
    // 既存エントリーを更新または新規追加
    const existingIndex = allRankingData.findIndex(entry => 
        entry.name === entryName || entry.number === entryNumber
    );
    
    if (existingIndex >= 0) {
        allRankingData[existingIndex] = {
            name: entryName,
            number: entryNumber,
            robotName: robotName,
            bestTime: bestTime
        };
    } else {
        allRankingData.push({
            name: entryName,
            number: entryNumber,
            robotName: robotName,
            bestTime: bestTime
        });
    }

    // ソート
    allRankingData.sort((a, b) => a.bestTime - b.bestTime);
    
    updateDisplay();
    saveData();
    alert('ランキングを更新しました！');
}

function clearRanking() {
    if (confirm('総合ランキングをすべてクリアしますか？\nこの操作は元に戻せません。')) {
        allRankingData = [];
        updateDisplay();
        saveData();
        alert('ランキングをクリアしました。');
    }
}

function updateRankingDisplay() {
    const rankingContainer = document.getElementById('rankingList');
    if (allRankingData.length === 0) {
        rankingContainer.innerHTML = '<div style="text-align: center; color: #718096; margin: 20px 0;">ランキングデータがありません</div>';
        return;
    }

    const top5 = allRankingData.slice(0, 5);
    rankingContainer.innerHTML = top5.map((entry, index) => {
        const medals = ['1. ', '2. ', '3. ', '4. ', '5. '];
        const displayName = entry.robotName ? 
            `<strong>${entry.robotName}</strong> (${entry.name})` : 
            `<strong>${entry.name}</strong> (${entry.number})`;
        return `<div class="ranking-item">
            <div>
                <span style="font-size: 1.5em;">${medals[index]}</span>
                ${displayName}
            </div>
            <div style="font-size: 1.2em; font-weight: bold; color: #667eea;">
                ${entry.bestTime.toFixed(3)}秒
            </div>
        </div>`;
    }).join('');
}

// 初期表示更新
updateTimerDisplay();
updateTimerButton();
updateRound();

// リアルタイム計測機能
function startRealTimeMeasurement() {
    measurementStartTime = performance.now(); // 高精度タイマー
    isMeasuring = true;
    
    // より高速な更新を実現（複数の方法を併用）
    updateRealTimeDisplay(); // 即座に開始
    
    // 補助的に高速setTimeoutも併用（可能な限り高速化）
    if (measurementTimer) clearTimeout(measurementTimer);
    fastUpdate();
    
    console.log('Web側リアルタイム計測開始');
}

function fastUpdate() {
    if (isMeasuring) {
        updateRealTimeDisplay();
        // 1ms指定（実際は4-5msになる）
        measurementTimer = setTimeout(fastUpdate, 1);
    }
}

function stopRealTimeMeasurement() {
    isMeasuring = false;
    if (measurementTimer) {
        clearTimeout(measurementTimer);
        measurementTimer = null;
    }
    console.log('Web側リアルタイム計測停止');
}

function updateRealTimeDisplay() {
    if (isMeasuring && measurementStartTime) {
        const currentTime = performance.now();
        const elapsedSeconds = (currentTime - measurementStartTime) / 1000;
        document.getElementById('realtimeTimer').textContent = elapsedSeconds.toFixed(3);
        
        // requestAnimationFrameで次の更新をスケジュール（最高速）
        if (isMeasuring) {
            requestAnimationFrame(updateRealTimeDisplay);
        }
    }
}

// CSV関連機能
async function loadDefaultCSV() {
    try {
        const response = await fetch('entry_lists.csv');
        if (response.ok) {
            const csvText = await response.text();
            parseCSV(csvText);
            console.log('デフォルトCSVファイルを読み込みました');
        } else {
            console.log('デフォルトCSVファイルが見つかりません');
            // デフォルトエントリーを設定
            entryList = [
                { number: '#001', name: 'エントリー1', robotName: 'ロボット1' },
                { number: '#002', name: 'エントリー2', robotName: 'ロボット2' },
                { number: '#003', name: 'エントリー3', robotName: 'ロボット3' },
                { number: '#004', name: 'エントリー4', robotName: 'ロボット4' },
                { number: '#005', name: 'エントリー5', robotName: 'ロボット5' }
            ];
            setCurrentEntry();
        }
    } catch (error) {
        console.error('CSVファイル読み込みエラー:', error);
        // デフォルトエントリーを設定
        entryList = [
            { number: '#001', name: 'エントリー1', robotName: 'ロボット1' },
            { number: '#002', name: 'エントリー2', robotName: 'ロボット2' },
            { number: '#003', name: 'エントリー3', robotName: 'ロボット3' },
            { number: '#004', name: 'エントリー4', robotName: 'ロボット4' },
            { number: '#005', name: 'エントリー5', robotName: 'ロボット5' }
        ];
        setCurrentEntry();
    }
}

function loadCSV() {
    document.getElementById('csvFile').click();
}

function handleCSVFile(event) {
    const file = event.target.files[0];
    if (file && file.type === 'text/csv') {
        const reader = new FileReader();
        reader.onload = function(e) {
            const csvText = e.target.result;
            parseCSV(csvText);
            alert('CSVファイルを読み込みました！');
        };
        reader.readAsText(file, 'UTF-8');
    } else {
        alert('CSVファイルを選択してください。');
    }
}

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    entryList = [];
    
    // ヘッダー行をスキップ（1行目）
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            const columns = line.split(',').map(col => col.trim().replace(/"/g, ''));
            if (columns.length >= 2) {
                entryList.push({
                    number: columns[0],
                    name: columns[1],
                    robotName: columns[2] || '' // 3列目があればロボット名、なければ空文字
                });
            }
        }
    }
    
    currentEntryIndex = 0;
    setCurrentEntry();
    saveData();
}

function setCurrentEntry() {
    if (entryList.length > 0 && currentEntryIndex < entryList.length) {
        const entry = entryList[currentEntryIndex];
        document.getElementById('entryNumber').value = entry.number;
        document.getElementById('entryName').value = entry.name;
        document.getElementById('robotName').value = entry.robotName || '';
    }
}

function loadNextEntry() {
    if (entryList.length === 0) {
        alert('エントリーリストが読み込まれていません。CSVファイルを読み込んでください。');
        return;
    }

    // 次のエントリーへ移動
    currentEntryIndex = (currentEntryIndex + 1) % entryList.length;
    
    // リセット処理（総合ランキング以外）
    resetCurrentEntryData();
    
    // 新しいエントリー情報を設定
    setCurrentEntry();
    
    alert(`次のエントリー者: ${entryList[currentEntryIndex].name} に移動しました`);
    saveData();
}

function resetCurrentEntryData() {
    // 現在の記録をクリア
    currentRecordsList = [];
    
    // ラウンドを1にリセット
    document.getElementById('currentRound').value = 1;
    
    // タイマーをリセット
    resetTimer();
    
    // 計測タイムをリセット（前回の結果を「未記録」表示）
    document.getElementById('receivedTime').textContent = '未記録';
    document.getElementById('manualTime').value = '';
    
    // 表示を更新
    updateDisplay();
    updateRound();
}

// リアルタイムタイマーの手動操作機能
function toggleRealtimeTimer() {
    if (isMeasuring) {
        // 停止
        stopRealTimeMeasurement();
        console.log('リアルタイムタイマー手動停止');
    } else {
        // 開始
        startRealTimeMeasurement();
        console.log('リアルタイムタイマー手動開始');
    }
    // ボタン状態を更新
    updateRealtimeButtonState();
}

function resetRealtimeTimer() {
    // タイマーを停止
    stopRealTimeMeasurement();
    
    // 表示をリセット
    document.getElementById('realtimeTimer').textContent = '00.000';
    document.getElementById('realtimeTimer').style.color = '#1a202c';
    
    // ボタン状態を更新
    updateRealtimeButtonState();
    
    console.log('リアルタイムタイマーリセット');
}

// ボタンの状態を現在のタイマー状態に合わせて更新
function updateRealtimeButtonState() {
    const button = document.getElementById('realtimeToggleBtn');
    
    if (isMeasuring) {
        // タイマー動作中
        button.textContent = 'ストップ';
        button.className = 'button danger';
    } else {
        // タイマー停止中
        button.textContent = 'スタート';
        button.className = 'button success';
    }
}
