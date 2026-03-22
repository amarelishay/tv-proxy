const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/play/:id', async (req, res) => {
    const fileId = req.params.id;
    const initialUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

    try {
        console.log(`Starting stream pipeline for ID: ${fileId}`);
        
        // 1. קבלת עמוד האזהרה
        const response = await axios.get(initialUrl, {
            maxRedirects: 0,
            validateStatus: status => status >= 200 && status < 400
        });

        let finalReqUrl = initialUrl;
        let cookies = '';

        // 2. חילוץ הטוקן (אם קיים עמוד אזהרה)
        if (response.status === 200 && response.data.includes('confirm=')) {
            const match = response.data.match(/confirm=([a-zA-Z0-9-_]+)/);
            if (match) {
                finalReqUrl = `${initialUrl}&confirm=${match[1]}`;
                const cookieArray = response.headers['set-cookie'];
                cookies = cookieArray ? cookieArray.join('; ') : '';
            }
        } else if (response.status === 302 || response.status === 303) {
            // קבצים קטנים שעוברים ישירות
            finalReqUrl = response.headers.location;
        }

        // --- הארכיטקטורה החדשה: Streaming Pipe ---
        // השרת מתחבר לגוגל, שואב את הווידאו, ומזרים אותו חזרה לטלוויזיה
        const streamConfig = {
            method: 'GET',
            url: finalReqUrl,
            responseType: 'stream', // חובה להזרמת מדיה
            headers: {}
        };

        if (cookies) streamConfig.headers['Cookie'] = cookies;
        
        // העברת בקשת המיקום (הרצה קדימה/אחורה) מהטלוויזיה לגוגל
        if (req.headers.range) {
            streamConfig.headers['Range'] = req.headers.range;
        }

        const streamResponse = await axios(streamConfig);

        // העברת הסטטוס המדויק לטלוויזיה (למשל 206 Partial Content)
        res.status(streamResponse.status);
        
        // העברת כל הכותרות הרלוונטיות (משקל, סוג קובץ וכו')
        for (const [key, value] of Object.entries(streamResponse.headers)) {
            if(key.toLowerCase() !== 'transfer-encoding') {
                res.setHeader(key, value);
            }
        }

        // חיבור הצינור (Pipe) מגוגל, דרך השרת, ישירות לטלוויזיה
        streamResponse.data.pipe(res);

    } catch (error) {
        console.error("Pipeline Error:", error.message);
        res.status(500).send("Error streaming the video.");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Streaming Proxy is running on port ${PORT}`);
});
