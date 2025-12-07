require("dotenv").config();
const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

// CWA API 設定
const CWA_API_BASE_URL = "https://opendata.cwa.gov.tw/api";
const CWA_API_KEY = process.env.CWA_API_KEY;

// 🎯 1. 城市 ID 與 CWA 中文名稱的對應表
const CITY_NAME_MAPPING = {
    'taipei': '臺北市',
    'newtaipei': '新北市',
    'taoyuan': '桃園市',
    'taichung': '臺中市',
    'tainan': '臺南市',
    'kaohsiung': '高雄市'
    // ⚠️ 注意：此處必須與前端 CITY_MAPPING 的 Key (英文 ID) 保持一致
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- 🎯 2. 修改核心函式以處理動態城市 ---

/**
 * 取得指定城市的天氣預報
 */
const getWeatherByCity = async (req, res) => {
    // 🎯 從 URL 參數中取得前端傳來的城市 ID (例如: 'taipei')
    const cityId = req.params.cityId.toLowerCase();
    
    // 根據 ID 取得 CWA 需要的中文城市名稱 (例如: '臺北市')
    const locationName = CITY_NAME_MAPPING[cityId];

    // 🎯 檢查：確認城市 ID 是否有效
    if (!locationName) {
        return res.status(400).json({
            error: "無效的城市 ID",
            message: `不支援查詢此城市: ${req.params.cityId}，請使用 ${Object.keys(CITY_NAME_MAPPING).join(', ')}`,
        });
    }

    try {
        if (!CWA_API_KEY) {
            return res.status(500).json({
                error: "伺服器設定錯誤",
                message: "請在 .env 檔案中設定 CWA_API_KEY",
            });
        }

        // 呼叫 CWA API - 一般天氣預報（36小時）
        const response = await axios.get(
            `${CWA_API_BASE_URL}/v1/rest/datastore/F-C0032-001`,
            {
                params: {
                    Authorization: CWA_API_KEY,
                    // 🎯 使用動態的中文城市名稱
                    locationName: locationName, 
                },
            }
        );

        // 取得該城市的天氣資料 (確保該資料集只回傳一個城市資料)
        const locationData = response.data.records.location[0]; 

        if (!locationData) {
            return res.status(404).json({
                error: "查無資料",
                message: `無法取得 ${locationName} 天氣資料`,
            });
        }

        // 整理天氣資料 (此部分邏輯不變，因為資料結構相同)
        const weatherData = {
            city: locationData.locationName,
            updateTime: response.data.records.datasetDescription,
            forecasts: [],
        };

        const weatherElements = locationData.weatherElement;
        const timeCount = weatherElements[0].time.length;

        for (let i = 0; i < timeCount; i++) {
            const forecast = {
                startTime: weatherElements[0].time[i].startTime,
                endTime: weatherElements[0].time[i].endTime,
                weather: "",
                rain: "",
                minTemp: "",
                maxTemp: "",
                comfort: "",
                windSpeed: "",
            };

            weatherElements.forEach((element) => {
                const value = element.time[i].parameter;
                switch (element.elementName) {
                    case "Wx":
                        forecast.weather = value.parameterName;
                        break;
                    case "PoP":
                        forecast.rain = value.parameterName + "%";
                        break;
                    case "MinT":
                        forecast.minTemp = value.parameterName;
                        break;
                    case "MaxT":
                        forecast.maxTemp = value.parameterName;
                        break;
                    case "CI":
                        forecast.comfort = value.parameterName;
                        break;
                    case "WS":
                        forecast.windSpeed = value.parameterName;
                        break;
                }
            });

            weatherData.forecasts.push(forecast);
        }

        res.json({
            success: true,
            data: weatherData,
        });

    } catch (error) {
        console.error(`取得 ${locationName} 天氣資料失敗:`, error.message);
        // ... (錯誤處理邏輯保持不變) ...
        if (error.response) {
            return res.status(error.response.status).json({
                error: "CWA API 錯誤",
                message: error.response.data.message || "無法取得天氣資料",
                details: error.response.data,
            });
        }
        res.status(500).json({
            error: "伺服器錯誤",
            message: "無法取得天氣資料，請稍後再試",
        });
    }
};

// --- 🎯 3. 修改路由設定 (Routes) ---

app.get("/", (req, res) => {
    res.json({
        message: "歡迎使用 CWA 天氣預報代理 API",
        endpoints: {
            // 🎯 提示現在使用動態路徑
            weather: "/api/weather/:cityId (支援: taipei, kaohsiung 等)",
            health: "/api/health",
        },
    });
});

app.get("/api/health", (req, res) => {
    res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// 🎯 使用動態參數 :cityId 來匹配所有六都的請求
// 注意：這個路徑 '/api/weather/:cityId' 必須與你的前端 BASE_API_URL 保持一致
app.get("/api/weather/:cityId", getWeatherByCity);


// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: "伺服器錯誤",
        message: err.message,
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: "找不到此路徑",
        message: `您請求的路徑: ${req.method} ${req.originalUrl} 不存在`,
    });
});

app.listen(PORT, () => {
    console.log(`🚀 伺服器運行已運作: http://localhost:${PORT}`);
    console.log(`📍 環境: ${process.env.NODE_ENV || "development"}`);
});