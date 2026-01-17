const express = require('express');
const cors = require('cors');
// const fetch = require('node-fetch');  <--- XÓA HOẶC COMMENT DÒNG NÀY ĐI
// Node.js v18 trở lên đã có sẵn fetch, không cần thư viện này nữa.

// Thêm path để chắc chắn tìm đúng file .env
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

app.post('/api/ask-ai', async (req, res) => {
    try {
        // keyType được gửi từ game.js ('general' hoặc 'powerup')
        const { messages, model, temperature, response_format, keyType, max_tokens } = req.body;

        // Chọn Key dựa trên loại yêu cầu
        let apiKey = process.env.GROQ_API_KEY; 
        if (keyType === 'powerup') {
            apiKey = process.env.GROQ_POWERUP_KEY;
        }

        const response = await fetch(GROQ_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${apiKey}` // Server tự đính kèm Key vào đây
            },
            body: JSON.stringify({
                model: model || "llama-3.1-8b-instant",
                messages: messages,
                temperature: temperature || 0.5,
                max_tokens: max_tokens || 100,
                response_format: response_format
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Groq API Error: ${response.status} - ${errText}`);
        }

        const data = await response.json();
        res.json(data);

    } catch (error) {
        console.error("Server Error:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.listen(PORT, () => {
    console.log(`🛡️  Server đang chạy tại http://localhost:${PORT}`);
});