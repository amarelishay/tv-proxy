const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/play/:id', async (req, res) => {
    const fileId = req.params.id;
    const initialUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

    try {
        console.log(`Phase 1: Fetching initial link for ${fileId}`);
        const initialRes = await axios.get(initialUrl, {
            maxRedirects: 0,
            validateStatus: null // לאפשר לכל סטטוס לעבור בלי לזרוק שגיאה
        });

        let directMediaUrl = null;
        let cookies = '';

        if (initialRes.status === 302 || initialRes.status === 303) {
            // קובץ קטן - גוגל מפנה ישירות לווידאו
            directMediaUrl = initialRes.headers.location;
        } else if (initialRes.status === 200) {
            // קובץ גדול - חסימת סריקת וירוסים
            console.log('Phase 2: Bypassing virus scan warning...');
            
            // 1. שמירת עוגיית האבטחה
            if (initialRes.headers['set-cookie']) {
                cookies = initialRes.headers['set-cookie'].join('; ');
            }

            // 2. חילוץ הלינק המדויק של כפתור ההורדה מה-HTML
            const match = initialRes.data.match(/href="(\/uc\?export=download(?:&amp;|&)[^"]+)"/i);
            if (!match) {
                throw new Error("Could not find download link in warning page.");
            }

            // ניקוי הלינק מתווי HTML ויצירת לינק מלא
            const bypassPath = match[1].replace(/&amp;/g, '&');
            const bypassUrl = `https://drive.google.com${bypassPath}`;

            // 3. הגשת הבקשה עם העוגייה כדי לקבל את הלינק הסופי
            const bypassRes = await axios.get(bypassUrl, {
                headers: { 'Cookie': cookies },
                maxRedirects: 0,
                validateStatus: null
            });

            if (bypassRes.status === 302 || bypassRes.status === 303) {
                directMediaUrl = bypassRes.headers.location;
            } else {
                throw new Error("Bypass request did not return a redirect to video.");
            }
        } else {
            throw new Error(`Unexpected status from Drive: ${initialRes.status}`);
        }

        if (!directMediaUrl) {
            throw new Error("Failed to extract direct media URL.");
        }

        console.log('Phase 3: Streaming video directly to TV...');

        // הגענו ליעד: מזרימים את הווידאו הנקי לטלוויזיה
        const streamConfig = {
            method: 'GET',
            url: directMediaUrl,
            responseType: 'stream',
            headers: {}
        };

        // העברת פקודת "הרצה קדימה" (Range) מהטלוויזיה לגוגל
        if (req.headers.range) {
            streamConfig.headers['Range'] = req.headers.range;
        }

        const streamRes = await axios(streamConfig);

        // שיקוף הסטטוס (למשל 206 להזרמה חלקית)
        res.status(streamRes.status);

        // העברת כל כותרות המדיה (משקל הקובץ, סוג וכו')
        for (const [key, value] of Object.entries(streamRes.headers)) {
            if (key.toLowerCase() !== 'transfer-encoding') {
                res.setHeader(key, value);
            }
        }

        // חיבור הצינור
        streamRes.data.pipe(res);

    } catch (error) {
        console.error("Proxy Error:", error.message);
        res.status(500).send("Video Streaming Error");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Streaming Proxy is running on port ${PORT}`);
});
