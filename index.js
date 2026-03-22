const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors()); // פותח את השרת לכל בקשה (מונע שגיאות CORS בטלוויזיה)

// ברגע שהטלוויזיה מבקשת פרק, הראוט הזה נכנס לפעולה
app.get('/play/:id', async (req, res) => {
    const fileId = req.params.id;
    const initialUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;

    try {
        console.log(`Fetching direct link for ID: ${fileId}`);
        
        // 1. פנייה לגוגל כדי לקבל את עמוד אזהרת הווירוסים
        const response = await axios.get(initialUrl, {
            maxRedirects: 0, // לא לעקוב אחרי הפניות אוטומטית
            validateStatus: status => status >= 200 && status < 400
        });

        // אם גוגל החזירה לינק ישיר מיד (קורה בקבצים קטנים)
        if (response.status === 302 || response.status === 303) {
            return res.redirect(response.headers.location);
        }

        // 2. חילוץ טוקן האישור (confirm token) והעוגיות מתוך עמוד האזהרה
        const cookies = response.headers['set-cookie'];
        const match = response.data.match(/confirm=([a-zA-Z0-9-_]+)/);

        if (!match) {
            return res.status(404).send("Error: Confirm token not found. Is the file public?");
        }

        const confirmToken = match[1];

        // 3. פנייה חוזרת לגוגל עם הטוקן שאומר "אני מאשר את ההורדה"
        const finalReqUrl = `${initialUrl}&confirm=${confirmToken}`;
        const finalResponse = await axios.get(finalReqUrl, {
            headers: { Cookie: cookies ? cookies.join('; ') : '' },
            maxRedirects: 0,
            validateStatus: status => status >= 200 && status < 400
        });

        if (finalResponse.status === 302 || finalResponse.status === 303) {
            // 4. ניצחון: קיבלנו את הלינק הישיר! מפנים את הטלוויזיה לשם.
            console.log("Success! Redirecting TV to Google Video Servers.");
            return res.redirect(finalResponse.headers.location);
        }

        res.status(500).send("Failed to extract final media link.");

    } catch (error) {
        console.error("Server Error:", error.message);
        res.status(500).send("Internal Server Error");
    }
});

// הפעלת השרת
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Proxy is running on port ${PORT}`);
});